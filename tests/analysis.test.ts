import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisSchema, calculateOverallScore, demoAnalysis, getWeights, MAX_CORRECTION_ATTEMPTS, normalizeAnalysis, qualityCheck, ratingLabel, runQualityControlledAnalysis } from "../server/analysis";
import { factsFromMeasurements, runRules } from "../server/rules";
import { MAX_FILE_SIZE, validateImage } from "../server/validation";
import { classifyProviderError, isRetryableProviderFailure, retryAfterMilliseconds, withProviderRetries, ProviderError } from "../server/provider";
import { shouldTryFallback } from "../server/vision";
import { analysisFailure, createApp } from "../server/app";
import sharp from "sharp";
import { createServer, type Server } from "node:http";

describe("scoring engine", () => {
  it("calculates the weighted score deterministically", () => {
    const categories = Object.fromEntries(["layoutHierarchy", "typography", "readabilityContrast", "imagery", "messageCta", "color", "branding"].map((key) => [key, { checks: [{ name: "test", score: 10, evidence: "Visible evidence." }, { name: "test 2", score: 10, evidence: "More visible evidence." }], strengths: ["x"], issues: [] }]));
    expect(calculateOverallScore(categories as never)).toBe(100);
  });
  it("uses the correct rating bands", () => {
    expect(ratingLabel(90)).toBe("Exceptional");
    expect(ratingLabel(80)).toBe("Strong Design");
    expect(ratingLabel(69)).toBe("Needs Improvement");
    expect(ratingLabel(39)).toBe("Major Redesign Needed");
  });
  it("uses poster-type weights and redistributes conditional branding", () => {
    const restaurant = getWeights("Restaurant/Food", true);
    expect(restaurant.imagery).toBe(.25);
    expect(Object.values(restaurant).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    const withoutBrand = getWeights("Corporate", false);
    expect(withoutBrand.branding).toBe(0);
    expect(Object.values(withoutBrand).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });
  it("keeps demo output schema-valid and score-derived", () => {
    const parsed = analysisSchema.safeParse(demoAnalysis);
    expect(parsed.success).toBe(true);
    expect(demoAnalysis.overallScore).toBe(calculateOverallScore(demoAnalysis.categories, demoAnalysis.posterType, demoAnalysis.brandingApplicable));
  });
  it("flags duplicate or vague recommendations", () => {
    const result = { ...demoAnalysis, improvements: [{ ...demoAnalysis.improvements[0], recommendation: "Fix it." }, { ...demoAnalysis.improvements[0] }] };
    expect(qualityCheck(result).some((issue) => issue.includes("Duplicate"))).toBe(true);
    expect(qualityCheck(result).some((issue) => issue.includes("specific"))).toBe(true);
  });
  it("rejects malformed model output", () => {
    const missingCategory = structuredClone(demoAnalysis) as Record<string, unknown>;
    const categories = { ...(missingCategory.categories as Record<string, unknown>) };
    delete categories.layoutHierarchy;
    missingCategory.categories = categories;
    expect(analysisSchema.safeParse(missingCategory).success).toBe(false);

    const outOfRange = structuredClone(demoAnalysis) as Record<string, any>;
    outOfRange.categories.color.checks[0].score = 11;
    expect(analysisSchema.safeParse(outOfRange).success).toBe(false);
    outOfRange.categories.color.checks[0].score = -1;
    expect(analysisSchema.safeParse(outOfRange).success).toBe(false);
  });

  it("allows equal scores when each category has distinct evidence", () => {
    const uniform = structuredClone(demoAnalysis) as any;
    for (const category of Object.values(uniform.categories) as any[]) for (const check of category.checks) check.score = 7;
    expect(qualityCheck(uniform).some((issue) => issue.includes("identical"))).toBe(false);
  });

  it("flags repeated evidence within a category", () => {
    const repeated = structuredClone(demoAnalysis) as any;
    repeated.categories.color.checks[1].name = repeated.categories.color.checks[0].name;
    expect(qualityCheck(repeated).some((issue) => issue.includes("duplicate check names"))).toBe(true);
  });

  it("requires critique targets to resolve to visible element IDs", () => {
    const ungrounded = structuredClone(demoAnalysis) as any;
    ungrounded.critique.topFixes[0].target = "invented-element";
    expect(qualityCheck(ungrounded).some((issue) => issue.includes("element ID"))).toBe(true);
  });

  it("keeps unavailable measurement rules separate from failed rules", () => {
    const rules = runRules(factsFromMeasurements({ width: 100, height: 200, aspectRatio: .5, orientation: "portrait", dominantColors: ["#fff"], estimatedWhitespacePercent: 20, estimatedImageCoveragePercent: 30 }, "Promotional Offer"));
    expect(rules.find((rule) => rule.ruleId === "READ_MIN_SIZE")?.status).toBe("not_evaluated");
    expect(rules.find((rule) => rule.ruleId === "COLOR_PALETTE_LIMIT")?.status).toBe("passed");
  });

  it("applies deterministic score caps after draft scoring", () => {
    const raw = analysisSchema.parse(demoAnalysis);
    const capped = normalizeAnalysis(raw, false, [{ ruleId: "HIER_DOMINANT_HEADLINE", criterion: "hierarchy", passed: false, status: "failed", severity: "critical", targets: ["discount-headline"], evidence: "headline/body ratio 1.2x", scoreCap: 5, basis: "principle" }]);
    expect(capped.categories.layoutHierarchy.score).toBe(50);
  });

  it("runs a correction pass after a quality-control failure", async () => {
    const valid = analysisSchema.parse(demoAnalysis);
    const firstPass = { ...valid, categories: { ...valid.categories, messageCta: { ...valid.categories.messageCta, checks: valid.categories.messageCta.checks.map((check) => ({ ...check, score: 9 })), issues: ["There is no CTA visible in the lower section."] } }, improvements: [{ ...valid.improvements[0], problem: "The CTA is absent from the visible lower section.", recommendation: "Make the CTA larger and move it closer to the offer." }, ...valid.improvements.slice(1)] };
    let calls = 0;
    const result = await runQualityControlledAnalysis(async () => {
      calls += 1;
      return calls === 1 ? firstPass : valid;
    });
    expect(calls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.qcIssues).toEqual([]);
    expect(result.analysis?.overallScore).toBe(demoAnalysis.overallScore);
  });

  it("stops after the maximum number of correction attempts", async () => {
    const invalid = { ...demoAnalysis, categories: { ...demoAnalysis.categories, typography: { ...demoAnalysis.categories.typography, checks: [{ ...demoAnalysis.categories.typography.checks[0], score: 11 }, ...demoAnalysis.categories.typography.checks.slice(1)] } } };
    let calls = 0;
    const result = await runQualityControlledAnalysis(async () => {
      calls += 1;
      return invalid;
    });
    expect(calls).toBe(MAX_CORRECTION_ATTEMPTS + 1);
    expect(result.attempts).toBe(MAX_CORRECTION_ATTEMPTS + 1);
    expect(result.analysis).toBeUndefined();
    expect(result.qcIssues[0]).toContain("schema");
  });

  it("keeps the best valid candidate when a correction pass times out", async () => {
    const valid = analysisSchema.parse(demoAnalysis);
    const firstPass = { ...valid, categories: { ...valid.categories, messageCta: { ...valid.categories.messageCta, checks: valid.categories.messageCta.checks.map((check) => ({ ...check, score: 9 })), issues: ["There is no CTA visible in the lower section."] } }, improvements: [{ ...valid.improvements[0], problem: "The CTA is absent from the visible lower section.", recommendation: "Make the CTA larger and move it closer to the offer." }, ...valid.improvements.slice(1)] };
    let calls = 0;
    const result = await runQualityControlledAnalysis(async () => {
      calls += 1;
      if (calls === 1) return firstPass;
      throw new ProviderError("provider deadline", { category: "TIMEOUT", status: 504 });
    });
    expect(calls).toBe(2);
    expect(result.analysis?.lowConfidence).toBe(true);
    expect(result.analysis?.limitations.some((item) => item.includes("Provider ended before correction completed"))).toBe(true);
  });

  it("does not start a provider attempt with less than the minimum remaining budget", async () => {
    let calls = 0;
    const result = await runQualityControlledAnalysis(async () => {
      calls += 1;
      return demoAnalysis;
    }, [], undefined, { deadlineAt: Date.now() + 24_000, minimumRemainingMs: 25_000 });
    expect(calls).toBe(0);
    expect(result.stoppedReason).toBe("TIMEOUT");
    expect(result.analysis).toBeUndefined();
  });
});

describe("upload validation", () => {
  it("rejects unsupported MIME types and extensions", async () => {
    await expect(validateImage({ mimetype: "application/pdf", originalname: "poster.pdf", size: 12, buffer: Buffer.from("not an image") })).resolves.toContain("Unsupported");
    await expect(validateImage({ mimetype: "image/png", originalname: "poster.gif", size: 12, buffer: Buffer.from("not an image") })).resolves.toContain("Unsupported");
  });

  it("rejects files over the size limit before decoding", async () => {
    await expect(validateImage({ mimetype: "image/png", originalname: "poster.png", size: MAX_FILE_SIZE + 1, buffer: Buffer.alloc(0) })).resolves.toContain("10 MB");
  });

  it("rejects corrupt image bytes", async () => {
    await expect(validateImage({ mimetype: "image/png", originalname: "poster.png", size: 12, buffer: Buffer.from("not an image") })).resolves.toContain("corrupt");
  });
});

describe("Gemini reliability helpers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("classifies permanent and transient provider errors", () => {
    expect(classifyProviderError(Object.assign(new Error("high demand"), { status: 503 })).category).toBe("UNAVAILABLE");
    expect(classifyProviderError(Object.assign(new Error("invalid api key"), { status: 401 })).category).toBe("AUTH");
    expect(classifyProviderError(Object.assign(new Error("resource exhausted"), { status: 429 })).category).toBe("RATE_LIMIT");
    expect(isRetryableProviderFailure({ category: "UNAVAILABLE" })).toBe(true);
    expect(isRetryableProviderFailure({ category: "AUTH" })).toBe(false);
    expect(classifyProviderError(Object.assign(new Error("DEADLINE_EXCEEDED"), { status: 504 })).category).toBe("TIMEOUT");
    expect(isRetryableProviderFailure({ category: "TIMEOUT" })).toBe(false);
    expect(shouldTryFallback("MODEL")).toBe(true);
    expect(shouldTryFallback("UNAVAILABLE")).toBe(true);
    expect(shouldTryFallback("TIMEOUT")).toBe(false);
    expect(shouldTryFallback("NETWORK")).toBe(false);
  });

  it("respects Retry-After and retries only within the bound", async () => {
    const error = Object.assign(new Error("busy"), { status: 503, headers: { "retry-after": "0" } });
    expect(retryAfterMilliseconds(error)).toBe(0);
    let calls = 0;
    const result = await withProviderRetries(async () => {
      calls += 1;
      if (calls === 1) throw error;
      return "ok";
    }, { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("caps retry backoff to the remaining analysis budget", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let scheduledDelay = 0;
    try {
      const result = withProviderRetries(async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("high demand"), { status: 503 });
        return "ok";
      }, { maxAttempts: 2, initialDelayMs: 100_000, maxDelayMs: 100_000, jitterRatio: 0, deadlineAt: Date.now() + 1_100, minimumRemainingMs: 1_000, onRetry: ({ delayMs }) => { scheduledDelay = delayMs; } });
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe("ok");
      expect(scheduledDelay).toBe(100);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

async function startTestServer(app: ReturnType<typeof createApp>) {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function posterBytes() {
  return sharp({ create: { width: 120, height: 180, channels: 3, background: { r: 30, g: 120, b: 80 } } }).png().toBuffer();
}

// These tests exercise the real multipart HTTP boundary. The managed test
// sandbox disallows binding a local socket, so they are opt-in there.
const describeApiIntegration = process.env.RUN_HTTP_INTEGRATION === "true" ? describe : describe.skip;

describeApiIntegration("analysis API integration", () => {
  it("returns a validated successful analysis from a mocked provider", async () => {
    const raw = analysisSchema.parse(demoAnalysis);
    const { server, url } = await startTestServer(createApp(async () => raw));
    try {
      const body = new FormData();
      body.append("image", new Blob([await posterBytes()], { type: "image/png" }), "poster.png");
      body.append("context", JSON.stringify({ targetPlatform: "Instagram post", goal: "Register" }));
      const response = await fetch(`${url}/api/analyze`, { method: "POST", body });
      const payload = await response.json() as { success: boolean; analysis?: { overallScore: number; context: { goal: string } } };
      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.analysis?.overallScore).toBe(81);
      expect(payload.analysis?.context.goal).toBe("Register");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("rejects missing files, invalid context, and corrupt images", async () => {
    const { server, url } = await startTestServer(createApp(async () => analysisSchema.parse(demoAnalysis)));
    try {
      const missing = await fetch(`${url}/api/analyze`, { method: "POST", body: new FormData() });
      expect(missing.status).toBe(400);
      expect((await missing.json()).error.code).toBe("MISSING_IMAGE");

      const invalidContext = new FormData();
      invalidContext.append("image", new Blob([await posterBytes()], { type: "image/png" }), "poster.png");
      invalidContext.append("context", JSON.stringify({ targetPlatform: "Unknown" }));
      const contextResponse = await fetch(`${url}/api/analyze`, { method: "POST", body: invalidContext });
      expect(contextResponse.status).toBe(400);
      expect((await contextResponse.json()).error.code).toBe("INVALID_CONTEXT");

      const corrupt = new FormData();
      corrupt.append("image", new Blob([Buffer.from("not an image")], { type: "image/png" }), "poster.png");
      const corruptResponse = await fetch(`${url}/api/analyze`, { method: "POST", body: corrupt });
      expect(corruptResponse.status).toBe(400);
      expect((await corruptResponse.json()).error.code).toBe("INVALID_IMAGE");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns clear provider errors and rejects malformed analysis output", async () => {
    const { server, url } = await startTestServer(createApp(async () => { throw Object.assign(new Error("high demand"), { status: 503 }); }));
    try {
      const body = new FormData();
      body.append("image", new Blob([await posterBytes()], { type: "image/png" }), "poster.png");
      const providerResponse = await fetch(`${url}/api/analyze`, { method: "POST", body });
      expect(providerResponse.status).toBe(503);
      expect((await providerResponse.json()).error.code).toBe("GEMINI_BUSY");
      expect(analysisFailure(Object.assign(new Error("invalid api key"), { status: 401 })).code).toBe("GEMINI_AUTH");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    const malformedServer = await startTestServer(createApp(async () => ({} as never)));
    try {
      const body = new FormData();
      body.append("image", new Blob([await posterBytes()], { type: "image/png" }), "poster.png");
      const response = await fetch(`${malformedServer.url}/api/analyze`, { method: "POST", body });
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("INVALID_ANALYSIS");
    } finally {
      await new Promise<void>((resolve) => malformedServer.server.close(() => resolve()));
    }
  });

  it("handles a non-poster result without scoring it", async () => {
    const raw = structuredClone(analysisSchema.parse(demoAnalysis));
    raw.isPoster = false;
    raw.posterType = "General";
    raw.notPosterReason = "The upload is a photograph without a designed communication layout.";
    for (const category of Object.values(raw.categories)) for (const check of category.checks) check.score = 0;
    const { server, url } = await startTestServer(createApp(async () => raw));
    try {
      const body = new FormData();
      body.append("image", new Blob([await posterBytes()], { type: "image/png" }), "photo.png");
      const response = await fetch(`${url}/api/analyze`, { method: "POST", body });
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.analysis.isPoster).toBe(false);
      expect(payload.analysis.overallScore).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
