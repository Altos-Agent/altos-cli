import type { FastifyInstance } from "fastify";
import {
  bulkApplyProfileSchema,
  bulkWalletStatusSchema,
  emptyWalletMutationBodySchema,
  importEncryptedWalletBackupSchema,
  importWalletSchema,
  updateWalletSchema,
  walletIdsSchema
} from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseIdParams,
  parseRequestBody
} from "../http/validation.js";
import {
  assertVaultUnlocked,
  requiresVaultForLiveSigning,
  VaultLockedError
} from "../vault/vault-lock.js";
import { createWalletService, isWalletError } from "./wallet-service.js";
import type { ImportWalletInput, UpdateWalletInput } from "./types.js";

interface IdParams {
  id: string;
}

const handleWalletError = (error: unknown) => {
  if (error instanceof VaultLockedError) {
    return {
      statusCode: 423,
      body: { error: error.message }
    };
  }

  if (isWalletError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerWalletRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  const walletService = createWalletService(db);

  const assertVaultForSensitiveBackup = () => {
    if (requiresVaultForLiveSigning()) {
      assertVaultUnlocked();
    }
  };

  server.get("/api/wallets", async () => walletService.listWallets());

  server.get<{ Params: IdParams }>("/api/wallets/:id", async (request, reply) => {
    try {
      const params = parseIdParams(request.params);
      return await walletService.getWallet(params.id);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post<{ Body: ImportWalletInput }>(
    "/api/wallets/import",
    async (request, reply) => {
      try {
        const body = parseRequestBody(importWalletSchema, request.body);
        const wallet = await walletService.importWallet(body);
        return reply.code(201).send(wallet);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{
    Body: {
      backup: unknown;
      rotateKeys?: boolean;
      allowDisabledMismatchImport?: boolean;
    };
  }>("/api/wallets/bulk/import-encrypted", async (request, reply) => {
    try {
      const body = parseRequestBody(
        importEncryptedWalletBackupSchema,
        request.body
      );
      if (body.rotateKeys) {
        assertVaultForSensitiveBackup();
      }
      const result = await walletService.importEncryptedWalletBackup(
        {
          backup: body.backup,
          ...(body.rotateKeys !== undefined ? { rotateKeys: body.rotateKeys } : {}),
          ...(body.allowDisabledMismatchImport !== undefined
            ? {
                allowDisabledMismatchImport:
                  body.allowDisabledMismatchImport
              }
            : {})
        }
      );
      return reply.code(201).send(result);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post<{ Body: { walletIds?: string[] } }>(
    "/api/wallets/bulk/export-encrypted",
    async (request, reply) => {
      try {
        assertVaultForSensitiveBackup();
        const body = parseRequestBody(walletIdsSchema, request.body);
        return await walletService.exportEncryptedWalletBackup(body);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.patch<{
    Body: {
      walletIds: string[];
      profileId:
        | "conservative"
        | "stable-only"
        | "low-fee"
        | "token-rotation-limited"
        | "manual-only";
    };
  }>("/api/wallets/bulk/apply-profile", async (request, reply) => {
    try {
      const body = parseRequestBody(bulkApplyProfileSchema, request.body);
      return await walletService.applyProfileToWallets(body);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.patch<{
    Body: { walletIds: string[]; status: "ACTIVE" | "PAUSED" | "DISABLED" };
  }>("/api/wallets/bulk/status", async (request, reply) => {
    try {
      const body = parseRequestBody(bulkWalletStatusSchema, request.body);
      return await walletService.setBulkWalletStatus(
        body.walletIds,
        body.status
      );
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.patch<{ Params: IdParams; Body: UpdateWalletInput }>(
    "/api/wallets/:id",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        const body = parseRequestBody(updateWalletSchema, request.body);
        return await walletService.updateWallet(params.id, body);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/pause",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        parseRequestBody(emptyWalletMutationBodySchema, request.body);
        return await walletService.setWalletStatus(
          params.id,
          "PAUSED",
          "wallet.pause"
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/resume",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        parseRequestBody(emptyWalletMutationBodySchema, request.body);
        return await walletService.setWalletStatus(
          params.id,
          "ACTIVE",
          "wallet.resume"
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/disable",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        parseRequestBody(emptyWalletMutationBodySchema, request.body);
        return await walletService.setWalletStatus(
          params.id,
          "DISABLED",
          "wallet.disable"
        );
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/rotate-key",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        assertNoRequestBody(request.body);
        assertVaultForSensitiveBackup();
        return await walletService.rotateWalletKey(params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.delete<{ Params: IdParams }>(
    "/api/wallets/:id",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        assertNoRequestBody(request.body);
        return await walletService.deleteWallet(params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
