import type { FastifyInstance } from "fastify";
import { approvalRequestSchema } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import {
  handleValidationError,
  parseIdParams,
  parseRequestBody
} from "../http/validation.js";
import { assertGlobalEmergencyNotPaused, isEmergencyPauseError } from "../security/emergency-pause.js";
import {
  requiresVaultForLiveSigning,
  assertVaultUnlocked,
  VaultLockedError,
} from "../vault/vault-lock.js";
import {
  createApprovalService,
  isApprovalError,
  type ApprovalRequestInput
} from "./approval-service.js";
import {
  hashObject,
  isTransactionManagerError,
  requireIdempotencyKey,
  transactionToRouteResult,
  TransactionManager
} from "../transactions/transaction-manager.js";
import { requireRole, requireReauth, requireConfirmation } from "../auth/rbac.js";
import type { AuthContext } from "../auth/auth-middleware.js";

interface IdParams {
  id: string;
}

const handleApprovalError = (error: unknown) => {
  if (error instanceof VaultLockedError) {
    return {
      statusCode: 423,
      body: { error: error.message }
    };
  }
  if (isEmergencyPauseError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }
  if (isApprovalError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }
  if (isTransactionManagerError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerApprovalRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext
) => {
  const approvalService = createApprovalService(db);
  const transactionManager = new TransactionManager(db);

  // TODO Phase 7: add explicit route-level rate limits for approve/revoke.
  const assertLiveWriteAllowed = async () => {
    await assertGlobalEmergencyNotPaused(db);
    if (requiresVaultForLiveSigning()) {
      assertVaultUnlocked();
    }
  };

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/allowances",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        return await approvalService.listWalletAllowances(params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams; Body: ApprovalRequestInput }>(
    "/api/wallets/:id/approve",
    async (request, reply) => {
      const params = parseIdParams(request.params);
      try {
        const roleOk = await requireRole(_context, request, reply, "admin");
        if (!roleOk) return;
        const reauthOk = await requireReauth(_context, request, reply);
        if (!reauthOk) return;
        const confirmOk = requireConfirmation(request, reply, "APPROVE LIVE");
        if (!confirmOk) return;
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `approve:${params.id}:${request.ip}`,
            20,
            60_000,
          );
        }
        await assertLiveWriteAllowed();
        const body = parseRequestBody(approvalRequestSchema, request.body);
        await transactionManager.assertNoPendingLiveTransaction(params.id);
        const idempotencyKey = requireIdempotencyKey(request);
        const requestState = await transactionManager.createOrReplayRequest({
          idempotencyKey,
          walletId: params.id,
          action: "APPROVE",
          requestHash: hashObject({
            route: "approve",
            walletId: params.id,
            body
          }),
          routerId: body.routerId,
          sellToken: body.tokenId,
          sellAmountRaw: body.amount ?? null
        });
        if (requestState.replay && requestState.transaction) {
          return reply.code(200).send(transactionToRouteResult(requestState.transaction));
        }
        if (requestState.replay) {
          return reply.code(202).send({
            accepted: false,
            rejected: false,
            reasons: ["Transaction request is still pending"],
            transactionId: null,
            requestId: requestState.request.id
          });
        }
        await transactionManager.acquireWalletLock({
          walletId: params.id,
          requestId: requestState.request.id
        });
        const result = await approvalService.approve(
          params.id,
          { ...body, transactionRequestId: requestState.request.id }
        );
        await transactionManager.updateRequestStatus(
          requestState.request.id,
          result.status
        );
        if (result.status !== "SUBMITTED") {
          await transactionManager.releaseWalletLock({
            walletId: params.id,
            requestId: requestState.request.id
          });
        }
        return reply.code(result.accepted ? 201 : 200).send(result);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams; Body: ApprovalRequestInput }>(
    "/api/wallets/:id/revoke",
    async (request, reply) => {
      const params = parseIdParams(request.params);
      try {
        const roleOk = await requireRole(_context, request, reply, "admin");
        if (!roleOk) return;
        const reauthOk = await requireReauth(_context, request, reply);
        if (!reauthOk) return;
        const confirmOk = requireConfirmation(request, reply, "REVOKE APPROVAL");
        if (!confirmOk) return;
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `revoke:${params.id}:${request.ip}`,
            20,
            60_000,
          );
        }
        await assertLiveWriteAllowed();
        const body = parseRequestBody(
          approvalRequestSchema.omit({ amount: true }),
          request.body
        );
        await transactionManager.assertNoPendingLiveTransaction(params.id);
        const idempotencyKey = requireIdempotencyKey(request);
        const requestState = await transactionManager.createOrReplayRequest({
          idempotencyKey,
          walletId: params.id,
          action: "REVOKE",
          requestHash: hashObject({
            route: "revoke",
            walletId: params.id,
            body
          }),
          routerId: body.routerId,
          sellToken: body.tokenId,
          sellAmountRaw: "0"
        });
        if (requestState.replay && requestState.transaction) {
          return reply.code(200).send(transactionToRouteResult(requestState.transaction));
        }
        if (requestState.replay) {
          return reply.code(202).send({
            accepted: false,
            rejected: false,
            reasons: ["Transaction request is still pending"],
            transactionId: null,
            requestId: requestState.request.id
          });
        }
        await transactionManager.acquireWalletLock({
          walletId: params.id,
          requestId: requestState.request.id
        });
        const result = await approvalService.revoke(
          params.id,
          { ...body, transactionRequestId: requestState.request.id }
        );
        await transactionManager.updateRequestStatus(
          requestState.request.id,
          result.status
        );
        if (result.status !== "SUBMITTED") {
          await transactionManager.releaseWalletLock({
            walletId: params.id,
            requestId: requestState.request.id
          });
        }
        return reply.code(result.accepted ? 201 : 200).send(result);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
