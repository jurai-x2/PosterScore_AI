import { describe, expect, it } from "vitest";
import { finalScore } from "../src/score";
import { validateCritique, type PosterCritique } from "../src/validate";
import { runRules } from "../src/rules";
import { type Facts } from "../src/rules";

const facts = (): Facts => ({
  posterType: "event", paletteCount: 4, whitespaceRatio: .3, wordCount: 35, spellingErrors: [], detectionConfidence: .9,
  direction: "ltr", accentAreaPct: 8, sharpness: .6,
  essentials: { date: true, venue: true, price: false, offer: false, validity: false, contact: true },
  elements: [
    { id: "T1", kind: "headline", bbox: { x: .1, y: .1, w: .8, h: .15 }, fontSizePct: 9, fontFamily: "Inter", contrast: 8, saliency: .9, weight: 800, align: "left", text: "Summer Night Market" },
    { id: "T2", kind: "body", bbox: { x: .1, y: .4, w: .6, h: .1 }, fontSizePct: 3, fontFamily: "Inter", contrast: 2.1, saliency: .2, weight: 400, align: "left", text: "Live music", lineChars: 40, lineHeight: 1.4 },
    { id: "CTA1", kind: "cta", bbox: { x: .1, y: .78, w: .4, h: .08 }, fontSizePct: 4.5, fontFamily: "Inter", contrast: 7, saliency: .7, weight: 700, align: "left", text: "Book your spot" },
    { id: "LOGO1", kind: "logo", bbox: { x: .75, y: .84, w: .15, h: .08 } }
  ]
});

const critique = (overrides: Partial<PosterCritique> = {}): PosterCritique => ({
  intent: { purpose: "x", audience: "y", desiredAction: "z", intentClear: true },
  threeSecondTest: { first: "a", second: "b", third: "c", matchesIntent: true },
  rootCauses: ["low contrast on T2"],
  criteria: ["hierarchy", "typography", "composition", "readability", "color", "cta", "branding", "clarity"].map((id) => ({ id: id as any, applicable: true, score: 6, reason: "A measured reason with enough length.", evidence: ["T2"], ruleIds: [] })),
  oneBigMove: { target: "T2", change: "Change T2 colour to reach 4.5:1", whyItMatters: "viewers miss details", expectedResult: "readable at distance" },
  topFixes: [{ target: "T2", criterion: "readability", problem: "low contrast", evidence: "T2 contrast 2.1:1", fix: "Change T2 colour so contrast reaches at least 4.5:1", whyItMatters: "viewers miss details", expectedResult: "readable", effort: "quick" }],
  keep: [], alternativeDirections: [], polish: [], ...overrides
});

describe("critique validator and final score", () => {
  it("accepts a grounded critique and rejects vague or unknown targets", () => {
    const f = facts();
    expect(validateCritique(critique(), f, runRules(f))).toEqual([]);
    expect(validateCritique(critique({ topFixes: [{ ...critique().topFixes[0], target: "T99" }] }), f, runRules(f)).join()).toContain("T99");
    expect(validateCritique(critique({ topFixes: [{ ...critique().topFixes[0], fix: "Improve the contrast" }] }), f, runRules(f)).join()).toContain("vague");
  });

  it("rejects ignoring a failed critical rule and score inflation", () => {
    const f = facts();
    const c = critique({ oneBigMove: { ...critique().oneBigMove, target: "LOGO1" }, topFixes: [{ ...critique().topFixes[0], target: "LOGO1", criterion: "branding", fix: "Enlarge logo by 30%" }] });
    expect(validateCritique(c, f, runRules(f)).join()).toContain("READ_CONTRAST");
    const inflated = critique();
    inflated.criteria.forEach((criterion) => { criterion.score = 9; });
    expect(validateCritique(inflated, f, runRules(f)).join()).toContain("Average");
  });

  it("caps failed-rule criteria in the final score and stays deterministic", () => {
    const f = facts();
    const c = critique();
    c.criteria.forEach((criterion) => { criterion.score = 9; });
    const weights = { hierarchy: 15, typography: 12, composition: 13, readability: 15, color: 10, cta: 10, branding: 10, clarity: 15 } as any;
    const capped = finalScore(c, runRules(f), weights);
    const cleanFacts = { ...f, elements: f.elements.map((element) => element.id === "T2" ? { ...element, contrast: 8 } : element) };
    const clean = finalScore(c, runRules(cleanFacts), weights);
    expect(capped).toBeLessThan(clean);
    expect(capped).toBe(finalScore(c, runRules(f), weights));
  });
});
