import { describe, expect, it } from "vitest";
import { ALL_RULES, runRules, type Element, type Facts } from "../src/rules";

const el = (overrides: Partial<Element> & Pick<Element, "id" | "kind">): Element => ({
  bbox: { x: .1, y: .1, w: .8, h: .1 }, fontSizePct: 3, fontFamily: "Inter", contrast: 8,
  saliency: .3, weight: 400, align: "left", ...overrides
});

const goodPoster = (): Facts => ({
  posterType: "event", paletteCount: 4, whitespaceRatio: .3, wordCount: 35, spellingErrors: [], detectionConfidence: .9,
  direction: "ltr", accentAreaPct: 8, sharpness: .6,
  essentials: { date: true, venue: true, price: false, offer: false, validity: false, contact: true },
  elements: [
    el({ id: "T1", kind: "headline", bbox: { x: .1, y: .12, w: .8, h: .15 }, fontSizePct: 9, weight: 800, saliency: .9, text: "Summer Night Market" }),
    el({ id: "T2", kind: "body", bbox: { x: .1, y: .4, w: .6, h: .1 }, text: "Live music, food stalls and craft stands", lineChars: 40, lineHeight: 1.4 }),
    el({ id: "T3", kind: "body", bbox: { x: .1, y: .58, w: .6, h: .08 }, text: "12 July, Corniche Park", lineChars: 30, lineHeight: 1.4 }),
    el({ id: "CTA1", kind: "cta", bbox: { x: .1, y: .78, w: .4, h: .08 }, fontSizePct: 4.5, weight: 700, saliency: .7, text: "Book your spot", contrast: 7 }),
    el({ id: "LOGO1", kind: "logo", bbox: { x: .75, y: .84, w: .15, h: .08 } })
  ]
});

const withEl = (facts: Facts, id: string, patch: Partial<Element>): Facts => ({ ...facts, elements: facts.elements.map((element) => element.id === id ? { ...element, ...patch } : element) });
const get = (results: ReturnType<typeof runRules>, id: string) => results.find((result) => result.ruleId === id)!;

describe("deterministic rule registry", () => {
  it("passes critical and major rules for the baseline poster", () => {
    const failed = runRules(goodPoster()).filter((result) => !result.passed && !result.skipped && result.severity !== "minor");
    expect(failed).toEqual([]);
  });

  it("names the measured element when contrast fails", () => {
    const result = get(runRules(withEl(goodPoster(), "T2", { contrast: 2.1 })), "READ_CONTRAST");
    expect(result.passed).toBe(false);
    expect(result.targets).toEqual(["T2"]);
    expect(result.evidence).toContain("2.1:1");
  });

  it("skips layout rules below the detection confidence threshold", () => {
    const result = get(runRules({ ...goodPoster(), detectionConfidence: .4 }), "COMP_SAFE_MARGIN");
    expect(result.skipped).toBe(true);
    expect(get(runRules({ ...goodPoster(), detectionConfidence: .4 }), "READ_CONTRAST").skipped).toBeFalsy();
  });

  it("uses the declared basis on every registry rule", () => {
    expect(runRules(goodPoster()).every((result) => ["standard", "principle", "heuristic"].includes(result.basis))).toBe(true);
    expect(ALL_RULES.every((rule) => rule.basis)).toBe(true);
    expect(ALL_RULES.filter((rule) => rule.basis === "heuristic").every((rule) => (rule.scoreCap ?? 0) <= 6)).toBe(true);
  });
});
