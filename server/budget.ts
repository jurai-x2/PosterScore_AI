export const DEFAULT_ANALYZE_TOTAL_BUDGET_MS = 100_000;
export const DEFAULT_PROVIDER_CALL_TIMEOUT_MS = 60_000;
export const MIN_REMAINING_MS = 25_000;

export function configuredMilliseconds(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(1_000, Math.floor(value))) : fallback;
}

export function analyzeTotalBudgetMs() {
  return configuredMilliseconds("ANALYZE_TOTAL_BUDGET_MS", DEFAULT_ANALYZE_TOTAL_BUDGET_MS, 10 * 60_000);
}

export function providerCallTimeoutMs() {
  return configuredMilliseconds("PROVIDER_CALL_TIMEOUT_MS", DEFAULT_PROVIDER_CALL_TIMEOUT_MS, 120_000);
}

export function remainingMilliseconds(deadlineAt?: number) {
  return deadlineAt === undefined ? Number.POSITIVE_INFINITY : Math.max(0, deadlineAt - Date.now());
}

export function hasMinimumTime(deadlineAt: number | undefined, minimumMs = MIN_REMAINING_MS) {
  return remainingMilliseconds(deadlineAt) >= minimumMs;
}
