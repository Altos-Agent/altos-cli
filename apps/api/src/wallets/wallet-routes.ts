import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { createWalletService, isWalletError } from "./wallet-service.js";
import type { ImportWalletInput, UpdateWalletInput } from "./types.js";

interface IdParams {
  id: string;
}

const handleWalletError = (error: unknown) => {
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

  server.get("/api/wallets", async () => walletService.listWallets());

  server.get<{ Params: IdParams }>("/api/wallets/:id", async (request, reply) => {
    try {
      return await walletService.getWallet(request.params.id);
    } catch (error) {
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post<{ Body: ImportWalletInput }>(
    "/api/wallets/import",
    async (request, reply) => {
      try {
        const wallet = await walletService.importWallet(request.body);
        return reply.code(201).send(wallet);
      } catch (error) {
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
      const result = await walletService.importEncryptedWalletBackup(
        request.body
      );
      return reply.code(201).send(result);
    } catch (error) {
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post<{ Body: { walletIds?: string[] } }>(
    "/api/wallets/bulk/export-encrypted",
    async (request, reply) => {
      try {
        return await walletService.exportEncryptedWalletBackup(request.body);
      } catch (error) {
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
      return await walletService.applyProfileToWallets(request.body);
    } catch (error) {
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.patch<{
    Body: { walletIds: string[]; status: "ACTIVE" | "PAUSED" | "DISABLED" };
  }>("/api/wallets/bulk/status", async (request, reply) => {
    try {
      return await walletService.setBulkWalletStatus(
        request.body.walletIds,
        request.body.status
      );
    } catch (error) {
      const handled = handleWalletError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.patch<{ Params: IdParams; Body: UpdateWalletInput }>(
    "/api/wallets/:id",
    async (request, reply) => {
      try {
        return await walletService.updateWallet(request.params.id, request.body);
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/pause",
    async (request, reply) => {
      try {
        return await walletService.setWalletStatus(
          request.params.id,
          "PAUSED",
          "wallet.pause"
        );
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/resume",
    async (request, reply) => {
      try {
        return await walletService.setWalletStatus(
          request.params.id,
          "ACTIVE",
          "wallet.resume"
        );
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/disable",
    async (request, reply) => {
      try {
        return await walletService.setWalletStatus(
          request.params.id,
          "DISABLED",
          "wallet.disable"
        );
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/wallets/:id/rotate-key",
    async (request, reply) => {
      try {
        return await walletService.rotateWalletKey(request.params.id);
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.delete<{ Params: IdParams }>(
    "/api/wallets/:id",
    async (request, reply) => {
      try {
        return await walletService.deleteWallet(request.params.id);
      } catch (error) {
        const handled = handleWalletError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
