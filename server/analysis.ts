import { z } from "zod";
import { failedRules, type RuleResult } from "./rules.js";

export const categoryKeys = ["layoutHierarchy", "typography", "readabilityContrast", "imagery", "messageCta", "color", "branding"] as const;
export type CategoryKey = (typeof categoryKeys)[number];
export const posterTypes = ["Advertisement", "Promotional Offer", "Event", "Restaurant/Food", "Corporate", "Product", "Real Estate", "Educational", "Social Media", "Announcement", "General"] as const;
const posterTypeSet = new Set<string>(posterTypes);

export const categoryLabels: Record<CategoryKey, string> = {
  layoutHierarchy: "Layout & hierarchy",
  typography: "Typography",
  readabilityContrast: "Readability & contrast",
  imagery: "Imagery / graphics",
  messageCta: "Message & CTA",
  color: "Color",
  branding: "Branding"
};

type WeightProfile = Record<CategoryKey, number>;
const baseWeights: WeightProfile = {
  layoutHierarchy: .20,
  typography: .15,
  readabilityContrast: .15,
  imagery: .15,
  messageCta: .15,
  color: .10,
  branding: .10
};

// These profiles start from the review's recommended type-specific emphasis.
// Every profile sums to 1.0; conditional branding is redistributed at runtime.
export const posterTypeWeights: Record<string, WeightProfile> = {
  "Promotional Offer": { layoutHierarchy: .20, typography: .10, readabilityContrast: .15, imagery: .10, messageCta: .20, color: .10, branding: .15 },
  Event: { layoutHierarchy: .20, typography: .15, readabilityContrast: .15, imagery: .15, messageCta: .10, color: .10, branding: .15 },
  "Restaurant/Food": { layoutHierarchy: .15, typography: .10, readabilityContrast: .15, imagery: .25, messageCta: .10, color: .10, branding: .15 },
  Corporate: { layoutHierarchy: .15, typography: .20, readabilityContrast: .15, imagery: .15, messageCta: .05, color: .10, branding: .20 }
};

export function getWeights(posterType: string, brandingApplicable = true): WeightProfile {
  const profile = { ...(posterTypeWeights[posterType] || baseWeights) };
  const profileTotal = Object.values(profile).reduce((sum, weight) => sum + weight, 0);
  for (const key of categoryKeys) profile[key] = profileTotal > 0 ? profile[key] / profileTotal : baseWeights[key];
  if (!brandingApplicable) {
    const brandingWeight = profile.branding;
    profile.branding = 0;
    const totalWithoutBranding = 1 - brandingWeight;
    for (const key of categoryKeys) {
      if (key !== "branding") profile[key] = profile[key] + (profile[key] / totalWithoutBranding) * brandingWeight;
    }
  }
  return profile;
}

const checkSchema = z.object({
  name: z.string().trim().min(1).max(80),
  score: z.number().int().min(0).max(10),
  evidence: z.string().trim().min(1).max(500)
});
const rawCategorySchema = z.object({
  checks: z.array(checkSchema).min(2).max(3),
  strengths: z.array(z.string().trim().min(1).max(260)).min(1).max(4),
  issues: z.array(z.string().trim().min(1).max(260)).max(3)
});
const categoriesShape = {
  layoutHierarchy: rawCategorySchema,
  typography: rawCategorySchema,
  readabilityContrast: rawCategorySchema,
  imagery: rawCategorySchema,
  messageCta: rawCategorySchema,
  color: rawCategorySchema,
  branding: rawCategorySchema
} as const;

const elementSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60),
  label: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(180)
});

const critiqueSchema = z.object({
  intent: z.object({
    statement: z.string().trim().min(1).max(300),
    audience: z.string().trim().min(1).max(220),
    desiredAction: z.string().trim().min(1).max(220),
    unclear: z.boolean(),
    evidence: z.string().trim().min(1).max(400)
  }),
  rootCauses: z.array(z.object({
    target: z.string().trim().min(1).max(60),
    cause: z.string().trim().min(1).max(400),
    evidence: z.string().trim().min(1).max(400)
  })).min(1).max(2),
  oneBigMove: z.object({
    target: z.string().trim().min(1).max(60),
    change: z.string().trim().min(1).max(500)
  }),
  topFixes: z.array(z.object({
    target: z.string().trim().min(1).max(60),
    criterion: z.enum(["hierarchy", "typography", "composition", "readability", "color", "cta", "branding", "clarity"]),
    problem: z.string().trim().min(1).max(400),
    evidence: z.string().trim().min(1).max(400),
    measuredValue: z.string().trim().min(1).max(180),
    fix: z.string().trim().min(1).max(500),
    whyItMatters: z.string().trim().min(1).max(400),
    expectedResult: z.string().trim().min(1).max(300)
  })).min(1).max(3),
  keep: z.array(z.object({
    target: z.string().trim().min(1).max(60),
    whatWorks: z.string().trim().min(1).max(350)
  })).min(1).max(6),
  alternativeDirections: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    concept: z.string().trim().min(1).max(300),
    layout: z.string().trim().min(1).max(400)
  })).length(2).optional(),
  polish: z.array(z.object({
    target: z.string().trim().min(1).max(60),
    item: z.string().trim().min(1).max(300)
  })).min(1).max(6)
});

export const analysisSchema = z.object({
  isPoster: z.boolean(),
  posterType: z.enum(posterTypes),
  posterPurpose: z.string().trim().min(1).max(300),
  brandingApplicable: z.boolean(),
  notPosterReason: z.string().trim().min(1).max(500).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  limitations: z.array(z.string().trim().min(1).max(300)).max(5),
  firstNotice: z.string().trim().min(1).max(250),
  secondNotice: z.string().trim().min(1).max(250),
  thirdNotice: z.string().trim().min(1).max(250),
  targetOrderAssessment: z.string().trim().min(1).max(500),
  overallSummary: z.string().trim().min(1).max(700),
  elementMap: z.array(elementSchema).max(12),
  critique: critiqueSchema,
  categories: z.object(categoriesShape),
  strengths: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  improvements: z.array(z.object({
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    category: z.enum(categoryKeys),
    title: z.string().trim().min(1).max(120),
    problem: z.string().trim().min(1).max(500),
    evidence: z.string().trim().min(1).max(500),
    whyItMatters: z.string().trim().min(1).max(500),
    recommendation: z.string().trim().min(1).max(500),
    anchor: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional()
  })).min(1).max(6)
});

export type RawAnalysis = z.infer<typeof analysisSchema>;
export type Category = { score: number; checks: RawAnalysis["categories"][CategoryKey]["checks"]; strengths: string[]; issues: string[] };
export type FinalAnalysis = Omit<RawAnalysis, "categories"> & { categories: Record<CategoryKey, Category>; overallScore: number; ratingLabel: string; ruleResults?: RuleResult[]; demoMode?: boolean; lowConfidence?: boolean };

export function categoryScore(category: RawAnalysis["categories"][CategoryKey]): number {
  const average = category.checks.reduce((total, check) => total + check.score, 0) / category.checks.length;
  return Math.max(0, Math.min(100, Math.round(average * 10)));
}

export function calculateOverallScore(categories: Record<CategoryKey, Category | RawAnalysis["categories"][CategoryKey]>, posterType = "General", brandingApplicable = true): number {
  const weights = getWeights(posterType, brandingApplicable);
  const weighted = categoryKeys.reduce((total, key) => {
    const category = categories[key];
    const score = "score" in category ? category.score : categoryScore(category);
    return total + Math.max(0, Math.min(100, score)) * weights[key];
  }, 0);
  return Math.max(0, Math.min(100, Math.round(weighted)));
}

export function ratingLabel(score: number): string {
  if (score >= 90) return "Exceptional";
  if (score >= 80) return "Strong Design";
  if (score >= 70) return "Good Design";
  if (score >= 60) return "Needs Improvement";
  if (score >= 40) return "Weak Design";
  return "Major Redesign Needed";
}

const criterionToCategory: Record<string, CategoryKey> = { hierarchy: "layoutHierarchy", typography: "typography", composition: "layoutHierarchy", readability: "readabilityContrast", color: "color", cta: "messageCta", branding: "branding", clarity: "messageCta" };

function cappedCategoryScore(key: CategoryKey, category: RawAnalysis["categories"][CategoryKey], ruleResults: RuleResult[]) {
  const caps = failedRules(ruleResults)
    .filter((result) => criterionToCategory[result.criterion] === key && result.scoreCap !== undefined)
    .map((result) => result.scoreCap! * 10);
  return Math.min(categoryScore(category), ...caps, 100);
}

export function normalizeAnalysis(raw: RawAnalysis, demoMode = false, ruleResults: RuleResult[] = [], lowConfidence = false, unresolvedIssues: string[] = []): FinalAnalysis {
  const categories = Object.fromEntries(categoryKeys.map((key) => [key, { ...raw.categories[key], score: cappedCategoryScore(key, raw.categories[key], ruleResults) }])) as Record<CategoryKey, Category>;
  const overallScore = calculateOverallScore(categories, raw.posterType, raw.brandingApplicable);
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  const improvements = [...raw.improvements].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  const critique = overallScore < 60 ? raw.critique : { ...raw.critique, alternativeDirections: undefined };
  const reliabilityNote = "Structural feedback on legibility, hierarchy, spacing, and clarity is more reliable than style or concept taste. Style and concept comments are suggestions, not objective facts; calibration data should determine where this review is dependable.";
  let limitations = raw.isPoster && !raw.limitations.some((item) => item.startsWith("Structural feedback on legibility"))
    ? [...raw.limitations.slice(0, 4), reliabilityNote]
    : raw.limitations;
  if (lowConfidence) limitations = [...limitations, ...unresolvedIssues.slice(0, 4).map((issue) => `Unresolved review issue: ${issue}`)];
  return { ...raw, limitations, categories, improvements, critique, ruleResults, overallScore, ratingLabel: ratingLabel(overallScore), ...(demoMode ? { demoMode: true } : {}), ...(lowConfidence ? { lowConfidence: true } : {}) };
}

export function qualityCheck(result: RawAnalysis, ruleResults: RuleResult[] = []): string[] {
  const issues: string[] = [];
  if (!posterTypeSet.has(result.posterType)) issues.push(`Poster type is outside the supported classification set: ${result.posterType}`);
  if (!result.isPoster && Object.values(result.categories).some((category) => category.checks.some((check) => check.score !== 0))) issues.push("Non-poster images must not receive design scores.");
  if (!result.isPoster && !result.notPosterReason) issues.push("Explain why the image does not appear to be a poster.");
  if (result.isPoster) {
    for (const [key, category] of Object.entries(result.categories)) {
      if (category.checks.length < 2) issues.push(`${categoryLabels[key as CategoryKey]} needs at least two evidence checks.`);
      const checkNames = category.checks.map((check) => check.name.trim().toLowerCase());
      if (new Set(checkNames).size !== checkNames.length) issues.push(`${categoryLabels[key as CategoryKey]} contains duplicate check names.`);
    }
  }
  const seen = new Set<string>();
  const seenRecommendations = new Set<string>();
  for (const item of result.improvements) {
    const signature = item.title.trim().toLowerCase();
    if (seen.has(signature)) issues.push(`Duplicate improvement: ${item.title}`);
    seen.add(signature);
    const recommendationSignature = item.recommendation.trim().toLowerCase();
    if (seenRecommendations.has(recommendationSignature)) issues.push(`Duplicate recommendation: ${item.title}`);
    seenRecommendations.add(recommendationSignature);
    if (item.problem.length < 35 || item.evidence.length < 25 || item.whyItMatters.length < 35 || item.recommendation.length < 35) issues.push(`Improvement needs specific evidence, what, why, and how detail: ${item.title}`);
    if (!/[.!?]/.test(item.problem) || !/[.!?]/.test(item.evidence) || !/[.!?]/.test(item.recommendation)) issues.push(`Improvement should cite concrete visible evidence: ${item.title}`);
    if (!categoryKeys.includes(item.category)) issues.push(`Improvement has an unsupported category: ${item.title}`);
  }
  if (result.overallSummary.length < 40) issues.push("Overall summary is too generic.");
  if (result.strengths.length < 2) issues.push("At least two strengths are required.");
  const elementIds = new Set(result.elementMap.map((element) => element.id));
  if (result.isPoster && result.elementMap.length === 0) issues.push("A poster needs a grounded element map.");
  const critiqueTargets = [
    ...result.critique.rootCauses.map((item) => item.target),
    result.critique.oneBigMove.target,
    ...result.critique.topFixes.map((item) => item.target),
    ...result.critique.keep.map((item) => item.target),
    ...result.critique.polish.map((item) => item.target)
  ];
  if (critiqueTargets.some((target) => !elementIds.has(target))) issues.push("Every critique target must match an element ID in elementMap.");
  if (result.isPoster && result.critique.topFixes.length > 3) issues.push("Top fixes must contain no more than three items.");
  if (result.isPoster && calculateOverallScore(result.categories, result.posterType, result.brandingApplicable) < 60 && result.critique.alternativeDirections?.length !== 2) issues.push("Posters below 6/10 overall need exactly two alternative directions.");
  const failed = failedRules(ruleResults);
  for (const rule of failed) {
    const criterionFix = result.critique.topFixes.some((fix) => fix.criterion === rule.criterion);
    const targetFix = rule.targets.length === 0 || rule.targets.some((target) => result.critique.topFixes.some((fix) => fix.target === target) || result.critique.oneBigMove.target === target);
    if (rule.severity === "critical" && !criterionFix && !targetFix) issues.push(`Critical rule ${rule.ruleId} failed (${rule.evidence}) but is not addressed in the fixes.`);
    const category = criterionToCategory[rule.criterion];
    if (rule.scoreCap !== undefined && category && categoryScore(result.categories[category]) > rule.scoreCap * 10) issues.push(`${rule.criterion} draft score exceeds ${rule.ruleId} cap of ${rule.scoreCap}/10.`);
  }
  const scoredCriteria = categoryKeys.map((key) => categoryScore(result.categories[key]) / 10);
  if (scoredCriteria.length && scoredCriteria.reduce((sum, score) => sum + score, 0) / scoredCriteria.length > 7.5 && failed.some((rule) => rule.severity !== "minor")) issues.push("Draft scores are inflated relative to failed deterministic rules.");
  const ctaText = [...result.categories.messageCta.issues, ...result.categories.messageCta.strengths, ...result.improvements.map((item) => `${item.problem} ${item.recommendation}`)].join(" ").toLowerCase();
  const ctaScore = categoryScore(result.categories.messageCta);
  const saysNoCta = /\b(no|missing|absent|not present)\b[^.?!]{0,32}\bcta\b|\bcta\b[^.?!]{0,32}\b(no|missing|absent|not present)\b/.test(ctaText);
  const recommendsLargerCta = /\b(make|increase|enlarge|raise)\b[^.?!]{0,40}\bcta\b/.test(ctaText);
  if (saysNoCta && ctaScore >= 80) issues.push("Message & CTA score conflicts with feedback saying the CTA is absent.");
  if (saysNoCta && recommendsLargerCta) issues.push("CTA recommendation assumes a visible CTA after feedback says it is absent.");
  const allText = [result.overallSummary, ...result.strengths, ...Object.values(result.categories).flatMap((category) => [...category.strengths, ...category.issues, ...category.checks.map((check) => check.evidence)]), ...result.improvements.flatMap((item) => [item.problem, item.evidence, item.whyItMatters, item.recommendation])].join(" ").toLowerCase();
  const genericPhrases = ["improve the design", "use better typography", "make it pop", "add more color", "improve readability"];
  if (genericPhrases.some((phrase) => allText.includes(phrase))) issues.push("Feedback contains generic design advice.");
  return issues;
}

export const MAX_CORRECTION_ATTEMPTS = 2;
export type AnalysisCandidate = RawAnalysis | unknown;
export type AnalysisGenerator = (qcIssues?: string[]) => Promise<AnalysisCandidate>;
export type RuleResolver = (candidate: RawAnalysis) => RuleResult[];
export type AnalysisRunOptions = { deadlineAt?: number; minimumRemainingMs?: number; onPass?: (pass: number, qcIssueCount: number) => void };

export async function runQualityControlledAnalysis(generate: AnalysisGenerator, ruleResults: RuleResult[] = [], resolveRules?: RuleResolver, options: AnalysisRunOptions = {}) {
  let candidate: AnalysisCandidate | undefined;
  let bestValidCandidate: RawAnalysis | undefined;
  let bestRuleResults = ruleResults;
  let lastQcIssues: string[] = [];
  let attempts = 0;
  for (let correction = 0; correction <= MAX_CORRECTION_ATTEMPTS; correction += 1) {
    const remaining = options.deadlineAt === undefined ? Number.POSITIVE_INFINITY : options.deadlineAt - Date.now();
    const minimumRemainingMs = options.minimumRemainingMs ?? 25_000;
    if (remaining < minimumRemainingMs) {
      return bestValidCandidate
        ? { analysis: normalizeAnalysis(bestValidCandidate, false, bestRuleResults, true, lastQcIssues), attempts, qcIssues: lastQcIssues, stoppedReason: "TIMEOUT" as const }
        : { analysis: undefined, attempts, qcIssues: lastQcIssues, stoppedReason: "TIMEOUT" as const };
    }
    attempts += 1;
    options.onPass?.(attempts, lastQcIssues.length);
    try {
      candidate = await generate(correction === 0 ? [] : lastQcIssues);
    } catch (error) {
      if (bestValidCandidate) {
        const message = error instanceof Error ? error.message : "Provider did not complete the correction pass.";
        const issues = [...lastQcIssues, `Provider ended before correction completed: ${message}`];
        return { analysis: normalizeAnalysis(bestValidCandidate, false, bestRuleResults, true, issues), attempts, qcIssues: issues, stoppedReason: "TIMEOUT" as const };
      }
      throw error;
    }
    const parsed = analysisSchema.safeParse(candidate);
    if (parsed.success) {
      bestValidCandidate = parsed.data;
      const currentRuleResults = resolveRules ? resolveRules(parsed.data) : ruleResults;
      bestRuleResults = currentRuleResults;
      lastQcIssues = qualityCheck(parsed.data, currentRuleResults);
      if (lastQcIssues.length === 0) return { analysis: normalizeAnalysis(parsed.data, false, currentRuleResults), attempts, qcIssues: [] };
    } else lastQcIssues = ["The previous response did not match the required schema."];
    if (correction === MAX_CORRECTION_ATTEMPTS) break;
  }
  return bestValidCandidate
    ? { analysis: normalizeAnalysis(bestValidCandidate, false, bestRuleResults, true, lastQcIssues), attempts, qcIssues: lastQcIssues }
    : { analysis: undefined, attempts, qcIssues: lastQcIssues };
}

const demoRaw: RawAnalysis = {
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
  overallSummary: "The offer lands quickly and the brand feels recognizable, but the lower half asks the viewer to work too hard. A clearer action and a calmer type hierarchy would turn attention into a next step.",
  elementMap: [
    { id: "discount-headline", label: "10% discount headline", location: "Upper center focal area" },
    { id: "product-image", label: "Product image", location: "Center visual field" },
    { id: "supporting-copy", label: "Supporting copy", location: "Lower information block" },
    { id: "cta", label: "Call to action", location: "Lower action area" },
    { id: "brand-mark", label: "Brand mark", location: "Upper corner" }
  ],
  critique: {
    intent: {
      statement: "Sell a limited-time offer through the discount headline and direct the viewer to the lower action area.",
      audience: "Retail shoppers who can act during the promotion window.",
      desiredAction: "Read the offer, then use the CTA to visit the store.",
      unclear: false,
      evidence: "[discount-headline] states the offer; [cta] supplies the next step."
    },
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
    layoutHierarchy: { checks: [{ name: "Eye path", score: 9, evidence: "The discount is the first thing the eye notices." }, { name: "Spacing and balance", score: 8, evidence: "The main offer has generous breathing room, while the lower cluster is compressed." }], strengths: ["The offer has a clear entry point."], issues: ["The supporting copy competes with the action at the bottom."] },
    typography: { checks: [{ name: "Type hierarchy", score: 8, evidence: "The headline has a clear weight contrast." }, { name: "Type pairing", score: 8, evidence: "The restrained type pairing feels consistent." }], strengths: ["The headline has a clear weight contrast."], issues: ["Small supporting text loses distinction at mobile size."] },
    readabilityContrast: { checks: [{ name: "Contrast", score: 9, evidence: "Primary text has strong foreground/background contrast." }, { name: "Viewing distance", score: 8, evidence: "Secondary details need more spacing to scan quickly." }], strengths: ["Primary text is easy to read."], issues: ["Secondary details need more spacing."] },
    imagery: { checks: [{ name: "Relevance", score: 8, evidence: "The image supports the offer without competing with the headline." }, { name: "Integration", score: 8, evidence: "The image and type share a calm visual tone." }], strengths: ["The imagery supports the proposition."], issues: ["The image could connect more directly to the action."] },
    messageCta: { checks: [{ name: "Message clarity", score: 8, evidence: "The main proposition is understandable in one glance." }, { name: "Action visibility", score: 6, evidence: "The action area is visible but quieter than the discount." }], strengths: ["The offer is clear at a glance."], issues: ["The call to action is visually quieter than the offer."] },
    color: { checks: [{ name: "Palette", score: 9, evidence: "The restrained lime and charcoal palette feels ownable." }, { name: "Accent use", score: 9, evidence: "The accent creates a recognizable visual cue." }], strengths: ["The palette feels distinctive."], issues: ["The accent could be reserved more consistently for action."] },
    branding: { checks: [{ name: "Recognition", score: 8, evidence: "The logo is visible without taking over the offer." }, { name: "Consistency", score: 8, evidence: "The brand cue is consistent with the palette." }], strengths: ["The logo is present but restrained."], issues: ["A small brand cue could repeat near the action."] }
  },
  strengths: ["The 10% discount is immediately visible, giving the poster a strong entry point.", "The lime-and-charcoal palette feels distinctive and keeps the brand recognizable.", "The main message is understandable without reading every line.", "Spacing around the offer gives the focal point room to breathe."],
  improvements: [
    { priority: "HIGH", category: "messageCta", title: "Give the action a louder voice", problem: "The CTA is smaller and lower-contrast than the discount, so it reads like an afterthought.", evidence: "The action area is visible below the offer but has less scale and contrast than the 10% headline.", whyItMatters: "Attention only converts when the viewer knows what to do next.", recommendation: "Increase the CTA by approximately 20–30%, use the lime accent for it, and place it directly beneath the offer as one visual unit.", anchor: { x: 58, y: 82 } },
    { priority: "HIGH", category: "layoutHierarchy", title: "Simplify the lower third", problem: "The supporting details and action sit close together with similar visual weight.", evidence: "The lower third contains multiple lines with little separation before the action area.", whyItMatters: "A crowded ending makes the poster feel slower to scan, especially on a phone.", recommendation: "Remove one secondary line, add 16–24px of breathing room around the CTA, and keep only the detail that helps someone act.", anchor: { x: 50, y: 70 } },
    { priority: "MEDIUM", category: "typography", title: "Build a clearer type scale", problem: "The supporting copy is close enough in size to the CTA that the hierarchy softens.", evidence: "The supporting copy and action use similar visual scale in the lower section.", whyItMatters: "A stronger scale lets the viewer understand the message in the intended order.", recommendation: "Keep the headline dominant, reduce supporting copy by one step, and reserve the next-largest size for the action.", anchor: { x: 50, y: 35 } }
  ]
};

export const demoAnalysis: FinalAnalysis = normalizeAnalysis(demoRaw, true);
