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
import {
  createApprovalService,
  getTokenAllowance,
} from "../approvals/approval-service.js";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";
import { baseMainnet, basePublicClient } from "../blockchain/baseClient.js";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import { getQuote } from "../quote/quoteEngine.js";
import { evaluateTradeRisk } from "../strategy/planner.js";
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
import { evaluateLiveExecutionSafety } from "./live-execution.js";

interface ExecuteOnceInput {
  walletId: string;
  pairId: string;
  amountIn: string;
  preferredRouter?: string | null;
  confirmLiveExecution?: boolean;
  autoApprove?: boolean;
}

const autoApproveEnabled = () => process.env.AUTO_APPROVE === "true";

const txValue = "0x0" as const;

const statusCodeForRejected = 200;

const storeTransaction = async ({
  db,
  input,
  status,
  router,
  tokenIn,
  tokenOut,
  amountOut,
  gasUsed,
  gasUsd,
  feeNative,
  txHash,
  basescanUrl,
  errorMessage,
}: {
  db: DbClient;
  input: ExecuteOnceInput;
  status: "SUBMITTED" | "FAILED" | "REJECTED";
  router: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
  amountOut: string | null;
  gasUsed: string | null;
  gasUsd: string | null;
  feeNative: string | null;
  txHash: string | null;
  basescanUrl: string | null;
  errorMessage: string | null;
}) => {
  const [transaction] = await db
    .insert(transactions)
    .values({
      walletId: input.walletId,
      pairId: input.pairId,
      chainId: BASE_CHAIN_ID,
      txHash,
      status,
      action: "SWAP",
      router,
      tokenIn,
      tokenOut,
      amountIn: amountToStorageUnits(input.amountIn),
      amountOut: amountOut ? amountToStorageUnits(amountOut) : null,
      gasUsed,
      gasUsd,
      feeNative,
      errorMessage,
      basescanUrl,
    })
    .returning();

  return transaction;
};

export const registerTradeRoutes = async (
  server: FastifyInstance,
  db: DbClient,
) => {
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
      const input = request.body;
      const context = await loadTradeContext(db, input);

      if (!context) {
        return reply.code(404).send({ error: "Wallet or pair not found" });
      }

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
            amount: String(input.amountIn),
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
          status: "REJECTED",
          router: input.preferredRouter ?? context.pair.preferredRouter,
          tokenIn: context.tokenIn?.symbol ?? null,
          tokenOut: context.tokenOut?.symbol ?? null,
          amountOut: null,
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

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          reasons: earlySafetyReasons,
          transactionId: transaction?.id ?? null,
        });
      }

      let quote;
      try {
        quote =
          context.tokenIn && context.tokenOut
            ? await getQuote({
                wallet: context.wallet,
                sellToken: context.tokenIn,
                buyToken: context.tokenOut,
                sellAmount: String(input.amountIn),
                routerName:
                  input.preferredRouter ?? context.pair.preferredRouter,
              })
            : null;
      } catch {
        const reason = "Quote request failed";
        const transaction = await storeTransaction({
          db,
          input,
          status: "REJECTED",
          router: input.preferredRouter ?? context.pair.preferredRouter,
          tokenIn: context.tokenIn?.symbol ?? null,
          tokenOut: context.tokenOut?.symbol ?? null,
          amountOut: null,
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
        routers: context.routers,
        simulated: true,
      });

      if (preSimulationSafety.rejected) {
        const transaction = await storeTransaction({
          db,
          input,
          status: "REJECTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          amountOut: quote?.buyAmount ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: preSimulationSafety.reasons.join("; "),
        });
        await notify({
          eventType: "transaction rejected",
          status: "REJECTED",
          txHash: null,
          basescanUrl: null,
        });

        return reply.code(statusCodeForRejected).send({
          ...preSimulationSafety,
          transactionId: transaction?.id ?? null,
        });
      }

      const txTo = quote?.txTo as Address;
      const txData = quote?.txData as Hex;

      if (context.tokenIn?.address && quote?.allowanceTarget) {
        let requiredAllowance: bigint;
        try {
          requiredAllowance = BigInt(quote.sellAmount);
        } catch {
          requiredAllowance = 0n;
        }

        if (requiredAllowance <= 0n) {
          const reason =
            "Quote sell amount must be raw token units for approval checks";
          const transaction = await storeTransaction({
            db,
            input,
            status: "REJECTED",
            router: risk.router,
            tokenIn: quote.sellToken,
            tokenOut: quote.buyToken,
            amountOut: quote.buyAmount,
            gasUsed: quote.estimatedGas.gasUsed,
            gasUsd: quote.estimatedGas.gasUsd,
            feeNative: quote.estimatedGas.feeNative,
            txHash: null,
            basescanUrl: null,
            errorMessage: reason,
          });

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
              status: "REJECTED",
              router: risk.router,
              tokenIn: quote.sellToken,
              tokenOut: quote.buyToken,
              amountOut: quote.buyAmount,
              gasUsed: quote.estimatedGas.gasUsed,
              gasUsd: quote.estimatedGas.gasUsd,
              feeNative: quote.estimatedGas.feeNative,
              txHash: null,
              basescanUrl: null,
              errorMessage: reason,
            });
            await notify({
              eventType: "transaction rejected",
              status: "NEEDS_APPROVAL",
              txHash: null,
              basescanUrl: null,
            });

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

      try {
        await basePublicClient.call({
          account: context.wallet.address as Address,
          to: txTo,
          data: txData,
          value: BigInt(txValue),
        });
      } catch {
        const reason = "Transaction simulation failed";
        const transaction = await storeTransaction({
          db,
          input,
          status: "REJECTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          amountOut: quote?.buyAmount ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
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

        return reply.code(statusCodeForRejected).send({
          accepted: false,
          rejected: true,
          reasons: [reason],
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
          transport: http(
            process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
          ),
        });
        const txHash = await walletClient.sendTransaction({
          account,
          to: txTo,
          data: txData,
          value: BigInt(txValue),
        });
        const basescanUrl = buildBasescanTransactionLink(txHash);
        const transaction = await storeTransaction({
          db,
          input,
          status: "SUBMITTED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          amountOut: quote?.buyAmount ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash,
          basescanUrl,
          errorMessage: null,
        });
        await notify({
          eventType: "transaction submitted",
          status: "SUBMITTED",
          txHash,
          basescanUrl,
        });

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
          status: "FAILED",
          router: risk.router,
          tokenIn: quote?.sellToken ?? context.tokenIn?.symbol ?? null,
          tokenOut: quote?.buyToken ?? context.tokenOut?.symbol ?? null,
          amountOut: quote?.buyAmount ?? null,
          gasUsed: quote?.estimatedGas.gasUsed ?? null,
          gasUsd: quote?.estimatedGas.gasUsd ?? null,
          feeNative: quote?.estimatedGas.feeNative ?? null,
          txHash: null,
          basescanUrl: null,
          errorMessage: reason,
        });
        await notify({
          eventType: "transaction failed",
          status: "FAILED",
          txHash: null,
          basescanUrl: null,
        });

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
