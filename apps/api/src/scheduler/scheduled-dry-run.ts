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
  amountIn
}: {
  db: DbClient;
  walletId: string;
  pairId: string;
  amountIn: string;
}) => {
  const input: DryRunPlanInput = {
    walletId,
    pairId,
    amountIn,
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
      amountIn: amountToStorageUnits(amountIn),
      amountOut: result.quote ? amountToStorageUnits(result.quote.buyAmount) : null,
      gasUsed: result.estimatedGas.gasUsed,
      gasUsd: result.estimatedGas.gasUsd,
      feeNative: result.estimatedGas.feeNative,
      errorMessage: result.reasons.length > 0 ? result.reasons.join("; ") : null,
      basescanUrl: null
    })
    .returning();

  return {
    context,
    result,
    status,
    transactionId: transaction?.id ?? null
  };
};
