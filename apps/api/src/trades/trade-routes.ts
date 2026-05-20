import type { FastifyInstance } from "fastify";
import {
  createWalletClient,
  formatUnits,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { executeOnceSchema } from "@base-orchestrator/shared";
import { getRuntimeConfig } from "../config/runtime-config.js";
import {
  createApprovalService,
  getTokenAllowance,
} from "../approvals/approval-service.js";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";
import { baseMainnet, basePublicClient } from "../blockchain/baseClient.js";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import {
  handleValidationError,
  parseRequestBody,
} from "../http/validation.js";
import { RateLimitExceeded } from "../http/rate-limit-provider.js";
import { createTelegramService } from "../notifications/telegram.js";
import { getQuote } from "../quote/quoteEngine.js";
import { estimateTradeUsd, evaluateTradeRisk } from "../strategy/planner.js";
import {
  AGGREGATE_RISK_CODES,
  checkAggregateRisk,
  createAggregateRiskSnapshot,
} from "../risk/aggregate-risk.js";
import {
  amountToStorageUnits,
  loadTradeContext,
} from "../strategy/trade-context.js";
import {
  assertPrivateKeyMatchesAddress,
  decryptPrivateKey,
  loadOrCreateMasterKey,
} from "../vault/wallet-vault.js";
import {
  demoModeLiveRejectionReasons,
  isDemoMode,
  isDryRunEnabled,
  requireLiveConfirmation,
} from "../runtime/mode.js";
import {
  assertGlobalEmergencyNotPaused,
  isEmergencyPauseError,
} from "../security/emergency-pause.js";
import {
  assertVaultUnlocked,
  requiresVaultForLiveSigning,
  VaultLockedError,
} from "../vault/vault-lock.js";
import { evaluateLiveExecutionSafety } from "./live-execution.js";
import { getCurrentTraceId } from "../http/request-context.js";
import {
  hashObject,
  hashString,
  isTransactionManagerError,
  requireIdempotencyKey,
  transactionToRouteResult,
  TransactionManager
} from "../transactions/transaction-manager.js";
import { NonceReservationService, NonceReservationError } from "../nonce/nonce-reservation.js";
import { requireRole, requireReauth, requireConfirmation } from "../auth/rbac.js";
import type { AuthContext } from "../auth/auth-middleware.js";

interface ExecuteOnceInput {
  walletId: string;
  pairId: string;
  sellAmountDisplay: string;
  preferredRouter?: string | null | undefined;
  confirmLiveExecution?: boolean | undefined;
  autoApprove?: boolean | undefined;
  transactionRequestId?: string | undefined;
}

const autoApproveEnabled = () => getRuntimeConfig().autoApprove;

const statusCodeForRejected = 200;

const storeTransaction = async ({
  db,
  input,
  sellAmountRaw,
  sellAmountUsd,
  status,
  router,
  tokenIn,
  tokenOut,
  buyAmountRaw,
  buyAmountUsd,
  gasUsed,
  gasUsd,
  feeNative,
  txHash,
  basescanUrl,
  errorMessage,
  requestId,
  fromAddress,
  toAddress,
  calldataHash,
  nonce,
  quoteHash,
  simulationHash,
  usdPriceSource,
  usdPriceTimestamp,
  quoteUsdSource,
  riskCheckedAt,
  aggregateRiskSnapshotJson,
  traceId,
}: {
  db: DbClient;
  input: ExecuteOnceInput;
  sellAmountRaw?: string | null;
  sellAmountUsd?: string | null;
  status: "SUBMITTED" | "FAILED" | "REJECTED";
  router: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
  buyAmountRaw: string | null;
  buyAmountUsd?: string | null;
  gasUsed: string | null;
  gasUsd: string | null;
  feeNative: string | null;
  txHash: string | null;
  basescanUrl: string | null;
  errorMessage: string | null;
  requestId?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  calldataHash?: string | null;
  nonce?: number | null;
  quoteHash?: string | null;
  simulationHash?: string | null;
  usdPriceSource?: string | null;
  usdPriceTimestamp?: Date | null;
  quoteUsdSource?: string | null;
  riskCheckedAt?: Date | null;
  aggregateRiskSnapshotJson?: Record<string, unknown> | null;
  traceId?: string | null;
}) => {
  const [transaction] = await db
    .insert(transactions)
    .values({
      walletId: input.walletId,
      requestId: requestId ?? input.transactionRequestId ?? null,
      pairId: input.pairId,
      chainId: BASE_CHAIN_ID,
      txHash,
      status,
      action: "SWAP",
      router,
      tokenIn,
      tokenOut,
      amountIn: sellAmountRaw ?? null,
      amountInRaw: sellAmountRaw ?? null,
      amountInUsd: sellAmountUsd ?? null,
      amountOut: buyAmountRaw,
      amountOutRaw: buyAmountRaw,
      amountOutUsd: buyAmountUsd ?? null,
      gasUsed,
      gasUsd,
      feeNative,
      usdPriceSource: usdPriceSource ?? null,
      usdPriceTimestamp: usdPriceTimestamp ?? null,
      quoteUsdSource: quoteUsdSource ?? null,
      riskCheckedAt: riskCheckedAt ?? null,
      aggregateRiskSnapshotJson: aggregateRiskSnapshotJson ?? null,
      errorMessage,
      basescanUrl,
      fromAddress: fromAddress ?? null,
      toAddress: toAddress ?? null,
      calldataHash: calldataHash ?? null,
      nonce: nonce ?? null,
      quoteHash: quoteHash ?? null,
      simulationHash: simulationHash ?? null,
      traceId: traceId ?? getCurrentTraceId(),
    })
    .returning();

  return transaction;
};

export const registerTradeRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext,
) => {
  const transactionManager = new TransactionManager(db);
  const nonceReservation = new NonceReservationService(db);

  server.get("/api/trades/live-status", async () => {
    const dryRun = isDryRunEnabled();
    const confirmationRequired = requireLiveConfirmation();

    return {
      dryRun,
      demoMode: isDemoMode(),
      requireLiveConfirmation: confirmationRequired,
      liveExecutionEnabled: !dryRun && !isDemoMode(),
    };
  });

  server.post<{ Body: ExecuteOnceInput }>(
    "/api/trades/execute-once",
    async (request, reply) => {
      let input: ExecuteOnceInput;
      let activeRequestId: string | null = null;
      let activeWalletId: string | null = null;
      const releaseActiveLock = async () => {
        if (activeRequestId && activeWalletId) {
          await transactionManager.releaseWalletLock({
            walletId: activeWalletId,
            requestId: activeRequestId
          });
        }
      };
      const roleOk = await requireRole(_context, request, reply, "admin");
      if (!roleOk) return;
      if (!isDryRunEnabled() && !isDemoMode()) {
        const reauthOk = await requireReauth(_context, request, reply);
        if (!reauthOk) return;
        const confirmOk = requireConfirmation(request, reply, "EXECUTE LIVE TRADE");
        if (!confirmOk) return;
      }
      if (_context.rateLimitProvider) {
        await _context.rateLimitProvider.assertLimit(
          `execute-once:${request.ip}`,
          10,
          60_000,
        );
      }
      try {
        input = parseRequestBody(executeOnceSchema, request.body);
      } catch (error) {
        return handleValidationError(error, reply);
      }
      try {
        await assertGlobalEmergencyNotPaused(db);
        if (requiresVaultForLiveSigning()) {
          assertVaultUnlocked();
        }
      } catch (error) {
        if (error instanceof VaultLockedError) {
          return reply.code(423).send({ error: error.message });
        }
        if (isEmergencyPauseError(error)) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }

      const context = await loadTradeContext(db, input);

      if (!context) {
        return reply.code(404).send({ error: "Wallet or pair not found" });
      }

      const sellAmountRaw =
        context.tokenIn === null
          ? null
          : amountToStorageUnits(
              input.sellAmountDisplay,
              context.tokenIn.decimals,
            );
      let requestState;
      try {
        if (!isDryRunEnabled() && !isDemoMode()) {
          await transactionManager.assertNoPendingLiveTransaction(input.walletId);
        }
        const idempotencyKey = requireIdempotencyKey(request);
        requestState = await transactionManager.createOrReplayRequest({
          idempotencyKey,
          walletId: input.walletId,
          action: "SWAP",
          requestHash: hashObject({
            route: "execute-once",
            body: input
          }),
          pairId: input.pairId,
          sellToken: context.tokenIn?.symbol ?? null,
          buyToken: context.tokenOut?.symbol ?? null,
          sellAmountRaw
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
        activeRequestId = requestState.request.id;
        activeWalletId = input.walletId;
        input = { ...input, transactionRequestId: requestState.request.id };
        await transactionManager.acquireWalletLock({
          walletId: input.walletId,
          requestId: requestState.request.id
        });
      } catch (error) {
        if (isTransactionManagerError(error)) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
      const finalizeRequest = async (
        status: "SUBMITTED" | "FAILED" | "REJECTED"
      ) => {
        if (activeRequestId) {
          await transactionManager.updateRequestStatus(activeRequestId, status);
        }
        if (status !== "SUBMITTED") {
          await releaseActiveLock();
        }
      };
      const pairLabel = `${context.tokenIn?.symbol ?? "Unknown"}/${context.tokenOut?.symbol ?? "Unknown"}`;
      const notify = async ({
        eventType,
        status,
        txHash,
        basescanUrl,
      }: {
        eventType:
          | "transaction submitted"
          | "transaction failed"
          | "transaction rejected";
        status: string;
        txHash: string | null;
        basescanUrl: string | null;
      }) => {
        const telegram = createTelegramService(db);
        await telegram
          .notify({
            eventType,
            walletName: context.wallet.name,
            walletAddress: context.wallet.address,
            action: "SWAP",
            pair: pairLabel,
            amount: input.sellAmountDisplay,
            status,
            txHash,
            basescanUrl,
            timestamp: new Date(),
          })
          .catch(() => {
            request.log.warn("Telegram notification failed");
          });
      };

      const earlySafetyReasons = [
        ...demoModeLiveRejectionReasons(),
        ...(isDryRunEnabled() ? ["Global DRY_RUN must be false"] : []),
        ...(requireLiveConfirmation() && input.confirmLiveExecution !== true
          ? ["Live execution confirmation is required"]
          : []),
      ];

      if (earlySafetyReasons.length > 0) {
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "REJECTED",
          router: input.preferredRouter ?? context.pair.preferredRouter,
          tokenIn: context.tokenIn?.symbol ?? null,
          tokenOut: context.tokenOut?.symbol ?? null,
          buyAmountRaw: null,
          gasUsed: null,
          gasUsd: null,
          feeNative: null,
          txHash: null,
          basescanUrl: null,
          errorMessage: earlySafetyReasons.join("; "),
        });
        await notify({
          eventType: "transaction rejected",
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
        });
        await finalizeRequest("REJECTED");

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          reasons: earlySafetyReasons,
          transactionId: transaction?.id ?? null,
        });
      }

      let quote;
      let quoteHash: string | null = null;
      let quoteCalldataHash: string | null = null;
      try {
        quote =
          context.tokenIn && context.tokenOut
            ? await getQuote({
                wallet: context.wallet,
                sellToken: context.tokenIn,
                buyToken: context.tokenOut,
                sellAmountDisplay: input.sellAmountDisplay,
                sellAmountRaw: amountToStorageUnits(
                  input.sellAmountDisplay,
                  context.tokenIn.decimals,
                ),
                routerName:
                  input.preferredRouter ?? context.pair.preferredRouter,
              })
            : null;
        quoteHash = quote ? hashObject(quote) : null;
        quoteCalldataHash = quote?.txData ? hashString(quote.txData) : null;
        if (activeRequestId) {
          await transactionManager.updateRequestHashes(activeRequestId, {
            quoteHash
          });
        }
      } catch {
        const reason = "Quote request failed";
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "REJECTED",
          router: input.preferredRouter ?? context.pair.preferredRouter,
          tokenIn: context.tokenIn?.symbol ?? null,
          tokenOut: context.tokenOut?.symbol ?? null,
          buyAmountRaw: null,
          gasUsed: null,
          gasUsd: null,
          feeNative: null,
          txHash: null,
          basescanUrl: null,
          errorMessage: reason,
        });
        await notify({
          eventType: "transaction rejected",
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
        });
        await finalizeRequest("REJECTED");

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          reasons: [reason],
          transactionId: transaction?.id ?? null,
        });
      }

      const risk = evaluateTradeRisk(input, {
        ...context,
        quote,
      });
      const preSimulationSafety = evaluateLiveExecutionSafety({
        demoMode: isDemoMode(),
        dryRunEnabled: isDryRunEnabled(),
        requireLiveConfirmation: requireLiveConfirmation(),
        confirmLiveExecution: input.confirmLiveExecution === true,
        riskAccepted: risk.accepted,
        riskReasons: risk.reasons,
        quote,
        wallet: context.wallet,
        pair: context.pair,
        sellToken: context.tokenIn,
        buyToken: context.tokenOut,
        sellAmountRaw,
        routers: context.routers,
        simulated: true,
        nativeValueSwapsEnabled: getRuntimeConfig().nativeValueSwapsEnabled,
        maxNativeValueWei: getRuntimeConfig().maxNativeValueWei,
      });

      if (preSimulationSafety.rejected) {
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "REJECTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          buyAmountRaw: quote?.buyAmountRaw ?? null,
          buyAmountUsd: quote?.buyAmountUsd ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: preSimulationSafety.reasons.join("; "),
          toAddress: quote?.txTo ?? null,
          calldataHash: quoteCalldataHash,
          quoteHash,
        });
        await notify({
          eventType: "transaction rejected",
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
        });
        await finalizeRequest("REJECTED");

        return reply.code(statusCodeForRejected).send({
          ...preSimulationSafety,
          transactionId: transaction?.id ?? null,
        });
      }

      // Check wallet can submit (no active lock)
      const canSubmit = await nonceReservation.canWalletSubmit(input.walletId);
      if (!canSubmit.canSubmit) {
        return reply.status(409).send({
          accepted: false,
          rejected: true,
          reasons: [canSubmit.reason ?? "Wallet cannot submit"],
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
          transactionId: null,
          requestId: null,
        });
      }

      // Reserve nonce
      let nonceReservationResult: { reservationId: string; nonce: number } | null = null;
      try {
        nonceReservationResult = await nonceReservation.reserveNonceForWallet(
          input.walletId,
          BASE_CHAIN_ID,
          "LIVE_EXECUTE_ONCE",
          true // finalityRequired
        );
      } catch (err) {
        if (err instanceof NonceReservationError) {
          return reply.status(err.statusCode).send({
            accepted: false,
            rejected: true,
            reasons: [err.message],
            status: "REJECTED",
            txHash: null,
            basescanUrl: null,
            transactionId: null,
            requestId: null,
          });
        }
        throw err;
      }

      const txTo = quote?.txTo as Address;
      const txData = quote?.txData as Hex;
      const transactionValue = BigInt(quote?.txValue ?? "0");
      const proposedTradeUsd = estimateTradeUsd({
        sellAmountDisplay: input.sellAmountDisplay,
        sellTokenSymbol: context.tokenIn?.symbol,
        quoteSellAmountUsd: quote?.sellAmountUsd ?? null,
      });
      const proposedGasUsd = Number(quote?.estimatedGas.gasUsd ?? "0");

      if (context.tokenIn?.address && quote?.allowanceTarget) {
        let requiredAllowance: bigint;
        try {
          requiredAllowance = BigInt(quote.sellAmountRaw);
        } catch {
          requiredAllowance = 0n;
        }

        if (requiredAllowance <= 0n) {
          const reason =
            "Quote sell amount must be raw token units for approval checks";
          const transaction = await storeTransaction({
            db,
            input,
            sellAmountRaw,
            status: "REJECTED",
            router: risk.router,
            tokenIn: quote.sellToken,
            tokenOut: quote.buyToken,
            buyAmountRaw: quote.buyAmountRaw,
            gasUsed: quote.estimatedGas.gasUsed,
            gasUsd: quote.estimatedGas.gasUsd,
            feeNative: quote.estimatedGas.feeNative,
            txHash: null,
            basescanUrl: null,
            errorMessage: reason,
            toAddress: quote.txTo,
            calldataHash: quoteCalldataHash,
            quoteHash,
          });
          await finalizeRequest("REJECTED");

          return reply.code(statusCodeForRejected).send({
            accepted: false,
            rejected: true,
            status: "REJECTED",
            reasons: [reason],
            transactionId: transaction?.id ?? null,
          });
        }

        const allowance = await getTokenAllowance({
          tokenAddress: context.tokenIn.address,
          owner: context.wallet.address,
          spender: quote.allowanceTarget,
        });

        if (allowance < requiredAllowance) {
          const approvalRouter = context.routers.find(
            (router) =>
              router.address?.toLowerCase() ===
              quote.allowanceTarget?.toLowerCase(),
          );
          const canAutoApprove =
            input.autoApprove === true &&
            autoApproveEnabled() &&
            approvalRouter;

          if (!canAutoApprove) {
            const reason =
              input.autoApprove === true && !autoApproveEnabled()
                ? "NEEDS_APPROVAL: auto-approve is disabled"
                : "NEEDS_APPROVAL";
            const transaction = await storeTransaction({
              db,
              input,
              sellAmountRaw,
              status: "REJECTED",
              router: risk.router,
              tokenIn: quote.sellToken,
              tokenOut: quote.buyToken,
              buyAmountRaw: quote.buyAmountRaw,
              gasUsed: quote.estimatedGas.gasUsed,
              gasUsd: quote.estimatedGas.gasUsd,
              feeNative: quote.estimatedGas.feeNative,
              txHash: null,
              basescanUrl: null,
              errorMessage: reason,
              toAddress: quote.txTo,
              calldataHash: quoteCalldataHash,
              quoteHash,
            });
            await notify({
              eventType: "transaction rejected",
              status: "NEEDS_APPROVAL",
              txHash: null,
              basescanUrl: null,
            });
            await finalizeRequest("REJECTED");

            return reply.code(statusCodeForRejected).send({
              accepted: false,
              rejected: true,
              status: "NEEDS_APPROVAL",
              reasons: [reason],
              transactionId: transaction?.id ?? null,
              requiredApproval: {
                tokenId: context.tokenIn.id,
                routerId: approvalRouter?.id ?? null,
                allowanceRaw: allowance.toString(),
                requiredRaw: requiredAllowance.toString(),
              },
            });
          }

          const approvalInput = {
            tokenId: context.tokenIn.id,
            routerId: approvalRouter.id,
            amount: formatUnits(requiredAllowance, context.tokenIn.decimals),
            ...(input.confirmLiveExecution === undefined
              ? {}
              : { confirmLiveExecution: input.confirmLiveExecution }),
          };
          const approval = await createApprovalService(db).approve(
            input.walletId,
            approvalInput,
          );

          if (!approval.accepted || !approval.txHash) {
            await finalizeRequest("REJECTED");
            return reply.code(statusCodeForRejected).send({
              accepted: false,
              rejected: true,
              status: "NEEDS_APPROVAL",
              reasons: ["Auto-approval failed"],
              transactionId: approval.transactionId,
            });
          }

          await basePublicClient.waitForTransactionReceipt({
            hash: approval.txHash as Hex,
          });
        }
      }

      let simulationHash: string | null = null;
      try {
        await basePublicClient.call({
          account: context.wallet.address as Address,
          to: txTo,
          data: txData,
          value: transactionValue,
        });
        simulationHash = hashObject({
          account: context.wallet.address,
          to: txTo,
          data: txData,
          value: quote?.txValue ?? "0"
        });
        if (activeRequestId) {
          await transactionManager.updateRequestHashes(activeRequestId, {
            quoteHash,
            simulationHash
          });
        }
      } catch {
        const reason = "Transaction simulation failed";
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "REJECTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          buyAmountRaw: quote?.buyAmountRaw ?? null,
          buyAmountUsd: quote?.buyAmountUsd ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: reason,
          toAddress: quote?.txTo ?? null,
          calldataHash: quoteCalldataHash,
          quoteHash,
          simulationHash,
        });
        await notify({
          eventType: "transaction rejected",
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
        });
        await finalizeRequest("REJECTED");

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          reasons: [reason],
          transactionId: transaction?.id ?? null,
        });
      }

      const riskCheckedAt = new Date();
      let aggregateRisk;
      let aggregateRiskSnapshot: Record<string, unknown>;
      if (!Number.isFinite(proposedTradeUsd)) {
        aggregateRisk = {
          allowed: false,
          codes: [AGGREGATE_RISK_CODES.disabledOrUnconfigured],
          reasons: [
            "USD-normalized trade notional is required before live signing",
          ],
          stats: {
            totalTradeUsd: "0",
            totalGasUsd: "0",
            totalPendingUsd: "0",
            activeWalletCount: 0,
            failedTxCount: 0,
          },
          limits: null,
          proposedTradeUsd: "NaN",
          proposedGasUsd: Number.isFinite(proposedGasUsd)
            ? proposedGasUsd.toFixed(2)
            : "0.00",
        };
        aggregateRiskSnapshot = createAggregateRiskSnapshot(aggregateRisk);
      } else {
        aggregateRisk = await checkAggregateRisk(
          db,
          proposedTradeUsd,
          Number.isFinite(proposedGasUsd) ? proposedGasUsd : 0,
        );
        aggregateRiskSnapshot = createAggregateRiskSnapshot(aggregateRisk);
      }

      if (!aggregateRisk.allowed) {
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          sellAmountUsd: Number.isFinite(proposedTradeUsd)
            ? proposedTradeUsd.toFixed(2)
            : null,
          status: "REJECTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          buyAmountRaw: quote?.buyAmountRaw ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: aggregateRisk.reasons.join("; "),
          toAddress: quote?.txTo ?? null,
          calldataHash: quoteCalldataHash,
          quoteHash,
          simulationHash,
          usdPriceSource: quote?.usdPriceSource ?? null,
          usdPriceTimestamp: quote?.usdPriceTimestamp ?? null,
          quoteUsdSource: quote?.quoteUsdSource ?? null,
          riskCheckedAt,
          aggregateRiskSnapshotJson: aggregateRiskSnapshot,
        });
        await finalizeRequest("REJECTED");

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          status: "REJECTED",
          codes: aggregateRisk.codes,
          reasons: aggregateRisk.reasons,
          aggregateRisk: aggregateRiskSnapshot,
          transactionId: transaction?.id ?? null,
        });
      }

      try {
        const masterKey = await loadOrCreateMasterKey();
        const privateKey = decryptPrivateKey(
          context.wallet.encryptedPrivateKey,
          masterKey,
        );
        assertPrivateKeyMatchesAddress(privateKey, context.wallet.address);
        const account = privateKeyToAccount(privateKey as Hex);
        const walletClient = createWalletClient({
          account,
          chain: baseMainnet,
          transport: http(getRuntimeConfig().baseRpcUrl),
        });
        const txHash = await walletClient.sendTransaction({
          account,
          to: txTo,
          data: txData,
          value: transactionValue,
          nonce: nonceReservationResult.nonce,
        });
        await nonceReservation.attachSubmittedTx(
          input.walletId,
          nonceReservationResult.reservationId,
          txHash
        );
        const basescanUrl = buildBasescanTransactionLink(txHash);
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "SUBMITTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          buyAmountRaw: quote?.buyAmountRaw ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash,
          basescanUrl,
          errorMessage: null,
          fromAddress: context.wallet.address,
          toAddress: txTo,
          calldataHash: quoteCalldataHash,
          nonce: nonceReservationResult.nonce,
          quoteHash,
          simulationHash,
          sellAmountUsd: proposedTradeUsd.toFixed(2),
          usdPriceSource: quote?.usdPriceSource ?? null,
          usdPriceTimestamp: quote?.usdPriceTimestamp ?? null,
          quoteUsdSource: quote?.quoteUsdSource ?? null,
          riskCheckedAt,
          aggregateRiskSnapshotJson: aggregateRiskSnapshot,
        });
        await notify({
          eventType: "transaction submitted",
          status: "SUBMITTED",
          txHash,
          basescanUrl,
        });
        await finalizeRequest("SUBMITTED");

        return reply.code(201).send({
          accepted: true,
          rejected: false,
          reasons: [],
          status: "SUBMITTED",
          txHash,
          basescanUrl,
          transactionId: transaction?.id ?? null,
        });
      } catch {
        const reason = "Transaction signing or submission failed";
        const transaction = await storeTransaction({
          db,
          input,
          sellAmountRaw,
          status: "FAILED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          buyAmountRaw: quote?.buyAmountRaw ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: reason,
          fromAddress: context.wallet.address,
          toAddress: quote?.txTo ?? null,
          calldataHash: quoteCalldataHash,
          nonce: null,
          quoteHash,
          simulationHash,
        });
        await notify({
          eventType: "transaction failed",
          status: "FAILED",
          txHash: null,
          basescanUrl: null,
        });
        await finalizeRequest("FAILED");

        return reply.code(502).send({
          accepted: false,
          rejected: true,
          reasons: [reason],
          transactionId: transaction?.id ?? null,
        });
      }
    },
  );
};
