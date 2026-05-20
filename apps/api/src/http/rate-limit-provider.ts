import type { RuntimeConfig } from "../config/env.js";

export interface RateLimitProvider {
  readonly name: "redis" | "memory";
  readonly isDistributed: boolean;
  assertLimit(key: string, limit: number, windowMs: number): Promise<void>;
  getLimit(key: string, limit: number, windowMs: number): Promise<{
    consumed: number;
    remaining: number;
    resetAt: number;
  }>;
}

export class RateLimitExceeded extends Error {
  constructor(
    public readonly statusCode: 429,
    public readonly retryAfterMs: number | undefined,
    message = "Rate limit exceeded"
  ) {
    super(message);
    this.name = "RateLimitExceeded";
  }
}

const warnAboutMemoryFallback = () => {
  console.warn(
    "[rate-limit] REDIS_URL is not configured or unreachable; " +
      "falling back to in-memory rate limiting. " +
      "This is appropriate only for local development or demo environments. " +
      "Production deployments should configure a Redis instance for distributed rate limiting."
  );
};

export const createInMemoryProvider = (): RateLimitProvider => {
  const buckets = new Map<string, number[]>();

  const clean = (key: string, now: number, windowMs: number) => {
    const since = now - windowMs;
    const current = (buckets.get(key) ?? []).filter((ts) => ts > since);
    if (current.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, current);
    }
  };

  return {
    name: "memory",
    isDistributed: false,

    async assertLimit(key: string, limit: number, windowMs: number): Promise<void> {
      const now = Date.now();
      const since = now - windowMs;
      clean(key, now, windowMs);
      const current = (buckets.get(key) ?? []).filter((ts) => ts > since);
      if (current.length >= limit) {
        const oldest = current[0];
        const retryAfterMs = (oldest ?? 0) + windowMs - now;
        throw new RateLimitExceeded(429, retryAfterMs > 0 ? retryAfterMs : 1);
      }
      current.push(now);
      buckets.set(key, current);
    },

    async getLimit(key: string, limit: number, windowMs: number) {
      const now = Date.now();
      const since = now - windowMs;
      clean(key, now, windowMs);
      const current = (buckets.get(key) ?? []).filter((ts) => ts > since);
      const consumed = current.length;
      const remaining = Math.max(0, limit - consumed);
      const resetAt =
        current.length > 0 ? (current[0] ?? 0) + windowMs : now + windowMs;
      return { consumed, remaining, resetAt };
    },
  };
};

let cachedProvider: RateLimitProvider | null = null;
let cacheKey: string | null = null;

export const createRateLimitProvider = async (
  config: RuntimeConfig,
): Promise<RateLimitProvider> => {
  const redisUrl = config.redisUrl;
  if (redisUrl && cacheKey !== redisUrl) {
    cacheKey = redisUrl;
    cachedProvider = null;
  }

  if (cachedProvider) {
    return cachedProvider;
  }

  const redisConfigured = redisUrl && redisUrl !== "redis://localhost:6379";

  if (redisConfigured) {
    try {
      const Redis = (await import("ioredis")).Redis;
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 3000,
      });

      cachedProvider = createRedisProvider(client);
      return cachedProvider;
    } catch {
      warnAboutMemoryFallback();
      cachedProvider = createInMemoryProvider();
      return cachedProvider;
    }
  }

  warnAboutMemoryFallback();
  cachedProvider = createInMemoryProvider();
  return cachedProvider;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

const createRedisProvider = (client: RedisClient): RateLimitProvider => {
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])

    local start = now - window
    redis.call('ZREMRANGEBYSCORE', key, 0, start)
    local count = redis.call('ZCARD', key)

    if count >= limit then
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retry = 0
      if #oldest >= 2 then
        retry = tonumber(oldest[2]) + window - now
      end
      return { 0, retry }
    end

    redis.call('ZADD', key, now, now .. ':' .. math.random())
    redis.call('EXPIRE', key, math.ceil(window / 1000))
    local remaining = limit - count - 1
    return { remaining + 1, 0 }
  `;

  return {
    name: "redis",
    isDistributed: true,

    async assertLimit(key: string, limit: number, windowMs: number): Promise<void> {
      const now = Date.now();
      const result = await client.eval(
        script,
        1,
        `ratelimit:${key}`,
        String(now),
        String(windowMs),
        String(limit),
      ) as [number, number];

      if (result[0] === 0) {
        throw new RateLimitExceeded(429, result[1] > 0 ? result[1] : undefined);
      }
    },

    async getLimit(key: string, limit: number, windowMs: number) {
      const now = Date.now();
      const start = now - windowMs;
      await client.zremrangebyscore(`ratelimit:${key}`, 0, start);
      const count = await client.zcard(`ratelimit:${key}`);
      const consumed = Math.min(count, limit);
      const remaining = Math.max(0, limit - consumed);
      const resetAt = consumed > 0 ? now + windowMs : now;
      return { consumed, remaining, resetAt };
    },
  };
};

export const resetRateLimitProvider = () => {
  cachedProvider = null;
  cacheKey = null;
};