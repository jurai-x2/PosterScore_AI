import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { RawAnalysis } from "./analysis.js";
import type { AnalysisContext } from "../src/types.js";
import type { ImageMeasurements } from "./validation.js";
import { factsFromMeasurements, rulePromptText, type Facts, type RuleResult } from "./rules.js";
import { ProviderError, classifyProviderError, withProviderRetries } from "./provider.js";
import { hasMinimumTime, MIN_REMAINING_MS, providerCallTimeoutMs, remainingMilliseconds } from "./budget.js";

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_RETRY_ATTEMPTS = 2;

const systemPrompt = `You are a rigorous visual design director reviewing the supplied image itself. Return only valid JSON matching the requested schema.

First classify the image. A poster is a designed visual intended to communicate a message, promote something, announce something, or direct an audience. Screenshots of apps, dashboards, websites, documents, selfies, photographs, logos, and arbitrary images are not posters unless the visible image itself is clearly a poster design. For a non-poster set isPoster=false, posterType=General, explain notPosterReason, set every check score to 0, and give concise upload guidance.

For a poster, infer type and purpose from visible evidence. Score seven distinct dimensions: Layout & hierarchy (eye path, alignment, balance, spacing); Typography (font choice, pairing, scale, line breaks); Readability & contrast (contrast, viewing distance, line length, busy backgrounds); Imagery / graphics (relevance, resolution, crop, integration); Message & CTA (message clarity and action visibility); Color (palette, contrast, accent use); Branding (recognition and consistency only when brand information or a visible logo makes it judgeable). Information clarity is folded into layout, readability, and message rather than scored separately.

For every category return 2–3 concise checks scored 0–10, with each check no longer than 180 characters. Each check must name a concrete criterion and cite visible evidence. Do not return a category score, overallScore, ratingLabel, or weighted math: the backend calculates those from the check scores. Score each dimension independently; equal scores are acceptable when the evidence supports them, but do not reuse the same evidence sentence across categories.

Apply the user's target platform, goal, audience, and brand context when provided. If the image is too small, text is unreadable, or a measurement cannot be trusted, lower confidence and say what could not be judged. Perform a three-second squint test: state what a viewer notices first, second, and third and whether that order serves the intended purpose. Never invent text, logos, offers, fonts, or CTAs that cannot be seen. Treat legibility, hierarchy, structure, spacing, and message clarity as the most reliable judgments. Treat style, aesthetic taste, and concept direction as subjective suggestions: label them as suggestions and support them with visible evidence; never state them as objective facts or imply that they match top-designer taste.

Every improvement must include its affected category, the observed problem, separate visible evidence, why it hurts the poster's purpose, and a practical recommendation. Return no more than six improvements. Add an approximate x/y anchor from 0–100 only when you can locate the issue on the image; omit anchor otherwise. Do not use generic advice.`;

const critiquePrompt = `The report must also contain an art-director critique. Start by creating elementMap with stable lowercase kebab-case IDs for only visible poster elements, such as headline, image, supporting copy, CTA, logo, or background. Use those exact IDs everywhere in critique. Do not invent an element that cannot be seen.

Use this strict scoring anchor: 0–2 means absent or broken, 3–4 weak, 5 adequate, 6–7 solid, 8 strong, and 9–10 exceptional. Most posters should land between 3 and 7; use 8–10 only when visible evidence clearly supports it. Score each criterion independently and do not make every category equal without different evidence. Do not present a subjective style or concept preference as a measured score; frame it as a suggestion in the relevant fix or polish item. Calibration data, when available, should be used to assess which judgments are reliable rather than to claim universal taste.

The critique must include intent (statement, audience, desiredAction, unclear, evidence), 1–2 rootCauses with target IDs, oneBigMove with one target ID, no more than three topFixes, keep items, and polish items. Each topFix must include target, criterion, problem, evidence, measuredValue, fix, whyItMatters, and expectedResult. measuredValue must be an objective image fact or explicitly labelled visual estimate; never pretend to have OCR, font-size, or WCAG measurements. Every critique sentence must name its target ID in square brackets or cite an objective image metric. If overall score is likely below 6/10, include exactly two alternativeDirections with name, concept, and layout; the backend removes them from stronger reports.`;

const processPrompt = `You are a senior art director reviewing a poster for a client who wants to improve it drastically. Be direct, specific and constructive. You interpret the poster, judge the concept, explain why failures matter to viewers, and write quantified fixes. The code owns measured facts, rule results, score caps, and the final score.

RULE_RESULTS are facts. Never contradict a failed rule, report a passed rule as a problem, or claim anything about a skipped rule. Heuristic rules are rules of thumb; a deliberate, effective exception may be kept and described as a suggestion rather than treated as an objective failure. Do not output a final score. Score the eight criteria strictly from 0–10; most posters should score 3–7, 9–10 is rare, and any failed critical or major rule must be reflected in that criterion.

Every fix must name an element ID and quantify what to change, by how much or to what, and where. Prefer removing and simplifying. Keep objective structural feedback separate from subjective style or concept suggestions. Return only valid JSON matching the existing response schema.`;

function contextText(context: AnalysisContext, measurements: ImageMeasurements) {
  return `User context: target platform=${context.targetPlatform}; goal=${context.goal || "not provided"}; audience=${context.audience || "not provided"}; brand information=${context.brandInfo || "not provided"}.
Objective image facts (measurements, not judgments): ${measurements.width}x${measurements.height}px, ${measurements.orientation}, aspect ratio ${measurements.aspectRatio}, dominant colors ${measurements.dominantColors.join(", ") || "unknown"}, estimated whitespace ${measurements.estimatedWhitespacePercent}%, estimated high-contrast/image coverage ${measurements.estimatedImageCoveragePercent}%. Treat these as clues and explain limitations rather than claiming they are OCR or WCAG measurements.`;
}

function positiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, Math.floor(parsed))) : fallback;
}

function modelCandidates() {
  const configured = process.env.GEMINI_VISION_MODEL?.trim() || DEFAULT_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([configured, ...fallbacks])];
}

export function buildUserMessage(facts: Facts, results: RuleResult[], previousErrors: string[]) {
  const failed = results.filter((result) => !result.passed && !result.skipped);
  const passed = results.filter((result) => result.passed && !result.skipped).map((result) => result.ruleId);
  const skipped = results.filter((result) => result.skipped || result.status === "not_evaluated").map((result) => result.ruleId);
  return `POSTER_TYPE: ${facts.posterType}\nDETECTION_CONFIDENCE: ${facts.detectionConfidence}\n\nELEMENTS:\n${JSON.stringify(facts.elements.map((element) => ({ id: element.id, kind: element.kind, text: element.text, bbox: element.bbox, fontSizePct: element.fontSizePct, contrast: element.contrast, saliency: element.saliency, font: element.fontFamily, align: element.align })), null, 1)}\n\nGLOBAL_METRICS: palette=${facts.paletteCount}, whitespace=${facts.whitespaceRatio}, words=${facts.wordCount}, direction=${facts.direction}\n\nFAILED_RULES (${failed.length}):\n${failed.map((result) => `- [${result.severity}] ${result.ruleId} (${result.criterion}, basis: ${result.basis}): ${result.evidence}`).join("\n") || "none"}\n\nPASSED_RULES: ${passed.join(", ") || "none"}\nSKIPPED_RULES (do not comment): ${skipped.join(", ") || "none"}\n\n${previousErrors.length ? `YOUR PREVIOUS ANSWER WAS REJECTED FOR THESE REASONS. Fix every one:\n${previousErrors.map((error) => `- ${error}`).join("\n")}\n\n` : ""}Critique this poster.`.trim();
}

function requestText(context: AnalysisContext, measurements: ImageMeasurements, qcIssues: string[], ruleResults: RuleResult[], facts: Facts) {
  const correctionInstruction = qcIssues.length
    ? `Act as a skeptical critic on this correction pass. Find why the previous analysis was unreliable, then return a corrected replacement. Fix these QC issues: ${qcIssues.join("; ")}`
    : "This is the first pass. Be specific and evidence-led.";
  return `${systemPrompt}\n\n${processPrompt}\n\n${critiquePrompt}\n\n${contextText(context, measurements)}\n\n${buildUserMessage(facts, ruleResults, qcIssues)}\n\nDeterministic rule results are ground truth. Do not contradict a failed rule, claim a not_evaluated rule was measured, or praise a critical area that failed. Address every failed critical rule in oneBigMove or topFixes.\n${rulePromptText(ruleResults)}\n\nReturn this exact JSON shape: { isPoster, posterType, posterPurpose, brandingApplicable, notPosterReason, confidence, limitations, firstNotice, secondNotice, thirdNotice, targetOrderAssessment, overallSummary, elementMap: [{ id, label, location }], critique: { intent: { statement, audience, desiredAction, unclear, evidence }, rootCauses: [{ target, cause, evidence }], oneBigMove: { target, change }, topFixes: [{ target, criterion, problem, evidence, measuredValue, fix, whyItMatters, expectedResult }], keep: [{ target, whatWorks }], alternativeDirections?: [{ name, concept, layout }], polish: [{ target, item }] }, categories: { layoutHierarchy, typography, readabilityContrast, imagery, messageCta, color, branding }, strengths, improvements }. Each category is { checks: [{ name, score: integer 0-10, evidence }], strengths: string[], issues: string[] }. Each improvement is { priority: "HIGH" | "MEDIUM" | "LOW", category: one of the seven category keys, title, problem, evidence, whyItMatters, recommendation, anchor?: { x: 0-100, y: 0-100 } }. For a poster provide 2–4 checks per category, 3–5 overall strengths, 1–2 root causes, 1–3 topFixes, and 2–6 prioritized improvements. For a non-poster, set elementMap to [{ id: "uploaded-image", label: "Uploaded image", location: "Full frame" }], use posterType=General, notPosterReason, zero-scored checks, one upload-guidance improvement, and target the critique fields to uploaded-image. ${correctionInstruction}`;
}

function asProviderError(error: unknown, model: string, retryCount = 0) {
  if (error instanceof ProviderError) return new ProviderError(error.message, error.failure, { model, retryCount });
  const failure = classifyProviderError(error);
  return new ProviderError("Gemini provider request failed.", failure, { model, retryCount });
}

export type GeminiAnalysisOptions = { requestId?: string; ruleResults?: RuleResult[]; facts?: Facts; deadlineAt?: number; providerCallTimeoutMs?: number; minimumRemainingMs?: number };

export function shouldTryFallback(category: ReturnType<typeof classifyProviderError>["category"]) {
  return category === "MODEL" || category === "UNAVAILABLE";
}

export async function analyzeWithGemini(
  buffer: Buffer,
  mimeType: string,
  context: AnalysisContext,
  measurements: ImageMeasurements,
  qcIssues: string[] = [],
  options: GeminiAnalysisOptions = {}
): Promise<RawAnalysis> {
  const maxAttempts = positiveInt(process.env.GEMINI_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS, 3);
  const callBudgetMs = options.providerCallTimeoutMs ?? providerCallTimeoutMs();
  const minimumRemainingMs = options.minimumRemainingMs ?? MIN_REMAINING_MS;
  let lastError: unknown;

  for (const model of modelCandidates()) {
    if (!hasMinimumTime(options.deadlineAt, minimumRemainingMs)) {
      throw new ProviderError("The analysis budget expired before another model could be tried.", { category: "TIMEOUT" }, { model });
    }
    let retryCount = 0;
    let callAttempt = 0;
    const startedAt = Date.now();
    try {
      const response = await withProviderRetries(
        () => {
          callAttempt += 1;
          const callStartedAt = Date.now();
          const remaining = remainingMilliseconds(options.deadlineAt);
          if (remaining < minimumRemainingMs) throw new ProviderError("The analysis budget expired before a provider call could start.", { category: "TIMEOUT" }, { model, retryCount });
          const timeout = Math.min(callBudgetMs, remaining);
          const client = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { timeout, retryOptions: { attempts: 1 } }
          });
          console.info(JSON.stringify({ event: "gemini_call_start", requestId: options.requestId, provider: "gemini", model, attempt: callAttempt }));
          const configuredThinking = process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();
          const thinkingLevel = configuredThinking === "minimal" ? ThinkingLevel.MINIMAL : configuredThinking === "medium" ? ThinkingLevel.MEDIUM : configuredThinking === "high" ? ThinkingLevel.HIGH : ThinkingLevel.LOW;
          return client.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: requestText(context, measurements, qcIssues, options.ruleResults || [], options.facts || factsFromMeasurements(measurements, "general")) }, { inlineData: { mimeType, data: buffer.toString("base64") } }] }],
            config: { temperature: 0.2, responseMimeType: "application/json", thinkingConfig: { thinkingLevel } }
          }).then((result) => {
            console.info(JSON.stringify({ event: "gemini_call_end", requestId: options.requestId, provider: "gemini", model, attempt: callAttempt, durationMs: Date.now() - callStartedAt, outcome: "success" }));
            return result;
          }).catch((error) => {
            const failure = classifyProviderError(error);
            console.warn(JSON.stringify({ event: "gemini_call_end", requestId: options.requestId, provider: "gemini", model, attempt: callAttempt, durationMs: Date.now() - callStartedAt, outcome: "error", errorCategory: failure.category, status: failure.status }));
            throw error;
          });
        },
        {
          maxAttempts,
          initialDelayMs: positiveInt(process.env.GEMINI_RETRY_INITIAL_DELAY_MS, 800, 10_000),
          maxDelayMs: positiveInt(process.env.GEMINI_RETRY_MAX_DELAY_MS, 4_000, 30_000),
          jitterRatio: 0.25,
          deadlineAt: options.deadlineAt,
          minimumRemainingMs,
          onRetry: ({ attempt, nextAttempt, delayMs, failure }) => {
            retryCount = attempt;
            console.warn(JSON.stringify({ event: "gemini_retry", requestId: options.requestId, provider: "gemini", model, errorCategory: failure.category, retryCount: attempt, nextAttempt, delayMs }));
          }
        }
      );
      const content = response.text?.trim();
      if (!content) throw new ProviderError("Gemini returned an empty analysis.", { category: "RESPONSE_FORMAT" }, { model, retryCount });
      try {
        return JSON.parse(content) as RawAnalysis;
      } catch {
        throw new ProviderError("Gemini returned malformed JSON.", { category: "RESPONSE_FORMAT" }, { model, retryCount });
      }
    } catch (error) {
      const providerError = asProviderError(error, model, retryCount);
      lastError = providerError;
      console.warn(JSON.stringify({ event: "gemini_failure", requestId: options.requestId, provider: "gemini", model, errorCategory: providerError.failure.category, status: providerError.failure.status, retryCount: providerError.retryCount, durationMs: Date.now() - startedAt }));
      if (shouldTryFallback(providerError.failure.category)) {
        if (!hasMinimumTime(options.deadlineAt, minimumRemainingMs)) {
          throw new ProviderError("The analysis budget expired before another model could be tried.", { category: "TIMEOUT" }, { model, retryCount });
        }
        continue;
      }
      throw providerError;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No configured Gemini model was available.");
}
