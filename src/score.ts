import type { Criterion, RuleResult } from "./rules";
import type { PosterCritique } from "./validate";

export function finalScore(critique: PosterCritique, results: RuleResult[], weights: Record<Criterion, number>) {
  let total = 0;
  let weightSum = 0;
  for (const criterion of critique.criteria) {
    if (!criterion.applicable || criterion.score == null) continue;
    let score = criterion.score;
    for (const rule of results.filter((result) => !result.passed && !result.skipped && result.status !== "not_evaluated" && result.criterion === criterion.id && result.scoreCap !== undefined)) score = Math.min(score, rule.scoreCap as number);
    const extraDeductions = results.filter((result) => !result.passed && !result.skipped && result.status !== "not_evaluated" && result.criterion === criterion.id && result.severity !== "critical").length;
    score = Math.max(0, score - .3 * extraDeductions);
    const weight = weights[criterion.id] || 0;
    total += score * weight;
    weightSum += weight;
  }
  return weightSum ? Math.round((total / weightSum) * 10) : 0;
}
