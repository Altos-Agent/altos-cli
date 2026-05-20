import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { planDryRunTrade, type DryRunPlanInput } from "../strategy/planner.js";
import {
  amountToStorageUnits,
  loadTradeContextAndQuote
} from "../strategy/trade-context.js";

export const createScheduledDryRun = async ({
  db,
  walletId,
  pairId,
  amountIn,
  occurrenceId,
}: {
  db: DbClient;
  walletId: string;
  pairId: string;
  amountIn: string;
  occurrenceId?: string | null;
}) => {
  const input: DryRunPlanInput = {
    walletId,
    pairId,
    sellAmountDisplay: amountIn,
    mode: "DRY_RUN_ONLY"
  };
  const context = await loadTradeContextAndQuote(db, input);
  if (!context) {
    throw new Error("Wallet or pair not found");
  }

  const result = planDryRunTrade(input, context);
  const status = result.accepted ? "DRY_RUN" : "REJECTED";
  const [transaction] = await db
    .insert(transactions)
    .values({
      walletId,
      pairId,
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
          : amountToStorageUnits(amountIn, context.tokenIn.decimals),
      amountInRaw:
        context.tokenIn === null
          ? null
          : amountToStorageUnits(amountIn, context.tokenIn.decimals),
      amountOut: result.quote ? result.quote.buyAmountRaw : null,
      amountOutRaw: result.quote ? result.quote.buyAmountRaw : null,
      amountInUsd: result.quote?.sellAmountUsd ?? result.estimatedCost.amountUsd,
      amountOutUsd: result.quote?.buyAmountUsd ?? null,
      gasUsed: result.estimatedGas.gasUsed,
      gasUsd: result.estimatedGas.gasUsd,
      feeNative: result.estimatedGas.feeNative,
      usdPriceSource: result.quote?.usdPriceSource ?? null,
      usdPriceTimestamp: result.quote?.usdPriceTimestamp ?? null,
      quoteUsdSource: result.quote?.quoteUsdSource ?? null,
      errorMessage: result.reasons.length > 0 ? result.reasons.join("; ") : null,
      basescanUrl: null,
      occurrenceId: occurrenceId ?? null,
    })
    .returning();

  return {
    context,
    result,
    status,
    transactionId: transaction?.id ?? null,
    quoteHash: transaction?.quoteHash ?? null,
    simulationHash: transaction?.simulationHash ?? null,
  };
};
