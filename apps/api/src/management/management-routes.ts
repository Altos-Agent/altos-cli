import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createWalletGroupSchema,
  updateWalletGroupSchema,
  createStrategyProfileSchema,
  updateStrategyProfileSchema,
  pairCreateSchema,
  pairUpdateSchema,
  routerUpdateSchema,
  tokenCreateSchema,
  tokenUpdateSchema,
  walletPairRulesSchema
} from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseIdParams,
  parseRequestBody
} from "../http/validation.js";
import {
  createManagementService,
  isManagementError
} from "./management-service.js";
import { transactions, scheduleOccurrences } from "../db/schema.js";
import { getOccurrenceById } from "../scheduler/occurrence.service.js";
import { requireRole } from "../auth/rbac.js";
import type { AuthContext } from "../auth/auth-middleware.js";

interface IdParams {
  id: string;
}

const handleError = (error: unknown) => {
  if (isManagementError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerManagementRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext
) => {
  const service = createManagementService(db);

  server.get("/api/tokens", async () => await service.listTokens());
  server.post<{ Body: Parameters<typeof service.createToken>[0] }>(
    "/api/tokens",
    async (request, reply) => {
      try {
        const body = parseRequestBody(tokenCreateSchema, request.body);
        return reply.code(201).send(await service.createToken(body));
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updateToken>[1] }>(
    "/api/tokens/:id",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `tokens:update:${request.ip}`,
            20,
            60_000,
          );
        }
        const params = parseIdParams(request.params);
        const body = parseRequestBody(tokenUpdateSchema, request.body);
        return await service.updateToken(
          params.id,
          body as Parameters<typeof service.updateToken>[1]
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/tokens/:id/enable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setTokenEnabled(params.id, true);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/tokens/:id/disable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setTokenEnabled(params.id, false);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get("/api/pairs", async () => await service.listPairs());
  server.post<{ Body: Parameters<typeof service.createPair>[0] }>(
    "/api/pairs",
    async (request, reply) => {
      try {
        const body = parseRequestBody(pairCreateSchema, request.body);
        return reply.code(201).send(await service.createPair(body));
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updatePair>[1] }>(
    "/api/pairs/:id",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `pairs:update:${request.ip}`,
            20,
            60_000,
          );
        }
        const params = parseIdParams(request.params);
        const body = parseRequestBody(pairUpdateSchema, request.body);
        return await service.updatePair(
          params.id,
          body as Parameters<typeof service.updatePair>[1]
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/pairs/:id/enable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setPairEnabled(params.id, true);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/pairs/:id/disable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setPairEnabled(params.id, false);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get("/api/routers", async () => await service.listRouters());
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updateRouter>[1] }>(
    "/api/routers/:id",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `routers:update:${request.ip}`,
            20,
            60_000,
          );
        }
        const params = parseIdParams(request.params);
        const body = parseRequestBody(routerUpdateSchema, request.body);
        return await service.updateRouter(
          params.id,
          body as Parameters<typeof service.updateRouter>[1]
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/routers/:id/enable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setRouterEnabled(params.id, true);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/routers/:id/disable", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.setRouterEnabled(params.id, false);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/pair-rules",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        return await service.listWalletPairRules(params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.put<{
    Params: IdParams;
    Body: Parameters<typeof service.putWalletPairRules>[1];
  }>("/api/wallets/:id/pair-rules", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      const body = parseRequestBody(walletPairRulesSchema, request.body);
      return await service.putWalletPairRules(params.id, body);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  // ── Wallet Groups ────────────────────────────────────────────────────────────

  server.get("/api/wallet-groups", async () => await service.listWalletGroups());
  server.post<{ Body: Parameters<typeof service.createWalletGroup>[0] }>(
    "/api/wallet-groups",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        const body = parseRequestBody(createWalletGroupSchema, request.body);
        return reply.code(201).send(await service.createWalletGroup(body as Parameters<typeof service.createWalletGroup>[0]));
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{
    Params: IdParams;
    Body: Parameters<typeof service.updateWalletGroup>[1];
  }>("/api/wallet-groups/:id", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "operator");
      const params = parseIdParams(request.params);
      const body = parseRequestBody(updateWalletGroupSchema, request.body);
      return await service.updateWalletGroup(
        params.id,
        body as Parameters<typeof service.updateWalletGroup>[1]
      );
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.delete<{ Params: IdParams }>("/api/wallet-groups/:id", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "operator");
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.deleteWalletGroup(params.id);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  // ── Strategy Profiles ───────────────────────────────────────────────────────

  server.get("/api/strategy-profiles", async () => await service.listStrategyProfiles());
  server.post<{ Body: Parameters<typeof service.createStrategyProfile>[0] }>(
    "/api/strategy-profiles",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        const body = parseRequestBody(createStrategyProfileSchema, request.body);
        return reply.code(201).send(await service.createStrategyProfile(body as Parameters<typeof service.createStrategyProfile>[0]));
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{
    Params: IdParams;
    Body: Parameters<typeof service.updateStrategyProfile>[1];
  }>("/api/strategy-profiles/:id", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "operator");
      const params = parseIdParams(request.params);
      const body = parseRequestBody(updateStrategyProfileSchema, request.body);
      return await service.updateStrategyProfile(
        params.id,
        body as Parameters<typeof service.updateStrategyProfile>[1]
      );
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.delete<{ Params: IdParams }>("/api/strategy-profiles/:id", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "operator");
      const params = parseIdParams(request.params);
      assertNoRequestBody(request.body);
      return await service.deleteStrategyProfile(params.id);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  // Transaction detail with occurrence link
  server.get<{ Params: IdParams }>(
    "/api/transactions/:id",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        const [tx] = await db
          .select()
          .from(transactions)
          .where(eq(transactions.id, params.id))
          .limit(1);

        if (!tx) {
          return reply.code(404).send({ error: "Transaction not found" });
        }

        // Look up occurrence by transactionId
        let occurrence = null;
        if (tx.occurrenceId) {
          occurrence = await getOccurrenceById(db, tx.occurrenceId);
        } else {
          const [occ] = await db
            .select()
            .from(scheduleOccurrences)
            .where(eq(scheduleOccurrences.transactionId, params.id))
            .limit(1);
          occurrence = occ ?? null;
        }

        return { transaction: tx, occurrence };
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        throw error;
      }
    }
  );
};
