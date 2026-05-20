import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "../config/env.js";
import type { RateLimitProvider } from "../http/rate-limit-provider.js";
import type { SessionStore } from "./session-store-factory.js";
import { validateCsrfToken } from "./csrf.js";

export const sessionCookieName = "base_orchestrator_session";

export interface AuthContext {
  config: RuntimeConfig;
  sessions: SessionStore;
  rateLimitProvider: RateLimitProvider;
}

export const createAuthContext = (
  config: RuntimeConfig,
  sessions: SessionStore,
  rateLimitProvider: RateLimitProvider,
): AuthContext => ({
  config,
  sessions,
  rateLimitProvider,
});

const parseCookies = (cookieHeader: string | undefined) =>
  Object.fromEntries(
    (cookieHeader ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }),
  );

export const getSessionIdFromRequest = (request: FastifyRequest) =>
  parseCookies(request.headers.cookie)[sessionCookieName];

const isUnsafeMethod = (method: string) =>
  ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());

const isPublicRoute = (request: FastifyRequest) => {
  if (request.method === "OPTIONS") {
    return true;
  }
  if (request.url === "/health") {
    return true;
  }
  if (request.method === "POST" && request.url === "/api/auth/login") {
    return true;
  }
  if (request.method === "GET" && request.url === "/api/auth/me") {
    return true;
  }
  return false;
};

const setCorsHeaders = (
  request: FastifyRequest,
  reply: FastifyReply,
  config: RuntimeConfig,
) => {
  const origin = request.headers.origin;
  const allowedOrigins = new Set([
    `http://127.0.0.1:${config.webPort}`,
    `http://localhost:${config.webPort}`,
  ]);
  if (origin && allowedOrigins.has(origin)) {
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "Origin");
    reply.header("access-control-allow-credentials", "true");
    reply.header(
      "access-control-allow-headers",
      "content-type, x-csrf-token",
    );
    reply.header(
      "access-control-allow-methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
  }
};

export const sessionCookie = (
  config: RuntimeConfig,
  sessionId: string,
  maxAgeSeconds: number,
) => {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.nodeEnv === "production") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

export const clearSessionCookie = (config: RuntimeConfig) =>
  sessionCookie(config, "", 0);

export const installAuthMiddleware = (
  server: FastifyInstance,
  context: AuthContext,
) => {
  server.addHook("onRequest", async (request, reply) => {
    setCorsHeaders(request, reply, context.config);

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }

    if (!request.url.startsWith("/api") && request.url !== "/health") {
      return;
    }

    if (isPublicRoute(request)) {
      return;
    }

    const session = await context.sessions.get(
      getSessionIdFromRequest(request),
    );
    if (!session) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    if (isUnsafeMethod(request.method) && !validateCsrfToken(request, session)) {
      return reply.code(403).send({ error: "Valid CSRF token required" });
    }
  });
};

export const getAuthenticatedSession = async (
  request: FastifyRequest,
  context: AuthContext,
) => context.sessions.get(getSessionIdFromRequest(request));