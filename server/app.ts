import "dotenv/config";
import cors from "cors";
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import multer from "multer";
import { demoAnalysis, runQualityControlledAnalysis, type RawAnalysis } from "./analysis.js";
import { ProviderError, classifyProviderError } from "./provider.js";
import { analyzeWithGemini, type GeminiAnalysisOptions } from "./vision.js";
import { analysisContextSchema, measureImage, preprocessImage, validateImage } from "./validation.js";
import { factsFromMeasurements, runRules, type RuleResult } from "./rules.js";
import { createStageTimer } from "./timing.js";
import { analyzeTotalBudgetMs, MIN_REMAINING_MS, providerCallTimeoutMs } from "./budget.js";
import type { AnalysisContext } from "../src/types.js";

export type AnalysisProvider = (
  buffer: Buffer,
  mimeType: string,
  context: AnalysisContext,
  measurements: Awaited<ReturnType<typeof measureImage>>,
  qcIssues?: string[],
  options?: GeminiAnalysisOptions
) => Promise<RawAnalysis>;

const MAX_BODY_FILE_SIZE = 10 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 12;

function requestIdFor(response: Response) {
  return response.locals.requestId as string;
}

function logRequest(request: Request, response: Response, startedAt: number) {
  console.info(JSON.stringify({
    event: "http_request",
    requestId: requestIdFor(response),
    method: request.method,
    path: request.path,
    status: response.statusCode,
    durationMs: Date.now() - startedAt
  }));
}

export function analysisFailure(error: unknown) {
  const failure = error instanceof ProviderError ? error.failure : classifyProviderError(error);
  const configuredModel = process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash";
  switch (failure.category) {
    case "AUTH":
      return { code: "GEMINI_AUTH", status: 502, retryable: false, message: "Gemini rejected the API key. Check that it is active and belongs to a project with the Gemini API enabled." };
    case "BILLING":
      return { code: "GEMINI_BILLING", status: 502, retryable: false, message: "Gemini requires permission or billing for this request. Check the Gemini project settings, then try again." };
    case "QUOTA":
      return { code: "GEMINI_QUOTA", status: 503, retryable: true, message: "Gemini quota is currently blocking this analysis. Check quota or billing, then try again later." };
    case "RATE_LIMIT":
      return { code: "GEMINI_RATE_LIMIT", status: 429, retryable: true, message: "Gemini rate limit reached. Wait a moment before trying again." };
    case "UNAVAILABLE":
      return { code: "GEMINI_BUSY", status: 503, retryable: true, message: "Gemini is temporarily unavailable. The server retried safely; try again in a minute." };
    case "NETWORK":
      return { code: "NETWORK", status: 504, retryable: true, message: "The server could not reach Gemini. Check the network connection and try again." };
    case "TIMEOUT":
      return { code: "TIMEOUT", status: 504, retryable: true, message: "The analysis budget expired before Gemini could complete the review. Please try again." };
    case "MODEL":
      return { code: "GEMINI_MODEL", status: 502, retryable: false, message: `The configured Gemini model (${configuredModel}) is unavailable for this key. Set GEMINI_VISION_MODEL to a model enabled for your Gemini project.` };
    case "INVALID_REQUEST":
      return { code: "GEMINI_INVALID_REQUEST", status: 502, retryable: false, message: "Gemini rejected the analysis request. The server configuration or model request needs attention." };
    case "RESPONSE_FORMAT":
      return { code: "GEMINI_RESPONSE_FORMAT", status: 502, retryable: true, message: "Gemini returned a report the reviewer could not validate. Please try the analysis again." };
    default:
      return { code: "ANALYSIS_FAILED", status: 502, retryable: true, message: "Gemini could not complete this review. Please try the analysis again." };
  }
}

function errorResponse(response: Response, status: number, code: string, message: string, retryable = false) {
  return response.status(status).json({ success: false, error: { code, message, retryable }, requestId: requestIdFor(response) });
}

export function createApp(provider: AnalysisProvider = analyzeWithGemini) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BODY_FILE_SIZE } });
  const requestLog = new Map<string, number[]>();
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json({ limit: "32kb" }));
  app.use((request, response, next) => {
    response.locals.requestId = request.get("x-request-id") || crypto.randomUUID();
    response.setHeader("x-request-id", requestIdFor(response));
    const startedAt = Date.now();
    response.on("finish", () => logRequest(request, response, startedAt));
    next();
  });

  app.get("/api/health", (_request, response) => response.json({
    ok: true,
    demoMode: process.env.DEMO_MODE === "true",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    provider: "gemini",
    configuredModel: process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash",
    fallbackModelsConfigured: Boolean(process.env.GEMINI_FALLBACK_MODELS)
  }));

  app.post("/api/analyze", upload.single("image"), async (request, response) => {
    const requestId = requestIdFor(response);
    const timer = createStageTimer(requestId);
    const deadlineAt = Date.now() + analyzeTotalBudgetMs();
    try {
      const now = Date.now();
      const clientKey = request.ip || "unknown";
      const recent = (requestLog.get(clientKey) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
      if (recent.length >= RATE_LIMIT_MAX) return errorResponse(response, 429, "RATE_LIMITED", "Too many analyses in a short period. Please wait a few minutes and try again.", true);
      recent.push(now);
      requestLog.set(clientKey, recent);

      if (!request.file) return errorResponse(response, 400, "MISSING_IMAGE", "Add a poster image to begin.");
      const validationError = await validateImage(request.file);
      if (validationError) return errorResponse(response, 400, "INVALID_IMAGE", validationError);
      timer.mark("upload_validation", { bytes: request.file.size, mimeType: request.file.mimetype });

      let context: AnalysisContext = { targetPlatform: "General", goal: "", audience: "", brandInfo: "" };
      if (typeof request.body.context === "string") {
        let supplied: unknown;
        try { supplied = JSON.parse(request.body.context); } catch { return errorResponse(response, 400, "INVALID_CONTEXT", "The analysis context could not be read."); }
        const parsedContext = analysisContextSchema.safeParse(supplied);
        if (!parsedContext.success) return errorResponse(response, 400, "INVALID_CONTEXT", "The analysis context contains an unsupported value or is too long.");
        context = parsedContext.data;
      }

      let measurements: Awaited<ReturnType<typeof measureImage>>;
      try {
        measurements = await measureImage(request.file.buffer);
      } catch {
        return errorResponse(response, 400, "IMAGE_PROCESSING_FAILED", "The image could not be measured safely. Try exporting it again as JPG, PNG, or WEBP.");
      }
      timer.mark("measurements", { width: measurements.width, height: measurements.height });

      if (!process.env.GEMINI_API_KEY) {
        if (process.env.DEMO_MODE === "true") return response.json({ success: true, analysis: { ...demoAnalysis, measurements, context, ruleResults: runRules(factsFromMeasurements(measurements, demoAnalysis.posterType)) }, requestId });
        return errorResponse(response, 503, "AI_NOT_CONFIGURED", "Gemini AI analysis is not configured on this server yet. Add GEMINI_API_KEY to the server .env file or enable demo mode.", false);
      }

      let preparedImage: Buffer;
      try {
        preparedImage = await preprocessImage(request.file.buffer);
      } catch {
        return errorResponse(response, 400, "IMAGE_PROCESSING_FAILED", "The image could not be prepared for analysis. Try exporting it again as JPG, PNG, or WEBP.");
      }
      timer.mark("sharp_preprocessing", { bytes: preparedImage.length });

      let activeRuleResults: RuleResult[] = [];
      let activeFacts = factsFromMeasurements(measurements, "General");
      let passNumber = 0;
      const result = await runQualityControlledAnalysis(
        (qcIssues = []) => {
          passNumber += 1;
          timer.mark("correction_pass_start", { pass: passNumber, qcIssueCount: qcIssues.length });
          return provider(preparedImage, "image/jpeg", context, measurements, qcIssues, {
            requestId,
            ruleResults: activeRuleResults,
            facts: activeFacts,
            deadlineAt,
            providerCallTimeoutMs: providerCallTimeoutMs(),
            minimumRemainingMs: MIN_REMAINING_MS
          })
            .then((candidate) => { timer.mark("correction_pass_end", { pass: passNumber, outcome: "candidate_received" }); return candidate; })
            .catch((error) => { timer.mark("correction_pass_end", { pass: passNumber, outcome: "provider_error" }); throw error; });
        },
        [],
        (candidate) => {
          activeFacts = factsFromMeasurements(measurements, candidate.posterType);
          activeRuleResults = runRules(activeFacts);
          timer.mark("rules", { pass: passNumber, ruleCount: activeRuleResults.length });
          return activeRuleResults;
        }
      );
      if (!result.analysis) {
        if (result.stoppedReason === "TIMEOUT") return errorResponse(response, 504, "TIMEOUT", "The analysis budget expired before a validated report could be completed. Please try again.", true);
        return errorResponse(response, 502, "INVALID_ANALYSIS", "The AI response could not pass the evidence and scoring checks. Please try the analysis again.", true);
      }
      timer.mark("total", { outcome: result.analysis.lowConfidence ? "low_confidence" : "success", attempts: result.attempts });
      return response.json({ success: true, analysis: { ...result.analysis, measurements, context }, requestId });
    } catch (error) {
      const failure = analysisFailure(error);
      console.error(JSON.stringify({ event: "analysis_failed", requestId, provider: "gemini", model: process.env.GEMINI_VISION_MODEL || "gemini-3.8-flash", errorCategory: error instanceof ProviderError ? error.failure.category : classifyProviderError(error).category, retryCount: error instanceof ProviderError ? error.retryCount : 0, message: failure.message }));
      return errorResponse(response, failure.status, failure.code, failure.message, failure.retryable);
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return errorResponse(response, 400, "FILE_TOO_LARGE", "That image is over the 10 MB limit.");
    }
    console.error(JSON.stringify({ event: "unhandled_api_error", requestId: requestIdFor(response), message: error instanceof Error ? error.message : "unknown" }));
    return errorResponse(response, 500, "INTERNAL_ERROR", "We couldn't complete the request. Please try again.", true);
  });

  return app;
}

export const app = createApp();
