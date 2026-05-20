import type { FastifyInstance } from "fastify";
import {
  BASE_CHAIN_ID,
  dryRunPlanSchema,
  quoteRequestSchema
} from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import {
  handleValidationError,
  parseRequestBody
} from "../http/validation.js";
import { createTelegramService } from "../notifications/telegram.js";
import { checkAggregateRisk, upsertAggregateStats } from "../risk/aggregate-risk.js";
import { estimateTradeUsd, planDryRunTrade, type DryRunPlanInput } from "./planner.js";
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
      let input: DryRunPlanInput;
      try {
        input = parseRequestBody(dryRunPlanSchema, request.body);
      } catch (error) {
        return handleValidationError(error, reply);
      }

      const context = await loadTradeContextAndQuote(db, input);
      if (!context) {
        return reply.code(404).send({ error: "Wallet or pair not found" });
      }

      const amountUsd = estimateTradeUsd({
        sellAmountDisplay: input.sellAmountDisplay,
        sellTokenSymbol: context.tokenIn?.symbol,
        quoteSellAmountUsd: context.quote?.sellAmountUsd,
      });
      const estimatedGasUsd = Number(context.quote?.estimatedGas?.gasUsd ?? "0");
      const aggregateCheck = await checkAggregateRisk(db, amountUsd, estimatedGasUsd);

      const result = planDryRunTrade(input, context);
      const status = result.accepted
        ? aggregateCheck.allowed
          ? "DRY_RUN"
          : "REJECTED"
        : "REJECTED";

      const reasons = aggregateCheck.allowed
        ? result.reasons
        : [...aggregateCheck.reasons, ...result.reasons];

      const [transaction] = await db
        .insert(transactions)
        .values({
          walletId: input.walletId,
          pairId: input.pairId,
          chainId: BASE_CHAIN_ID,
          txHash: null,
          status,
          action: "SWAP",
          router: result.estimatedRoute.router,
          tokenIn: result.estimatedRoute.tokenIn,
          tokenOut: result.estimatedRoute.tokenOut,
          amountIn:
            context.tokenIn === null
              ? null
              : amountToStorageUnits(
                  input.sellAmountDisplay,
                  context.tokenIn.decimals
                ),
          amountInRaw:
            context.tokenIn === null
              ? null
              : amountToStorageUnits(
                  input.sellAmountDisplay,
                  context.tokenIn.decimals
                ),
          amountOut: result.quote
            ? result.quote.buyAmountRaw
            : null,
          amountOutRaw: result.quote
            ? result.quote.buyAmountRaw
            : null,
          amountInUsd: Number.isFinite(amountUsd) ? amountUsd.toFixed(2) : null,
          amountOutUsd: result.quote?.buyAmountUsd ?? null,
          gasUsed: result.estimatedGas.gasUsed,
          gasUsd: result.estimatedGas.gasUsd,
          feeNative: result.estimatedGas.feeNative,
          usdPriceSource: result.quote?.usdPriceSource ?? null,
          usdPriceTimestamp: result.quote?.usdPriceTimestamp ?? null,
          quoteUsdSource: result.quote?.quoteUsdSource ?? null,
          riskCheckedAt: new Date(),
          aggregateRiskSnapshotJson: {
            allowed: aggregateCheck.allowed,
            codes: aggregateCheck.codes,
            reasons: aggregateCheck.reasons,
            proposedTradeUsd: aggregateCheck.proposedTradeUsd,
            proposedGasUsd: aggregateCheck.proposedGasUsd,
            stats: aggregateCheck.stats,
            limits: aggregateCheck.limits,
          },
          errorMessage:
            reasons.length > 0 ? reasons.join("; ") : null,
          basescanUrl: null
        })
        .returning();

      if (result.accepted && aggregateCheck.allowed) {
        await upsertAggregateStats(db).catch((err) => {
          request.log.warn({ err }, "Failed to update aggregate stats");
        });
      }

      const telegram = createTelegramService(db);
      await telegram
        .notify({
          eventType:
            result.accepted && aggregateCheck.allowed
              ? "dry-run accepted"
              : "dry-run rejected",
          walletName: context.wallet.name,
          walletAddress: context.wallet.address,
          action: "SWAP",
          pair: `${context.tokenIn?.symbol ?? "Unknown"}/${context.tokenOut?.symbol ?? "Unknown"}`,
          amount: input.sellAmountDisplay,
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
      let quoteRequest;
      try {
        quoteRequest = parseRequestBody(quoteRequestSchema, request.body);
      } catch (error) {
        return handleValidationError(error, reply);
      }
      const input: DryRunPlanInput = {
        ...quoteRequest,
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
