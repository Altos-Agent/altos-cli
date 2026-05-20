interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

const buckets = new Map<string, number[]>();

export class LocalRateLimitError extends Error {
  constructor(
    message = "Rate limit exceeded",
    public readonly statusCode = 429,
  ) {
    super(message);
    this.name = "LocalRateLimitError";
  }
}

export const assertLocalRateLimit = ({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: RateLimitOptions) => {
  const since = now - windowMs;
  const current = (buckets.get(key) ?? []).filter((timestamp) => timestamp > since);
  if (current.length >= limit) {
    buckets.set(key, current);
    throw new LocalRateLimitError();
  }
  current.push(now);
  buckets.set(key, current);
};

export const resetLocalRateLimits = () => {
  buckets.clear();
};

export const isLocalRateLimitError = (
  error: unknown,
): error is LocalRateLimitError => error instanceof LocalRateLimitError;
