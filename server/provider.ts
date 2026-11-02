export type ProviderErrorCategory =
  | "RATE_LIMIT"
  | "QUOTA"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "AUTH"
  | "BILLING"
  | "MODEL"
  | "INVALID_REQUEST"
  | "RESPONSE_FORMAT"
  | "NETWORK"
  | "UNKNOWN";

export type ProviderFailure = {
  category: ProviderErrorCategory;
  status?: number;
  retryAfterMs?: number;
};

export type RetryOptions = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  deadlineAt?: number;
  minimumRemainingMs?: number;
  onRetry?: (event: { attempt: number; nextAttempt: number; delayMs: number; failure: ProviderFailure }) => void;
};

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  try { return JSON.stringify(error).toLowerCase(); } catch { return ""; }
}

function statusFrom(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  const value = candidate.status ?? candidate.response?.status ?? (typeof candidate.code === "number" ? candidate.code : undefined);
  return typeof value === "number" ? value : undefined;
}

function headerValue(error: unknown, name: string) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { headers?: Headers | Record<string, string>; response?: { headers?: Headers | Record<string, string> } };
  const headers = candidate.headers ?? candidate.response?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  return headers[name] ?? headers[name.toLowerCase()];
}

export function retryAfterMilliseconds(error: unknown, now = Date.now()): number | undefined {
  const value = headerValue(error, "retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function classifyProviderError(error: unknown): ProviderFailure {
  const text = errorText(error);
  const status = statusFrom(error);
  const retryAfterMs = retryAfterMilliseconds(error);

  if (text.includes("deadline_exceeded") || /deadline expired|timed out|timeout|aborted|aborterror/.test(text) || status === 408) return { category: "TIMEOUT", status, retryAfterMs };
  if (status === 401 || /invalid api key|api key.*(invalid|expired)|unauthenticated/.test(text)) return { category: "AUTH", status };
  if (status === 403 && /billing|permission|forbidden|permission_denied/.test(text)) return { category: "BILLING", status };
  if (status === 404 || /model.*(not found|unavailable|unsupported)|not found.*model|no longer available/.test(text)) return { category: "MODEL", status };
  if (status === 400 || /invalid argument|invalid value|unsupported.*(request|parameter)|bad request/.test(text)) return { category: "INVALID_REQUEST", status };
  if (/quota|billing limit|exceeded.*quota/.test(text)) return { category: "QUOTA", status, retryAfterMs };
  if (status === 429 || /rate limit|too many requests|resource exhausted/.test(text)) return { category: "RATE_LIMIT", status, retryAfterMs };
  if (/econnreset|fetch failed|network error|socket hang up/.test(text)) return { category: "NETWORK", status, retryAfterMs };
  if (status !== undefined && TRANSIENT_STATUSES.has(status) || /high demand|temporarily unavailable|service unavailable|overloaded|unavailable/.test(text)) {
    return { category: "UNAVAILABLE", status, retryAfterMs };
  }
  if (/json|response format|empty analysis|malformed|parse/.test(text)) return { category: "RESPONSE_FORMAT", status };
  return { category: "UNKNOWN", status };
}

export function isRetryableProviderFailure(failure: ProviderFailure) {
  return failure.category === "RATE_LIMIT" || failure.category === "UNAVAILABLE" || failure.category === "NETWORK";
}

export class ProviderError extends Error {
  readonly failure: ProviderFailure;
  readonly model?: string;
  readonly retryCount: number;

  constructor(message: string, failure: ProviderFailure, options: { model?: string; retryCount?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.failure = failure;
    this.model = options.model;
    this.retryCount = options.retryCount ?? 0;
  }
}

export async function withProviderRetries<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const minimumRemainingMs = options.minimumRemainingMs ?? 25_000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.deadlineAt !== undefined && options.deadlineAt - Date.now() < minimumRemainingMs) {
      throw new ProviderError("The analysis budget expired before another provider attempt could start.", { category: "TIMEOUT" }, { retryCount: attempt - 1 });
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const failure = error instanceof ProviderError ? error.failure : classifyProviderError(error);
      if (attempt >= maxAttempts || !isRetryableProviderFailure(failure)) throw error;
      const exponential = Math.min(options.maxDelayMs, options.initialDelayMs * (2 ** (attempt - 1)));
      const jitter = exponential * options.jitterRatio * Math.random();
      let delayMs = Math.min(options.maxDelayMs, Math.max(failure.retryAfterMs ?? 0, Math.round(exponential + jitter)));
      if (options.deadlineAt !== undefined) {
        const remaining = options.deadlineAt - Date.now();
        if (remaining < minimumRemainingMs) {
          throw new ProviderError("The analysis budget expired before another provider attempt could start.", { category: "TIMEOUT" }, { retryCount: attempt });
        }
        delayMs = Math.min(delayMs, Math.max(0, remaining - minimumRemainingMs));
      }
      options.onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, failure });
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
