import type { Criterion, Element, Facts, RuleResult } from "./rules";

export type CritiqueCriterion = {
  id: Criterion;
  applicable: boolean;
  score: number | null;
  reason: string;
  evidence: string[];
  ruleIds: string[];
};

export type PosterCritique = {
  intent: { purpose: string; audience: string; desiredAction: string; intentClear: boolean };
  threeSecondTest: { first: string; second: string; third: string; matchesIntent: boolean };
  rootCauses: string[];
  criteria: CritiqueCriterion[];
  oneBigMove: { target: string; change: string; whyItMatters: string; expectedResult: string };
  topFixes: Array<{ target: string; criterion: Criterion; problem: string; evidence: string; fix: string; whyItMatters: string; expectedResult: string; effort?: string }>;
  keep: unknown[];
  alternativeDirections: unknown[];
  polish: unknown[];
};

const VAGUE = /\b(improve|enhance|optimise|optimize|make it pop|better|consider|try to)\b/i;
const HAS_SPECIFIC = /(\d|%|px|x\b|increase|reduce|move|remove|replace|change .* to|reach)/i;

function elementIds(facts: Facts) {
  return new Set(facts.elements.map((element: Element) => element.id));
}

export function validateCritique(critique: PosterCritique, facts: Facts, results: RuleResult[]): string[] {
  const errors: string[] = [];
  const ids = elementIds(facts);
  const failed = results.filter((result) => !result.passed && !result.skipped && result.status !== "not_evaluated");

  for (const fix of critique.topFixes) {
    if (fix.target !== "overall layout" && !ids.has(fix.target)) errors.push(`Fix target "${fix.target}" is not a detected element.`);
    if (VAGUE.test(fix.fix) && !HAS_SPECIFIC.test(fix.fix)) errors.push(`Fix for ${fix.target} is vague: "${fix.fix}". Give a concrete, quantified action.`);
    if (!fix.evidence.trim()) errors.push(`Fix for ${fix.target} has no evidence.`);
  }

  const covered = new Set([critique.oneBigMove.target, ...critique.topFixes.map((fix) => fix.target)]);
  for (const rule of failed.filter((result) => result.severity === "critical")) {
    const addressed = rule.targets.length === 0 || rule.targets.some((target) => covered.has(target)) || critique.topFixes.some((fix) => fix.criterion === rule.criterion);
    if (!addressed) errors.push(`Critical rule ${rule.ruleId} failed (${rule.evidence}) but is not addressed in the fixes.`);
  }

  for (const rule of failed) {
    const criterion = critique.criteria.find((item) => item.id === rule.criterion);
    if (criterion?.score != null && rule.scoreCap !== undefined && criterion.score > rule.scoreCap + 1) errors.push(`${rule.criterion} scored ${criterion.score} but rule ${rule.ruleId} failed (${rule.evidence}); max is ${rule.scoreCap}.`);
    if (criterion && /good|strong|excellent|great|clear/i.test(criterion.reason) && rule.severity === "critical" && (criterion.score ?? 0) > 6) errors.push(`${rule.criterion} reason praises an area where ${rule.ruleId} failed.`);
  }

  const passedIds = results.filter((result) => result.passed && !result.skipped && result.status !== "not_evaluated").map((result) => result.ruleId);
  for (const fix of critique.topFixes) if (passedIds.some((id) => fix.evidence.includes(id))) errors.push(`Fix for ${fix.target} cites a rule that passed.`);

  const scores = critique.criteria.filter((criterion) => criterion.applicable && criterion.score != null).map((criterion) => criterion.score as number);
  const average = scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
  if (average > 7.5 && failed.some((rule) => rule.severity !== "minor")) errors.push(`Average ${average.toFixed(1)} is too high given failed rules.`);
  if (critique.alternativeDirections.length && average >= 6) errors.push("alternativeDirections must be empty when the average is 6 or above.");

  return errors;
}
