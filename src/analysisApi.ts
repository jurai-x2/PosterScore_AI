import type { Analysis, AnalysisContext } from "./types";

const MOCK_DELAY_MS = 1800;
export const ANALYSIS_TIMEOUT_MS = Number(import.meta.env.VITE_ANALYZE_TOTAL_BUDGET_MS || 100_000) + 20_000;

export class AnalysisRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code = "ANALYSIS_FAILED", retryable = false) {
    super(message);
    this.name = "AnalysisRequestError";
    this.code = code;
    this.retryable = retryable;
  }
}

const mockAnalysis: Analysis = {
  isPoster: true,
  posterType: "Promotional Offer",
  posterPurpose: "Drive customers to visit a retail store for a limited-time discount",
  brandingApplicable: true,
  confidence: "high",
  limitations: ["The target viewing distance was not provided."],
  firstNotice: "The 10% discount headline.",
  secondNotice: "The supporting product image.",
  thirdNotice: "The lower action area.",
  targetOrderAssessment: "The offer leads as intended, but the CTA should appear sooner after it.",
  overallScore: 81,
  ratingLabel: "Strong Design",
  demoMode: true,
  overallSummary: "The offer lands quickly and the brand feels recognizable, but the lower half asks the viewer to work too hard. A clearer action and a calmer type hierarchy would turn attention into a next step.",
  elementMap: [
    { id: "discount-headline", label: "10% discount headline", location: "Upper center focal area" },
    { id: "product-image", label: "Product image", location: "Center visual field" },
    { id: "supporting-copy", label: "Supporting copy", location: "Lower information block" },
    { id: "cta", label: "Call to action", location: "Lower action area" },
    { id: "brand-mark", label: "Brand mark", location: "Upper corner" }
  ],
  critique: {
    intent: { statement: "Sell a limited-time offer through the discount headline and direct the viewer to the lower action area.", audience: "Retail shoppers who can act during the promotion window.", desiredAction: "Read the offer, then use the CTA to visit the store.", unclear: false, evidence: "[discount-headline] states the offer; [cta] supplies the next step." },
    rootCauses: [
      { target: "cta", cause: "The action is subordinate to the offer instead of completing its visual unit.", evidence: "[cta] appears below [discount-headline] with less scale and contrast." },
      { target: "supporting-copy", cause: "The lower information block carries more content than the action needs.", evidence: "[supporting-copy] and [cta] share the lower third with limited separation." }
    ],
    oneBigMove: { target: "cta", change: "Make [cta] the immediate second beat after [discount-headline]: move it directly beneath the offer, increase its size by 25%, and remove one supporting line." },
    topFixes: [
      { target: "cta", criterion: "cta", problem: "[cta] reads like an afterthought beside the offer.", evidence: "[cta] is visually quieter than [discount-headline] in the lower action area.", measuredValue: "CTA scale is approximately 70% of the headline scale (visual estimate).", fix: "Increase [cta] type and button height by 25%, use the lime accent, and place it within 24px of [discount-headline].", whyItMatters: "A visible next step converts the attention already earned by [discount-headline].", expectedResult: "The eye moves from [discount-headline] to [cta] without scanning the lower block." },
      { target: "supporting-copy", criterion: "composition", problem: "[supporting-copy] and [cta] form a crowded ending.", evidence: "The lower third contains multiple copy lines before the action area.", measuredValue: "Estimated whitespace in the lower third is under 16% (visual estimate).", fix: "Remove the least actionable line from [supporting-copy] and add 16–24px vertical space before [cta].", whyItMatters: "Reducing the lower-block density makes the action legible at mobile viewing distance.", expectedResult: "The lower third resolves into one short proof point followed by one action." },
      { target: "brand-mark", criterion: "branding", problem: "[brand-mark] is visible but disconnected from the action.", evidence: "The brand cue sits away from [cta] and does not repeat near the conversion point.", measuredValue: "[brand-mark] occupies less than 5% of the poster area (visual estimate).", fix: "Keep the existing [brand-mark] size and repeat only its accent color on [cta]; do not add a second logo.", whyItMatters: "A restrained brand cue near the action supports recognition without competing with the offer.", expectedResult: "The action feels owned by the brand while [discount-headline] remains the focal point." }
    ],
    keep: [
      { target: "discount-headline", whatWorks: "[discount-headline] is the first notice and gives the poster a clear entry point." },
      { target: "product-image", whatWorks: "[product-image] supports the offer without overtaking [discount-headline]." },
      { target: "brand-mark", whatWorks: "[brand-mark] stays restrained and supports recognition." }
    ],
    polish: [
      { target: "supporting-copy", item: "Set [supporting-copy] at least one size step below [discount-headline] and keep each line under 45 characters." },
      { target: "cta", item: "Reserve the lime accent for [cta] and one small emphasis mark only." }
    ]
  },
  categories: {
    layoutHierarchy: { score: 85, checks: [{ name: "Eye path", score: 9, evidence: "The discount is the first thing the eye notices." }, { name: "Spacing and balance", score: 8, evidence: "The main offer has generous breathing room, while the lower cluster is compressed." }], strengths: ["The offer has a clear entry point."], issues: ["The supporting copy competes with the action at the bottom."] },
    typography: { score: 80, checks: [{ name: "Type hierarchy", score: 8, evidence: "The headline has a clear weight contrast." }, { name: "Type pairing", score: 8, evidence: "The restrained type pairing feels consistent." }], strengths: ["The headline has a clear weight contrast."], issues: ["Small supporting text loses distinction at mobile size."] },
    readabilityContrast: { score: 85, checks: [{ name: "Contrast", score: 9, evidence: "Primary text has strong foreground/background contrast." }, { name: "Viewing distance", score: 8, evidence: "Secondary details need more spacing to scan quickly." }], strengths: ["Primary text is easy to read."], issues: ["Secondary details need more spacing."] },
    imagery: { score: 80, checks: [{ name: "Relevance", score: 8, evidence: "The image supports the offer without competing with the headline." }, { name: "Integration", score: 8, evidence: "The image and type share a calm visual tone." }], strengths: ["The imagery supports the proposition."], issues: ["The image could connect more directly to the action."] },
    messageCta: { score: 70, checks: [{ name: "Message clarity", score: 8, evidence: "The main proposition is understandable in one glance." }, { name: "Action visibility", score: 6, evidence: "The action area is visible but quieter than the discount." }], strengths: ["The offer is clear at a glance."], issues: ["The call to action is visually quieter than the offer."] },
    color: { score: 90, checks: [{ name: "Palette", score: 9, evidence: "The restrained lime and charcoal palette feels ownable." }, { name: "Accent use", score: 9, evidence: "The accent creates a recognizable visual cue." }], strengths: ["The palette feels distinctive."], issues: ["The accent could be reserved more consistently for action."] },
    branding: { score: 80, checks: [{ name: "Recognition", score: 8, evidence: "The logo is visible without taking over the offer." }, { name: "Consistency", score: 8, evidence: "The brand cue is consistent with the palette." }], strengths: ["The logo is present but restrained."], issues: ["A small brand cue could repeat near the action."] }
  },
  strengths: ["The 10% discount is immediately visible, giving the poster a strong entry point.", "The lime-and-charcoal palette feels distinctive and keeps the brand recognizable.", "The main message is understandable without reading every line.", "Spacing around the offer gives the focal point room to breathe."],
  improvements: [
    { priority: "HIGH", category: "messageCta", title: "Give the action a louder voice", problem: "The CTA is smaller and lower-contrast than the discount, so it reads like an afterthought.", evidence: "The action area is visible below the offer but has less scale and contrast than the 10% headline.", whyItMatters: "Attention only converts when the viewer knows what to do next.", recommendation: "Increase the CTA by approximately 20–30%, use the lime accent for it, and place it directly beneath the offer as one visual unit.", anchor: { x: 58, y: 82 } },
    { priority: "HIGH", category: "layoutHierarchy", title: "Simplify the lower third", problem: "The supporting details and action sit close together with similar visual weight.", evidence: "The lower third contains multiple lines with little separation before the action area.", whyItMatters: "A crowded ending makes the poster feel slower to scan, especially on a phone.", recommendation: "Remove one secondary line, add 16–24px of breathing room around the CTA, and keep only the detail that helps someone act.", anchor: { x: 50, y: 70 } },
    { priority: "MEDIUM", category: "typography", title: "Build a clearer type scale", problem: "The supporting copy is close enough in size to the CTA that the hierarchy softens.", evidence: "The supporting copy and action use similar visual scale in the lower section.", whyItMatters: "A stronger scale lets the viewer understand the message in the intended order.", recommendation: "Keep the headline dominant, reduce supporting copy by one step, and reserve the next-largest size for the action.", anchor: { x: 50, y: 35 } }
  ]
};

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serverErrorMessage(code: string, message?: string) {
  if (message) return message;
  const messages: Record<string, string> = {
    AUTH: "Gemini rejected the API key. Check the server credentials.",
    QUOTA: "Gemini quota is blocking this analysis. Check quota or billing, then try again later.",
    RATE_LIMIT: "Gemini rate limit reached. Wait a moment and try again.",
    MODEL: "The configured Gemini model is unavailable for this project.",
    NETWORK: "The server could not reach Gemini. Check the network connection and try again.",
    TIMEOUT: "The analysis budget expired before Gemini could complete the review. Please try again.",
    RESPONSE_FORMAT: "Gemini returned a report that could not be validated. Please try again."
  };
  return messages[code] || "We couldn't analyze that image.";
}

export function parseAnalysisPayload(payload: unknown): Analysis {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.analysis)) {
    throw new AnalysisRequestError("The analysis service returned an unexpected response.", "INVALID_API_RESPONSE", true);
  }
  const analysis = payload.analysis;
  const requiredCategories = ["layoutHierarchy", "typography", "readabilityContrast", "imagery", "messageCta", "color", "branding"];
  const categories = analysis.categories;
  const improvements = analysis.improvements;
  const critique = analysis.critique;
  if (typeof analysis.isPoster !== "boolean" || typeof analysis.posterType !== "string" || typeof analysis.overallScore !== "number" || analysis.overallScore < 0 || analysis.overallScore > 100 || !isRecord(categories) || !requiredCategories.every((key) => isRecord(categories[key]) && typeof categories[key]?.score === "number") || !Array.isArray(improvements) || !improvements.every((item) => isRecord(item) && typeof item.title === "string" && typeof item.category === "string" && typeof item.evidence === "string") || !Array.isArray(analysis.elementMap) || !isRecord(critique) || !Array.isArray(critique.topFixes) || critique.topFixes.length > 3) {
    throw new AnalysisRequestError("The analysis service returned an incomplete report.", "INVALID_API_RESPONSE", true);
  }
  return analysis as unknown as Analysis;
}

async function analyzeWithApi(file: File, context: AnalysisContext): Promise<Analysis> {
  const form = new FormData();
  form.append("image", file);
  form.append("context", JSON.stringify(context));
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal });
    const payload = await response.json().catch(() => null) as unknown;
    if (!isRecord(payload)) throw new AnalysisRequestError("The analysis service returned an unreadable response.", "INVALID_API_RESPONSE", true);
    if (!response.ok || payload.success !== true) {
      const error = isRecord(payload.error) ? payload.error : {};
      const code = typeof error.code === "string" ? error.code : "ANALYSIS_FAILED";
      throw new AnalysisRequestError(
        serverErrorMessage(code, typeof error.message === "string" ? error.message : undefined),
        code,
        error.retryable === true || [408, 429, 500, 502, 503, 504].includes(response.status)
      );
    }
    return parseAnalysisPayload(payload);
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AnalysisRequestError("The browser timed out before the server replied. Check the server logs and try again.", "CLIENT_TIMEOUT", true);
    throw new AnalysisRequestError("The analysis service could not be reached. Check that the backend is running and try again.", "NETWORK_ERROR", true);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function analyzePoster(file: File, context: AnalysisContext): Promise<Analysis> {
  if (import.meta.env.VITE_USE_MOCK_ANALYSIS === "true") {
    await wait(MOCK_DELAY_MS);
    return { ...mockAnalysis, context };
  }
  return analyzeWithApi(file, context);
}
