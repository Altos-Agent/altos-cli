import type { FastifyInstance, FastifyReply } from "fastify";
import type { z } from "zod";
import { vaultUnlockSchema } from "@base-orchestrator/shared";
import type { AuthContext } from "../auth/auth-middleware.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseRequestBody
} from "../http/validation.js";
import { RateLimitExceeded } from "../http/rate-limit-provider.js";
import {
  getVaultStatus,
  lockVault,
  unlockVault,
  VaultLockedError,
} from "./vault-lock.js";
import { requireRole } from "../auth/rbac.js";

type UnlockBody = z.input<typeof vaultUnlockSchema>;

const handleVaultError = (error: unknown) => {
  if (error instanceof VaultLockedError) {
    return {
      statusCode: 401,
      body: { error: error.message },
    };
  }
  throw error;
};

const handleRateLimitError = (error: unknown, reply: FastifyReply) => {
  if (error instanceof RateLimitExceeded) {
    const headers: Record<string, string> = {};
    if (error.retryAfterMs !== undefined) {
      headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
    }
    Object.entries(headers).forEach(([k, v]) => reply.header(k, v));
    return reply.code(429).send({ error: "Rate limit exceeded" });
  }
  throw error;
};

export const registerVaultRoutes = async (
  server: FastifyInstance,
  _context?: AuthContext,
) => {
  server.get("/api/vault/status", async () => getVaultStatus());

  server.post<{ Body: UnlockBody }>("/api/vault/unlock", async (request, reply) => {
    if (!_context) return reply.code(500).send({ error: "Server misconfiguration" });
    try {
      await requireRole(_context, request, reply, "admin");
      if (_context?.rateLimitProvider) {
        try {
          await _context.rateLimitProvider.assertLimit(
            `vault:unlock:${request.ip}`,
            5,
            60_000,
          );
        } catch (error) {
          if (error instanceof RateLimitExceeded) {
            return handleRateLimitError(error, reply);
          }
          throw error;
        }
      }
      const body = parseRequestBody(vaultUnlockSchema, request.body);
      return await unlockVault({
        ...(body.username !== undefined ? { username: body.username } : {}),
        ...(body.password !== undefined ? { password: body.password } : {}),
        ...(body.passphrase !== undefined ? { passphrase: body.passphrase } : {})
      });
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleVaultError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post("/api/vault/lock", async (request, reply) => {
    if (!_context) return reply.code(500).send({ error: "Server misconfiguration" });
    try {
      await requireRole(_context, request, reply, "admin");
      if (_context?.rateLimitProvider) {
        try {
          await _context.rateLimitProvider.assertLimit(
            `vault:lock:${request.ip}`,
            10,
            60_000,
          );
        } catch (error) {
          if (error instanceof RateLimitExceeded) {
            return handleRateLimitError(error, reply);
          }
          throw error;
        }
      }
      assertNoRequestBody(request.body);
      return lockVault();
    } catch (error) {
      return handleValidationError(error, reply);
    }
  });
};