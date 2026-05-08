import { and, eq, gte } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  dailyWalletStats,
  pairs,
  routers,
  tokens,
  transactions,
  walletPairRules,
  wallets
} from "../db/schema.js";
import { getQuote } from "../quote/quoteEngine.js";
import type { DryRunPlanInput } from "./planner.js";

export type TradeInput = Pick<
  DryRunPlanInput,
  "walletId" | "pairId" | "amountIn" | "preferredRouter"
>;

const today = () => new Date().toISOString().slice(0, 10);

export const amountToStorageUnits = (amountIn: string | number) => {
  const amount = Number(amountIn);
  if (!Number.isFinite(amount)) {
    return "0";
  }

  return Math.round(amount * 1_000_000).toString();
};

export const loadTradeContext = async (db: DbClient, input: TradeInput) => {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, input.walletId));
  const [pair] = await db.select().from(pairs).where(eq(pairs.id, input.pairId));

  if (!wallet || !pair) {
    return null;
  }

  const [walletPairRule] = await db
    .select()
    .from(walletPairRules)
    .where(
      and(
        eq(walletPairRules.walletId, input.walletId),
        eq(walletPairRules.pairId, input.pairId)
      )
    );
  const [tokenIn, tokenOut, routerRows, statsRows, todaysTransactions] =
    await Promise.all([
      db.select().from(tokens).where(eq(tokens.id, pair.tokenInId)),
      db.select().from(tokens).where(eq(tokens.id, pair.tokenOutId)),
      db.select().from(routers).where(eq(routers.chainId, pair.chainId)),
      db
        .select()
        .from(dailyWalletStats)
        .where(
          and(
            eq(dailyWalletStats.walletId, input.walletId),
            gte(dailyWalletStats.date, today())
          )
        ),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.walletId, input.walletId),
            gte(transactions.createdAt, new Date(`${today()}T00:00:00.000Z`))
          )
        )
    ]);

  const dailyStats = statsRows[0] ?? {
    id: "derived-today-stats",
    walletId: input.walletId,
    date: today(),
    txCount: 0,
    gasSpentUsd: "0",
    estimatedLossUsd: "0",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return {
    wallet,
    pair,
    walletPairRule: walletPairRule ?? null,
    tokenIn: tokenIn[0] ?? null,
    tokenOut: tokenOut[0] ?? null,
    routers: routerRows,
    dailyWalletStats: {
      ...dailyStats,
      txCount: todaysTransactions.length
    }
  };
};

export const loadTradeContextAndQuote = async (
  db: DbClient,
  input: TradeInput
) => {
  const context = await loadTradeContext(db, input);
  if (!context) {
    return null;
  }

  const quote =
    context.tokenIn && context.tokenOut
      ? await getQuote({
          wallet: context.wallet,
          sellToken: context.tokenIn,
          buyToken: context.tokenOut,
          sellAmount: String(input.amountIn),
          routerName: input.preferredRouter ?? context.pair.preferredRouter
        })
      : null;

  return {
    ...context,
    quote
  };
};
