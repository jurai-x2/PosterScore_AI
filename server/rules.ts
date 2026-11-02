import type { ImageMeasurements } from "./validation.js";

export type ElementKind = "headline" | "body" | "cta" | "logo" | "image" | "other";
export type Criterion = "hierarchy" | "typography" | "composition" | "readability" | "color" | "cta" | "branding" | "clarity";
export type RuleSeverity = "critical" | "major" | "minor";
export type RuleStatus = "passed" | "failed" | "not_evaluated";

export type Element = {
  id: string;
  kind: ElementKind;
  bbox?: { x: number; y: number; w: number; h: number };
  fontSizePct?: number;
  fontFamily?: string;
  contrast?: number;
  saliency?: number;
  detectionConfidence?: number;
  text?: string;
  caseStyle?: "upper" | "lower" | "mixed";
  align?: "left" | "center" | "right" | "justify";
  lineChars?: number;
  lineHeight?: number;
  weight?: number;
  edgeDensity?: number;
  textColor?: string;
};

export type Facts = {
  elements: Element[];
  paletteCount: number;
  whitespaceRatio: number;
  posterType: "event" | "sale_promo" | "informational" | "brand_minimal" | "general";
  detectionConfidence: number;
  wordCount: number;
  spellingErrors: string[];
  subject?: Element["bbox"];
  accentAreaPct?: number;
  ctaUsesAccent?: boolean;
  essentials: { date: boolean; venue: boolean; price: boolean; offer: boolean; validity: boolean; contact: boolean };
  sharpness?: number;
  direction: "ltr" | "rtl";
};

export type RuleResult = {
  ruleId: string;
  criterion: Criterion;
  passed: boolean;
  status: RuleStatus;
  skipped?: boolean;
  severity: RuleSeverity;
  targets: string[];
  evidence: string;
  scoreCap?: number;
  basis: Basis;
  tradition?: string;
};

export type RuleCheckResult = { passed: boolean; status?: RuleStatus; targets: string[]; evidence: string; skipped?: boolean };

export type Basis = "standard" | "principle" | "heuristic";

export type Rule = {
  id: string;
  criterion: Criterion;
  principle: string;
  basis: Basis;
  tradition?: string;
  severity: RuleSeverity;
  scoreCap?: number;
  appliesTo?: Facts["posterType"][];
  needs?: (keyof Facts)[];
  check: (facts: Facts) => RuleCheckResult;
};

const text = (facts: Facts) => facts.elements.filter((element) => ["headline", "body", "cta"].includes(element.kind));
const uniq = <T,>(values: T[]) => [...new Set(values)];

function notEvaluated(evidence: string): RuleCheckResult {
  return { passed: true, status: "not_evaluated", targets: [], evidence, skipped: true };
}

export const RULES: Rule[] = [
  {
    id: "READ_CONTRAST",
    criterion: "readability",
    principle: "Text must have enough contrast to be read at a glance.",
    basis: "standard",
    tradition: "WCAG 2.x contrast guidelines",
    severity: "critical",
    scoreCap: 6,
    check: (facts) => {
      const items = text(facts);
      if (!items.length || items.some((element) => element.contrast === undefined)) return notEvaluated("not evaluated: OCR/layout contrast metrics are unavailable");
      const bad = items.filter((element) => element.contrast! < (element.kind === "headline" ? 3 : 4.5));
      return { passed: bad.length === 0, status: bad.length ? "failed" : "passed", targets: bad.map((element) => element.id), evidence: bad.map((element) => `${element.id} contrast ${element.contrast!.toFixed(1)}:1`).join("; ") || "all detected text passes contrast threshold" };
    }
  },
  {
    id: "HIER_DOMINANT_HEADLINE",
    criterion: "hierarchy",
    principle: "One element must clearly dominate; the headline should be much larger than body text.",
    basis: "principle",
    tradition: "Contrast and focal-point principles",
    severity: "critical",
    scoreCap: 5,
    check: (facts) => {
      const headline = facts.elements.find((element) => element.kind === "headline");
      const bodySizes = facts.elements.filter((element) => element.kind === "body" && element.fontSizePct).map((element) => element.fontSizePct!);
      if (!headline?.fontSizePct || !bodySizes.length) return notEvaluated("not evaluated: headline/body text size metrics are unavailable");
      const ratio = headline.fontSizePct / Math.max(...bodySizes, 0.0001);
      return { passed: ratio >= 2, status: ratio >= 2 ? "passed" : "failed", targets: [headline.id], evidence: `headline/body ratio ${ratio.toFixed(1)}x (target >= 2x)` };
    }
  },
  {
    id: "TYPE_MAX_FAMILIES",
    criterion: "typography",
    principle: "Use at most two typefaces; consistency beats variety.",
    basis: "principle",
    tradition: "Limited-typeface typographic discipline",
    severity: "major",
    scoreCap: 6,
    check: (facts) => {
      const families = uniq(text(facts).map((element) => element.fontFamily).filter(Boolean));
      if (!text(facts).length || text(facts).some((element) => !element.fontFamily)) return notEvaluated("not evaluated: OCR font-family detection is unavailable");
      return { passed: families.length <= 2, status: families.length <= 2 ? "passed" : "failed", targets: [], evidence: `${families.length} families: ${families.join(", ")}` };
    }
  },
  {
    id: "COMP_SAFE_MARGIN",
    criterion: "composition",
    principle: "Keep content off the edges; margins give the layout room.",
    basis: "principle",
    tradition: "Grid and margin practice",
    severity: "major",
    scoreCap: 6,
    check: (facts) => {
      const positioned = facts.elements.filter((element) => element.kind !== "image" && element.bbox);
      if (!positioned.length || positioned.length !== facts.elements.filter((element) => element.kind !== "image").length) return notEvaluated("not evaluated: element bounding boxes are unavailable");
      const margin = 0.05;
      const bad = positioned.filter((element) => element.bbox!.x < margin || element.bbox!.y < margin || element.bbox!.x + element.bbox!.w > 1 - margin || element.bbox!.y + element.bbox!.h > 1 - margin);
      return { passed: bad.length === 0, status: bad.length ? "failed" : "passed", targets: bad.map((element) => element.id), evidence: bad.length ? `${bad.map((element) => element.id).join(", ")} inside the 5% edge margin` : "margins respected" };
    }
  },
  {
    id: "READ_MIN_SIZE",
    criterion: "readability",
    principle: "Secondary information still has to be readable from distance.",
    basis: "heuristic",
    severity: "major",
    scoreCap: 6,
    check: (facts) => {
      const items = text(facts);
      if (!items.length || items.some((element) => element.fontSizePct === undefined)) return notEvaluated("not evaluated: OCR text-height metrics are unavailable");
      const bad = items.filter((element) => (element.fontSizePct ?? 1) < 1.2);
      return { passed: bad.length === 0, status: bad.length ? "failed" : "passed", targets: bad.map((element) => element.id), evidence: bad.map((element) => `${element.id} height ${element.fontSizePct!.toFixed(1)}% of poster`).join("; ") || "no text below the 1.2% height heuristic" };
    }
  },
  {
    id: "COLOR_PALETTE_LIMIT",
    criterion: "color",
    principle: "A restrained palette feels coherent.",
    basis: "heuristic",
    severity: "minor",
    check: (facts) => ({ passed: facts.paletteCount <= 5, status: facts.paletteCount <= 5 ? "passed" : "failed", targets: [], evidence: `${facts.paletteCount} dominant colours (target <= 5)` })
  },
  {
    id: "CTA_SINGLE_PRIMARY",
    criterion: "cta",
    principle: "One clear next step beats several competing ones.",
    basis: "principle",
    tradition: "Focal-point and conversion-design practice",
    severity: "critical",
    scoreCap: 3,
    appliesTo: ["event", "sale_promo"],
    check: (facts) => {
      const ctas = facts.elements.filter((element) => element.kind === "cta");
      if (!facts.elements.length) return notEvaluated("not evaluated: CTA detection is unavailable");
      return { passed: ctas.length === 1, status: ctas.length === 1 ? "passed" : "failed", targets: ctas.map((element) => element.id), evidence: `${ctas.length} CTA(s) detected` };
    }
  },
  {
    id: "CTA_SALIENT",
    criterion: "cta",
    principle: "The action should sit where the eye already goes.",
    basis: "principle",
    tradition: "Visual attention and saliency research",
    severity: "major",
    appliesTo: ["event", "sale_promo"],
    check: (facts) => {
      const cta = facts.elements.find((element) => element.kind === "cta");
      if (!cta?.saliency) return notEvaluated("not evaluated: CTA saliency is unavailable");
      const passed = cta.saliency >= 0.5;
      return { passed, status: passed ? "passed" : "failed", targets: [cta.id], evidence: `CTA saliency ${cta.saliency.toFixed(2)} (target >= 0.5)` };
    }
  }
];

const area = (element: Element) => element.bbox ? element.bbox.w * element.bbox.h : 0;
const overlap = (a?: Element["bbox"], b?: Element["bbox"]) => {
  if (!a || !b) return 0;
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
};
const textEls = (facts: Facts) => facts.elements.filter((element) => ["headline", "body", "cta"].includes(element.kind));
const bodyEls = (facts: Facts) => facts.elements.filter((element) => element.kind === "body");
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const std = (values: number[]) => Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
const ACTION_VERBS = /^(book|buy|call|join|register|scan|visit|order|shop|get|save|reserve|subscribe|learn|apply|download|claim|contact|rsvp)/i;
const needsElements = (facts: Facts, evidence: string) => facts.elements.length ? undefined : notEvaluated(evidence);

export const MORE_RULES: Rule[] = [
  { id: "HIER_FOCAL_SALIENCY", criterion: "hierarchy", severity: "major", scoreCap: 6, basis: "principle", principle: "The eye should land on the headline or main subject first.", tradition: "Focal point and visual attention research", check: (facts) => { const unavailable = needsElements(facts, "not evaluated: element detection is unavailable"); if (unavailable) return unavailable; const headline = facts.elements.find((element) => element.kind === "headline"); if (!headline) return notEvaluated("not evaluated: no headline detected"); const top2 = [...facts.elements].sort((a, b) => (b.saliency ?? 0) - (a.saliency ?? 0)).slice(0, 2).map((element) => element.id); const passed = top2.includes(headline.id); return { passed, status: passed ? "passed" : "failed", targets: [headline.id], evidence: `most salient elements: ${top2.join(", ")}; headline is ${headline.id}` }; } },
  { id: "HIER_LEVELS", criterion: "hierarchy", severity: "minor", basis: "heuristic", principle: "Good posters show distinct levels: headline, support, detail.", check: (facts) => { if (!textEls(facts).length || textEls(facts).some((element) => element.fontSizePct === undefined)) return notEvaluated("not evaluated: text-size metrics are unavailable"); const sizes = [...new Set(textEls(facts).map((element) => Math.round((element.fontSizePct ?? 0) * 2) / 2))].sort((a, b) => b - a); const steps = sizes.slice(1).filter((size, index) => sizes[index] / size >= 1.3).length + 1; const passed = steps >= 3 || facts.wordCount < 12; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `${steps} distinct size level(s) (target >= 3)` }; } },
  { id: "HIER_HEADLINE_LENGTH", criterion: "hierarchy", severity: "minor", basis: "heuristic", principle: "A headline should be scannable in a glance.", check: (facts) => { const headline = facts.elements.find((element) => element.kind === "headline"); if (!headline?.text) return notEvaluated("not evaluated: headline OCR is unavailable"); const words = headline.text.trim().split(/\s+/).length; const passed = words <= 8; return { passed, status: passed ? "passed" : "failed", targets: [headline.id], evidence: `headline has ${words} words (target <= 8)` }; } },
  { id: "COMP_BALANCE", criterion: "composition", severity: "minor", basis: "principle", principle: "Visual weight should feel balanced, not piled into one corner.", tradition: "Visual balance", check: (facts) => { const els = facts.elements.filter((element) => area(element) > 0 && element.bbox); if (!els.length) return notEvaluated("not evaluated: element bounding boxes are unavailable"); const total = els.reduce((sum, element) => sum + area(element), 0) || 1; const cx = els.reduce((sum, element) => sum + (element.bbox!.x + element.bbox!.w / 2) * area(element), 0) / total; const cy = els.reduce((sum, element) => sum + (element.bbox!.y + element.bbox!.h / 2) * area(element), 0) / total; const off = Math.hypot(cx - .5, cy - .5); const passed = off <= .15; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `visual centre is ${(off * 100).toFixed(0)}% off-centre (target <= 15%)` }; } },
  { id: "COMP_PROXIMITY_GROUPING", criterion: "composition", severity: "major", basis: "principle", principle: "Related items sit close together, unrelated items sit apart.", tradition: "Proximity", check: (facts) => { const t = textEls(facts).filter((element) => element.bbox).sort((a, b) => a.bbox!.y - b.bbox!.y); if (t.length < 4) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: too few positioned text blocks to judge" }; const gaps = t.slice(1).map((element, index) => element.bbox!.y - (t[index].bbox!.y + t[index].bbox!.h)); const min = Math.min(...gaps), max = Math.max(...gaps); const flat = max > 0 && min / max > .8; return { passed: !flat, status: flat ? "failed" : "passed", targets: [], evidence: `smallest gap ${(min * 100).toFixed(1)}%, largest ${(max * 100).toFixed(1)}% - ${flat ? "all gaps similar, no visible groups" : "groups are distinguishable"}` }; } },
  { id: "COMP_SPACING_CONSISTENCY", criterion: "composition", severity: "minor", basis: "heuristic", principle: "Spacing should follow a rhythm, not look random.", check: (facts) => { const t = textEls(facts).filter((element) => element.bbox).sort((a, b) => a.bbox!.y - b.bbox!.y); if (t.length < 3) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: too few positioned text blocks" }; const gaps = t.slice(1).map((element, index) => element.bbox!.y - (t[index].bbox!.y + t[index].bbox!.h)); const distinct = [...new Set(gaps.map((gap) => Math.round(gap * 40)))].length; const passed = distinct <= 3; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `${distinct} distinct spacing values (target <= 3)` }; } },
  { id: "COMP_NO_COLLISION", criterion: "composition", severity: "major", scoreCap: 6, basis: "principle", principle: "Text blocks must not overlap each other.", check: (facts) => { const t = textEls(facts).filter((element) => element.bbox); if (t.length !== textEls(facts).length) return notEvaluated("not evaluated: text bounding boxes are unavailable"); const bad: string[] = []; for (let i = 0; i < t.length; i += 1) for (let j = i + 1; j < t.length; j += 1) if (overlap(t[i].bbox, t[j].bbox) / Math.min(area(t[i]), area(t[j])) > .1) bad.push(`${t[i].id}/${t[j].id}`); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.flatMap((pair) => pair.split("/")), evidence: bad.length ? `overlapping: ${bad.join(", ")}` : "no collisions" }; } },
  { id: "COMP_TEXT_OFF_SUBJECT", criterion: "composition", severity: "major", basis: "principle", principle: "Don't place text over the main subject or a face.", needs: ["subject"], check: (facts) => { if (!facts.subject) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: no subject detected" }; const positioned = textEls(facts).filter((element) => element.bbox); if (positioned.length !== textEls(facts).length) return notEvaluated("not evaluated: text bounding boxes are unavailable"); const bad = positioned.filter((element) => overlap(element.bbox, facts.subject) / Math.max(area(element), .0001) > .15); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.length ? `${bad.map((element) => element.id).join(", ")} overlap the main subject` : "text clear of subject" }; } },
  { id: "COMP_ALIGN_MIXING", criterion: "composition", severity: "minor", basis: "principle", principle: "Pick one alignment style and stay with it.", tradition: "Alignment", check: (facts) => { const styles = [...new Set(bodyEls(facts).concat(facts.elements.filter((element) => element.kind === "headline")).map((element) => element.align).filter(Boolean))]; if (!styles.length) return notEvaluated("not evaluated: text alignment detection is unavailable"); const passed = styles.length <= 2; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `alignment styles used: ${styles.join(", ")}` }; } },
  { id: "TYPE_WEIGHT_LIMIT", criterion: "typography", severity: "minor", basis: "heuristic", principle: "A few weights are enough; more makes the poster noisy.", check: (facts) => { const items = textEls(facts); if (!items.length || items.some((element) => element.weight === undefined)) return notEvaluated("not evaluated: font-weight detection is unavailable"); const weights = [...new Set(items.map((element) => Math.round((element.weight ?? 400) / 100)))]; const passed = weights.length <= 3; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `${weights.length} font weights (target <= 3)` }; } },
  { id: "TYPE_LINE_HEIGHT", criterion: "typography", severity: "minor", basis: "heuristic", principle: "Body text needs breathing room between lines.", check: (facts) => { const items = bodyEls(facts); if (!items.length || items.some((element) => element.lineHeight === undefined)) return notEvaluated("not evaluated: line-height detection is unavailable"); const bad = items.filter((element) => element.lineHeight! < 1.15 || element.lineHeight! > 1.7); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.map((element) => `${element.id} line-height ${element.lineHeight!.toFixed(2)}`).join("; ") || "line spacing fine" }; } },
  { id: "TYPE_LINE_LENGTH", criterion: "typography", severity: "minor", basis: "heuristic", principle: "Lines of body text shouldn't be too short or too long.", tradition: "Typographic convention", check: (facts) => { const items = bodyEls(facts); if (!items.length || items.some((element) => element.lineChars === undefined)) return notEvaluated("not evaluated: OCR line-length detection is unavailable"); const bad = items.filter((element) => element.lineChars! < 25 || element.lineChars! > 80); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.map((element) => `${element.id} ${element.lineChars} chars/line`).join("; ") || "line lengths fine" }; } },
  { id: "READ_ALLCAPS_LONG", criterion: "readability", severity: "minor", basis: "principle", principle: "All caps is fine for a short headline but tiring in longer text.", tradition: "Typographic convention", check: (facts) => { const items = bodyEls(facts); if (!items.length || items.some((element) => !element.text || !element.caseStyle)) return notEvaluated("not evaluated: OCR case-style detection is unavailable"); const bad = items.filter((element) => element.caseStyle === "upper" && (element.text?.length ?? 0) > 30); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.length ? `${bad.map((element) => element.id).join(", ")} set in long all caps` : "no long all-caps text" }; } },
  { id: "READ_BUSY_BACKGROUND", criterion: "readability", severity: "major", scoreCap: 6, basis: "heuristic", principle: "Text over a busy image needs an overlay, a solid block, or a calmer area.", check: (facts) => { const items = textEls(facts); if (!items.length || items.some((element) => element.edgeDensity === undefined || element.contrast === undefined)) return notEvaluated("not evaluated: local background and contrast metrics are unavailable"); const bad = items.filter((element) => element.edgeDensity! > .35 && element.contrast! < 7); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.map((element) => `${element.id} edge density ${(element.edgeDensity! * 100).toFixed(0)}%, contrast ${element.contrast!.toFixed(1)}:1`).join("; ") || "no text on busy areas" }; } },
  { id: "READ_CENTERED_PARAGRAPH", criterion: "readability", severity: "minor", basis: "principle", principle: "Centered text works for a few lines, not paragraphs.", check: (facts) => { const items = bodyEls(facts); if (!items.length || items.some((element) => element.align === undefined || element.lineChars === undefined || element.text === undefined)) return notEvaluated("not evaluated: OCR alignment and line metrics are unavailable"); const bad = items.filter((element) => element.align === "center" && element.lineChars! > 0 && element.text!.length / element.lineChars! > 3); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.length ? `${bad.map((element) => element.id).join(", ")} is a centered paragraph (> 3 lines)` : "no centered paragraphs" }; } },
  { id: "COLOR_ACCENT_RESTRAINT", criterion: "color", severity: "minor", basis: "heuristic", principle: "An accent colour works because it is used sparingly.", needs: ["accentAreaPct"], check: (facts) => { if (facts.accentAreaPct === undefined) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: no accent measured" }; const passed = facts.accentAreaPct >= 2 && facts.accentAreaPct <= 25; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `accent covers ${facts.accentAreaPct.toFixed(0)}% (target 2-25%)` }; } },
  { id: "COLOR_TEXT_COLOR_LIMIT", criterion: "color", severity: "minor", basis: "heuristic", principle: "Too many text colours look unplanned.", check: (facts) => { const items = textEls(facts); if (!items.length || items.some((element) => !element.textColor)) return notEvaluated("not evaluated: text-colour detection is unavailable"); const colors = [...new Set(items.map((element) => element.textColor))]; const passed = colors.length <= 3; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `${colors.length} text colours (target <= 3)` }; } },
  { id: "CTA_DISTINCT", criterion: "cta", severity: "major", scoreCap: 6, basis: "principle", principle: "The CTA must look different from body text: bigger, bolder, or boxed.", appliesTo: ["event", "sale_promo"], check: (facts) => { const cta = facts.elements.find((element) => element.kind === "cta"); const body = Math.max(...bodyEls(facts).map((element) => element.fontSizePct ?? 0), 0); if (!cta || cta.fontSizePct === undefined || cta.contrast === undefined || !body) return notEvaluated("not evaluated: CTA and body metrics are unavailable"); const passed = cta.fontSizePct >= body * 1.2 && cta.contrast >= 3; return { passed, status: passed ? "passed" : "failed", targets: [cta.id], evidence: `CTA size ${cta.fontSizePct.toFixed(1)}% vs body ${body.toFixed(1)}%, contrast ${cta.contrast.toFixed(1)}:1` }; } },
  { id: "CTA_ACTION_WORDING", criterion: "cta", severity: "major", basis: "principle", principle: "A CTA should say what to do, not just what it is.", appliesTo: ["event", "sale_promo"], check: (facts) => { const cta = facts.elements.find((element) => element.kind === "cta"); if (!cta?.text) return notEvaluated("not evaluated: CTA OCR is unavailable"); const passed = ACTION_VERBS.test(cta.text.trim()); return { passed, status: passed ? "passed" : "failed", targets: [cta.id], evidence: `CTA text: "${cta.text}"` }; } },
  { id: "BRAND_LOGO_SIZE", criterion: "branding", severity: "major", basis: "heuristic", principle: "A logo must be visible but shouldn't overpower the message.", check: (facts) => { const logo = facts.elements.find((element) => element.kind === "logo"); if (!logo?.bbox) return notEvaluated("not evaluated: logo bounding box is unavailable"); const pct = area(logo) * 100; const max = facts.posterType === "brand_minimal" ? 20 : 10; const passed = pct >= .8 && pct <= max; return { passed, status: passed ? "passed" : "failed", targets: [logo.id], evidence: `logo covers ${pct.toFixed(1)}% (target 0.8-${max}%)` }; } },
  { id: "BRAND_LOGO_CLEARSPACE", criterion: "branding", severity: "minor", basis: "principle", principle: "A logo needs empty space around it.", tradition: "Standard logo clear-space practice in brand guidelines", check: (facts) => { const logo = facts.elements.find((element) => element.kind === "logo"); if (!logo?.bbox) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: no logo bounding box" }; const pad = logo.bbox.h * .5; const zone = { x: logo.bbox.x - pad, y: logo.bbox.y - pad, w: logo.bbox.w + 2 * pad, h: logo.bbox.h + 2 * pad }; const bad = facts.elements.filter((element) => element.id !== logo.id && element.kind !== "image" && overlap(element.bbox, zone) > 0); const passed = bad.length === 0; return { passed, status: passed ? "passed" : "failed", targets: bad.map((element) => element.id), evidence: bad.length ? `${bad.map((element) => element.id).join(", ")} intrudes on the logo's clear space` : "clear space respected" }; } },
  { id: "CLAR_WORD_BUDGET", criterion: "clarity", severity: "major", basis: "heuristic", principle: "A poster is read in seconds; the word count should match its job.", check: (facts) => { if (!facts.elements.length) return notEvaluated("not evaluated: OCR word count is unavailable"); const max = ({ event: 60, sale_promo: 40, informational: 150, brand_minimal: 25, general: 150 } as Record<Facts["posterType"], number>)[facts.posterType]; const passed = facts.wordCount <= max; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `${facts.wordCount} words (target <= ${max} for ${facts.posterType})` }; } },
  { id: "CLAR_ESSENTIALS", criterion: "clarity", severity: "critical", scoreCap: 5, basis: "principle", principle: "Viewers must be able to act: the key facts have to be on the poster.", appliesTo: ["event", "sale_promo"], check: (facts) => { if (!facts.elements.length) return notEvaluated("not evaluated: OCR is unavailable for essentials detection"); const need = facts.posterType === "event" ? ["date", "venue", "contact"] : ["offer", "validity", "contact"]; const missing = need.filter((key) => !facts.essentials[key as keyof Facts["essentials"]]); const passed = missing.length === 0; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: missing.length ? `missing: ${missing.join(", ")}` : "all essentials present" }; } },
  { id: "CLAR_SPELLING", criterion: "clarity", severity: "major", scoreCap: 6, basis: "principle", principle: "Typos undermine trust immediately.", check: (facts) => { if (!facts.elements.length) return notEvaluated("not evaluated: OCR spelling data is unavailable"); const passed = facts.spellingErrors.length === 0; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: passed ? "no spelling errors found" : `possible errors: ${facts.spellingErrors.slice(0, 5).join(", ")}` }; } },
  { id: "CLAR_IMAGE_SHARPNESS", criterion: "clarity", severity: "major", scoreCap: 6, basis: "standard", principle: "Blurry or pixelated images make the poster look unprofessional.", needs: ["sharpness"], check: (facts) => { if (facts.sharpness === undefined) return { passed: true, status: "not_evaluated", targets: [], evidence: "not evaluated: sharpness was not measured" }; const passed = facts.sharpness >= .25; return { passed, status: passed ? "passed" : "failed", targets: [], evidence: `sharpness ${facts.sharpness.toFixed(2)} (target >= 0.25; calibrate on your own samples)` }; } }
];

export function posterTypeForRules(posterType: string): Facts["posterType"] {
  if (posterType === "Event") return "event";
  if (posterType === "Promotional Offer") return "sale_promo";
  if (posterType === "Corporate" || posterType === "Educational" || posterType === "Announcement") return "informational";
  if (posterType === "General") return "general";
  return "brand_minimal";
}

export function factsFromMeasurements(measurements: ImageMeasurements, posterType: string, elements: Element[] = []): Facts {
  return {
    elements,
    paletteCount: measurements.dominantColors.length,
    whitespaceRatio: measurements.estimatedWhitespacePercent / 100,
    posterType: posterTypeForRules(posterType),
    detectionConfidence: elements.length ? Math.min(...elements.map((element) => element.detectionConfidence ?? 0)) : 0,
    wordCount: 0,
    spellingErrors: [],
    accentAreaPct: undefined,
    ctaUsesAccent: undefined,
    essentials: { date: false, venue: false, price: false, offer: false, validity: false, contact: false },
    sharpness: undefined,
    direction: "ltr"
  };
}

export function runRules(facts: Facts): RuleResult[] {
  return ALL_RULES
    .filter((rule) => !rule.appliesTo || rule.appliesTo.includes(facts.posterType))
    .map((rule) => {
      const missing = rule.needs?.some((key) => facts[key] === undefined);
      const layoutSkipped = facts.detectionConfidence < .6 && (rule.criterion === "hierarchy" || rule.criterion === "composition");
      const result = missing || layoutSkipped
        ? { passed: true, status: "not_evaluated" as const, targets: [], evidence: layoutSkipped ? "not evaluated: detection confidence below 0.60" : `not evaluated: required fact(s) unavailable (${rule.needs?.join(", ")})` }
        : rule.check(facts);
      const skipped = result.status === "not_evaluated" || "skipped" in result && result.skipped === true;
      const status = skipped ? "not_evaluated" : result.status || (result.passed ? "passed" : "failed");
      return { ruleId: rule.id, criterion: rule.criterion, severity: rule.severity, scoreCap: rule.scoreCap, basis: rule.basis, tradition: rule.tradition, passed: skipped ? true : result.passed, status, skipped, targets: result.targets, evidence: result.evidence };
    });
}

export const ALL_RULES: Rule[] = [...RULES, ...MORE_RULES];

export function failedRules(results: RuleResult[]) {
  return results.filter((result) => result.status === "failed");
}

export function rulePromptText(results: RuleResult[]) {
  return results.map((result) => `${result.ruleId} | ${result.status} | ${result.severity} | basis=${result.basis} | ${result.evidence}${result.scoreCap === undefined ? "" : ` | score cap ${result.scoreCap}/10`}`).join("\n") || "No deterministic rules were evaluated.";
}
