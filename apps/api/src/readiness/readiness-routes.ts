import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { handleValidationError, parseRequestBody } from "../http/validation.js";
import type { AuthContext } from "../auth/auth-middleware.js";
import { requireRole } from "../auth/rbac.js";
import { runReadinessChecks, getReadinessSummary } from "./readiness-service.js";
import { storeArtifact } from "./readiness-artifacts.js";
import type { Artifact, ArtifactType } from "./readiness-types.js";
import { createWalletService, isWalletError } from "../wallets/wallet-service.js";
import { privateKeyToAccount } from "viem/accounts";
import { type Hex } from "viem";
import { getSessionIdFromRequest } from "../auth/auth-middleware.js";
import { randomBytes } from "node:crypto";

const artifactUploadSchema = z.object({
  type: z.enum([
    "0x_quote_validation",
    "backup_restore_drill",
    "emergency_pause_drill",
    "dry_run_load_test",
    "telegram_test",
    "tiny_live_operator_checklist",
  ]),
  passed: z.boolean(),
  evidence: z.string().url().nullable(),
  notes: z.string().nullable(),
});

const acknowledgeBlockerSchema = z.object({
  checkId: z.number().int().min(1).max(23),
  reason: z.string().min(10).max(500),
});

export const registerReadinessRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  authContext: AuthContext
) => {
  // GET /api/readiness - no auth required, operator dashboard can view
  server.get("/api/readiness", async (request, reply) => {
    const summary = await getReadinessSummary(db);
    return reply.code(200).send(summary);
  });

  // POST /api/readiness/run-checks - admin only
  server.post("/api/readiness/run-checks", async (request, reply) => {
    const allowed = await requireRole(authContext, request, reply, "admin");
    if (!allowed) return;
    const result = await runReadinessChecks(db);
    return reply.code(200).send(result);
  });

  // POST /api/readiness/artifacts - admin only
  server.post(
    "/api/readiness/artifacts",
    async (request, reply) => {
      const allowed = await requireRole(authContext, request, reply, "admin");
      if (!allowed) return;

      try {
        const data = parseRequestBody(artifactUploadSchema, request.body);

        const sessionId = getSessionIdFromRequest(request);
        const session = await authContext.sessions.get(sessionId);
        const createdBy = session?.username ?? "unknown";

        const artifact: Artifact = {
          type: data.type as ArtifactType,
          passed: data.passed,
          evidence: data.evidence,
          notes: data.notes,
          createdAt: new Date().toISOString(),
          createdBy,
        };

        const artifactId = await storeArtifact(artifact);
        return reply.code(201).send({
          artifactId,
          storedAt: artifact.createdAt,
        });
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  // POST /api/readiness/tiny-wallet - admin only
  server.post("/api/readiness/tiny-wallet", async (request, reply) => {
    const allowed = await requireRole(authContext, request, reply, "admin");
    if (!allowed) return;

    try {
      // Generate fresh keypair
      const randomPrivateKey = randomBytes(32);
      const hexKey = `0x${randomPrivateKey.toString("hex")}`;
      const account = privateKeyToAccount(hexKey as Hex);
      const address = account.address;

      // Import wallet - importWallet handles encryption internally
      const walletService = createWalletService(db);
      const importedWallet = await walletService.importWallet({
        name: "TINY_LIVE_WALLET",
        address,
        privateKey: randomPrivateKey.toString("hex"),
        status: "PAUSED",
      });

      return reply.code(201).send({
        walletId: importedWallet.id,
        address: importedWallet.address,
        publicLabel: importedWallet.name,
        instructions:
          "Fund this wallet with ~0.001 BASE only. Then upload a Telegram test artifact and verify all other gates before enabling.",
      });
    } catch (error) {
      if (isWalletError(error)) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  // POST /api/readiness/dismiss-blocker - admin only
  server.post(
    "/api/readiness/dismiss-blocker",
    async (request, reply) => {
      const allowed = await requireRole(authContext, request, reply, "admin");
      if (!allowed) return;

      try {
        const data = parseRequestBody(acknowledgeBlockerSchema, request.body);

        const sessionId = getSessionIdFromRequest(request);
        const session = await authContext.sessions.get(sessionId);
        const acknowledgedBy = session?.username ?? "unknown";

        return reply.code(200).send({
          acknowledged: true,
          checkId: data.checkId,
          reason: data.reason,
          acknowledgedBy,
          note: "session-only",
        });
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );
};