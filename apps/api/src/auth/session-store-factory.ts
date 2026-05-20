import { randomBytes } from "node:crypto";
import type { RuntimeConfig } from "../config/env.js";

export interface OperatorSession {
  id: string;
  username: string;
  csrfToken: string;
  expiresAt: number;
  createdAt: number;
}

export interface SessionStore {
  readonly name: "redis" | "memory";
  readonly isDistributed: boolean;
  create(username: string): Promise<OperatorSession>;
  get(sessionId: string | undefined): Promise<OperatorSession | null>;
  touch(sessionId: string | undefined): Promise<void>;
  delete(sessionId: string | undefined): Promise<void>;
  deleteAllSessionsForUser(username: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
}

const sessionTtlMsDefault = 12 * 60 * 60 * 1000;

const randomToken = () => randomBytes(32).toString("base64url");

export const createInMemorySessionStore = (): SessionStore => {
  const sessions = new Map<string, OperatorSession>();

  return {
    name: "memory",
    isDistributed: false,

    async create(username: string) {
      const session: OperatorSession = {
        id: randomToken(),
        username,
        csrfToken: randomToken(),
        createdAt: Date.now(),
        expiresAt: Date.now() + sessionTtlMsDefault,
      };
      sessions.set(session.id, session);
      return session;
    },

    async get(sessionId: string | undefined) {
      if (!sessionId) {
        return null;
      }
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      if (session.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return null;
      }
      return session;
    },

    async touch(sessionId: string | undefined) {
      if (!sessionId) return;
      const session = sessions.get(sessionId);
      if (session && session.expiresAt > Date.now()) {
        session.expiresAt = Date.now() + sessionTtlMsDefault;
        sessions.set(sessionId, session);
      }
    },

    async delete(sessionId: string | undefined) {
      if (sessionId) {
        sessions.delete(sessionId);
      }
    },

    async deleteAllSessionsForUser(username: string) {
      for (const [id, session] of sessions.entries()) {
        if (session.username === username) {
          sessions.delete(id);
        }
      }
    },

    async cleanupExpiredSessions() {
      const now = Date.now();
      for (const [id, session] of sessions.entries()) {
        if (session.expiresAt <= now) {
          sessions.delete(id);
        }
      }
    },
  };
};

let cachedRedisStore: SessionStore | null = null;
let cacheKey: string | null = null;

export const createRedisSessionStore = async (
  config: RuntimeConfig,
): Promise<SessionStore> => {
  const redisUrl = config.redisUrl;
  const ttlMs = sessionTtlMsDefault;

  if (redisUrl && cacheKey !== redisUrl) {
    cacheKey = redisUrl;
    cachedRedisStore = null;
  }

  if (cachedRedisStore) {
    return cachedRedisStore;
  }

  const Redis = (await import("ioredis")).Redis;
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 3000,
  });

  const store: SessionStore = {
    name: "redis",
    isDistributed: true,

    async create(username: string) {
      const id = randomToken();
      const csrfToken = randomToken();
      const now = Date.now();
      const session: OperatorSession = {
        id,
        username,
        csrfToken,
        createdAt: now,
        expiresAt: now + ttlMs,
      };
      const key = `session:${id}`;
      await client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(session));
      return session;
    },

    async get(sessionId: string | undefined) {
      if (!sessionId) return null;
      const key = `session:${sessionId}`;
      const data = await client.get(key);
      if (!data) return null;
      const session: OperatorSession = JSON.parse(data);
      if (session.expiresAt <= Date.now()) {
        await client.del(key);
        return null;
      }
      return session;
    },

    async touch(sessionId: string | undefined) {
      if (!sessionId) return;
      const key = `session:${sessionId}`;
      const data = await client.get(key);
      if (!data) return;
      const session: OperatorSession = JSON.parse(data);
      if (session.expiresAt <= Date.now()) {
        await client.del(key);
        return;
      }
      session.expiresAt = Date.now() + ttlMs;
      await client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(session));
    },

    async delete(sessionId: string | undefined) {
      if (!sessionId) return;
      await client.del(`session:${sessionId}`);
    },

    async deleteAllSessionsForUser(username: string) {
      const pattern = "session:*";
      let cursor = "0";
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length === 0) continue;
        const pipeline = client.pipeline();
        for (const key of keys) {
          pipeline.get(key);
        }
        const results = await pipeline.exec();
        if (!results) continue;
        const delKeys: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (!result) continue;
          const [, data] = result;
          if (!data) continue;
          try {
            const session: OperatorSession = JSON.parse(data as string);
            if (session.username === username) {
              const key = keys[i];
              if (key) delKeys.push(key);
            }
          } catch {
            // skip invalid JSON
          }
        }
        if (delKeys.length > 0) {
          const delPipeline = client.pipeline();
          for (const k of delKeys) {
            delPipeline.del(k);
          }
          await delPipeline.exec();
        }
      } while (cursor !== "0");
    },

    async cleanupExpiredSessions() {
      // Redis TTL handles expiration; nothing to do here
    },
  };

  cachedRedisStore = store;
  return store;
};

const warnAboutMemorySessionFallback = () => {
  console.warn(
    "[session-store] Using in-memory session store. " +
      "Sessions are stored in-process memory and will be lost on restart. " +
      "This is appropriate only for local development or demo environments. " +
      "Production deployments must configure a non-localhost Redis URL for session persistence.",
  );
};

export type SessionStoreMode = "redis" | "memory" | "auto";

export const createSessionStore = async (
  config: RuntimeConfig,
): Promise<SessionStore> => {
  // Production always requires Redis; memory fallback only in dev/test
  if (config.nodeEnv === "production") {
    if (config.redisUrl && config.redisUrl !== "redis://localhost:6379") {
      try {
        return await createRedisSessionStore(config);
      } catch {
        // fall through to error below
      }
      throw new Error(
        "Production mode requires a reachable Redis URL for session storage. " +
          "Configure REDIS_URL and ensure it is not localhost:6379 in production.",
      );
    }
    throw new Error(
      "SESSION_STORE: production requires REDIS_URL to be set and not localhost. " +
        "Sessions stored in process memory will be lost on restart which is not acceptable in production.",
    );
  }

  // Development / test: auto-detect
  if (config.redisUrl && config.redisUrl !== "redis://localhost:6379") {
    try {
      return await createRedisSessionStore(config);
    } catch {
      warnAboutMemorySessionFallback();
      return createInMemorySessionStore();
    }
  }

  warnAboutMemorySessionFallback();
  return createInMemorySessionStore();
};

export const resetSessionStore = () => {
  cachedRedisStore = null;
  cacheKey = null;
};