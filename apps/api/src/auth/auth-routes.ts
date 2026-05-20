import type { FastifyInstance, FastifyReply } from "fastify";
import type { z } from "zod";
import { authLoginSchema } from "@base-orchestrator/shared";
import {
  assertNoRequestBody,
  handleValidationError,
  parseRequestBody
} from "../http/validation.js";
import { RateLimitExceeded } from "../http/rate-limit-provider.js";
import {
  clearSessionCookie,
  getSessionIdFromRequest,
  sessionCookie,
  type AuthContext,
} from "./auth-middleware.js";
import { verifyOperatorPassword } from "./password.js";

type LoginBody = z.input<typeof authLoginSchema>;

const loginRateLimits = {
  perIp: { limit: 5, windowMs: 5 * 60 * 1000 },
  perUsername: { limit: 5, windowMs: 10 * 60 * 1000 },
};

const handleRateLimitError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof RateLimitExceeded) {
    const headers: Record<string, string> = {};
    if (error.retryAfterMs !== undefined) {
      headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
    }
    Object.entries(headers).forEach(([k, v]) => reply.header(k, v));
    return reply.code(429).send({ error: "Too many requests, please try again later" });
  }
  throw error;
};

export const registerAuthRoutes = async (
  server: FastifyInstance,
  context: AuthContext,
) => {
  server.post<{ Body: LoginBody }>("/api/auth/login", async (request, reply) => {
    let input: z.output<typeof authLoginSchema>;
    try {
      input = parseRequestBody(authLoginSchema, request.body);
    } catch (error) {
      return handleValidationError(error, reply);
    }

    const { username } = input;
    const clientIp = request.ip;

    try {
      await context.rateLimitProvider.assertLimit(
        `login:ip:${clientIp}`,
        loginRateLimits.perIp.limit,
        loginRateLimits.perIp.windowMs,
      );
    } catch (error) {
      if (error instanceof RateLimitExceeded) {
        return handleRateLimitError(error, reply);
      }
      throw error;
    }

    try {
      await context.rateLimitProvider.assertLimit(
        `login:user:${username}`,
        loginRateLimits.perUsername.limit,
        loginRateLimits.perUsername.windowMs,
      );
    } catch (error) {
      if (error instanceof RateLimitExceeded) {
        return handleRateLimitError(error, reply);
      }
      throw error;
    }

    const { password } = input;
    if (!(await verifyOperatorPassword(context.config, username, password))) {
      await import("../ops/metrics.js").then(
        ({ recordLoginFailure }) => recordLoginFailure("invalid_credentials"),
      );
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const session = await context.sessions.create(username);
    reply.header("set-cookie", sessionCookie(context.config, session.id, 43200));
    return {
      authenticated: true,
      username,
    };
  });

  server.post("/api/auth/logout", async (request, reply) => {
    try {
      assertNoRequestBody(request.body);
    } catch (error) {
      return handleValidationError(error, reply);
    }
    await context.sessions.delete(getSessionIdFromRequest(request));
    reply.header("set-cookie", clearSessionCookie(context.config));
    return { authenticated: false };
  });

  server.get("/api/auth/me", async (request) => {
    const session = await context.sessions.get(getSessionIdFromRequest(request));
    return session
      ? { authenticated: true, username: session.username }
      : { authenticated: false, username: null };
  });

  server.get("/api/auth/csrf", async (request) => {
    const session = await context.sessions.get(getSessionIdFromRequest(request));
    return { csrfToken: session?.csrfToken };
  });
};