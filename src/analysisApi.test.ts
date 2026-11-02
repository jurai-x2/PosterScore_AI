import { describe, expect, it } from "vitest";
import { demoAnalysis } from "../server/analysis";
import { AnalysisRequestError, parseAnalysisPayload, serverErrorMessage } from "./analysisApi";

describe("frontend analysis response guard", () => {
  it("accepts a complete validated report", () => {
    const parsed = parseAnalysisPayload({ success: true, analysis: demoAnalysis });
    expect(parsed.overallScore).toBe(81);
  });

  it("rejects incomplete or unexpected API responses", () => {
    expect(() => parseAnalysisPayload(null)).toThrow(AnalysisRequestError);
    const incomplete = structuredClone(demoAnalysis) as Record<string, unknown>;
    incomplete.improvements = [{ title: "Missing evidence" }];
    expect(() => parseAnalysisPayload({ success: true, analysis: incomplete })).toThrow("incomplete report");
  });

  it("maps safe server error codes and keeps the client timeout distinct", () => {
    expect(serverErrorMessage("TIMEOUT")).toContain("budget expired");
    expect(serverErrorMessage("NETWORK")).toContain("could not reach Gemini");
    expect(serverErrorMessage("AUTH", "The key was rejected by the provider.")).toBe("The key was rejected by the provider.");
  });
});
