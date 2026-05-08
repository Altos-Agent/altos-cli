import type { FastifyInstance } from "fastify";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import { planDryRunTrade, type DryRunPlanInput } from "./planner.js";
import {
  amountToStorageUnits,
  loadTradeContextAndQuote
} from "./trade-context.js";

export const registerPlanRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  server.post<{ Body: DryRunPlanInput }>(
    "/api/plans/dry-run",
    async (request, reply) => {
      if (request.body.mode !== "DRY_RUN_ONLY") {
        return reply.code(400).send({ error: "Only DRY_RUN_ONLY is supported" });
      }

      const context = await loadTradeContextAndQuote(db, request.body);
      if (!context) {
        return reply.code(404).send({ error: "Wallet or pair not found" });
      }

      const result = planDryRunTrade(request.body, context);
      const status = result.accepted ? "DRY_RUN" : "REJECTED";

      const [transaction] = await db
        .insert(transactions)
        .values({
          walletId: request.body.walletId,
          pairId: request.body.pairId,
          chainId: BASE_CHAIN_ID,
          txHash: null,
          status,
          action: "SWAP",
          router: result.estimatedRoute.router,
          tokenIn: result.estimatedRoute.tokenIn,
          tokenOut: result.estimatedRoute.tokenOut,
          amountIn: amountToStorageUnits(request.body.amountIn),
          amountOut: result.quote
            ? amountToStorageUnits(result.quote.buyAmount)
            : null,
          gasUsed: result.estimatedGas.gasUsed,
          gasUsd: result.estimatedGas.gasUsd,
          feeNative: result.estimatedGas.feeNative,
          errorMessage:
            result.reasons.length > 0 ? result.reasons.join("; ") : null,
          basescanUrl: null
        })
        .returning();

      const telegram = createTelegramService(db);
      await telegram
        .notify({
          eventType: result.accepted ? "dry-run accepted" : "dry-run rejected",
          walletName: context.wallet.name,
          walletAddress: context.wallet.address,
          action: "SWAP",
          pair: `${context.tokenIn?.symbol ?? "Unknown"}/${context.tokenOut?.symbol ?? "Unknown"}`,
          amount: String(request.body.amountIn),
          status,
          txHash: null,
          basescanUrl: result.basescanLinks.wallet,
          timestamp: new Date()
        })
        .catch(() => {
          request.log.warn("Telegram notification failed");
        });

      return reply.code(201).send({
        ...result,
        transactionId: transaction?.id ?? null,
        status
      });
    }
  );

  server.post<{ Body: Omit<DryRunPlanInput, "mode"> }>(
    "/api/quotes",
    async (request, reply) => {
      const input: DryRunPlanInput = {
        walletId: request.body.walletId,
        pairId: request.body.pairId,
        amountIn: request.body.amountIn,
        preferredRouter: request.body.preferredRouter,
        mode: "DRY_RUN_ONLY"
      };
      const context = await loadTradeContextAndQuote(db, input);
      if (!context) {
        return reply.code(404).send({ error: "Wallet or pair not found" });
      }

      const riskEvaluation = planDryRunTrade(input, context);

      return {
        quote: context.quote,
        riskEvaluation: {
          accepted: riskEvaluation.accepted,
          rejected: riskEvaluation.rejected,
          reasons: riskEvaluation.reasons
        },
        accepted: riskEvaluation.accepted,
        rejected: riskEvaluation.rejected
      };
    }
  );

};
