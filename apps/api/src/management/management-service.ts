import { and, eq, inArray } from "drizzle-orm";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import {
  auditLogs,
  pairs,
  routers,
  tokens,
  walletPairRules,
  wallets
} from "../db/schema.js";
import {
  assertHighRiskTokenPolicy,
  assertPairEnablePolicy,
  assertWalletPairRulePolicy,
  defaultMaxSlippageBps,
  RiskPolicyError
} from "./risk-policy.js";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export class ManagementError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "ManagementError";
  }
}

const localActor = "local";

const toNumericString = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new ManagementError("Numeric values must be non-negative");
  }

  return String(value);
};

const toOptionalInteger = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new ManagementError("Integer values must be non-negative");
  }

  return numericValue;
};

const audit = async (
  db: DbClient,
  action: string,
  entityType: string,
  entityId: string,
  metadataJson?: Record<string, unknown>
) => {
  await db.insert(auditLogs).values({
    actor: localActor,
    action,
    entityType,
    entityId,
    metadataJson
  });
};

const getOne = async <T>(rows: T[], entity: string): Promise<T> => {
  const [row] = rows;
  if (!row) {
    throw new ManagementError(`${entity} not found`, 404);
  }
  return row;
};

const getTokenById = async (db: DbClient, id: string) =>
  await getOne(
    await db.select().from(tokens).where(eq(tokens.id, id)),
    "Token"
  );

const getRouterByName = async (
  db: DbClient,
  name: string | null | undefined
) => {
  if (!name) {
    return { enabled: true };
  }

  const [router] = await db
    .select()
    .from(routers)
    .where(and(eq(routers.chainId, BASE_CHAIN_ID), eq(routers.name, name)));

  return { enabled: router?.enabled === true };
};

const validatePairIfEnabled = async (
  db: DbClient,
  input: {
    enabled: boolean;
    tokenInId: string;
    tokenOutId: string;
    maxTradeUsd: string | number | null | undefined;
    preferredRouter: string | null | undefined;
    fallbackRouter: string | null | undefined;
  }
) => {
  if (!input.enabled) {
    return;
  }

  const [tokenIn, tokenOut] = await Promise.all([
    getTokenById(db, input.tokenInId),
    getTokenById(db, input.tokenOutId)
  ]);
  const [preferredRouter, fallbackRouter] = await Promise.all([
    getRouterByName(db, input.preferredRouter),
    getRouterByName(db, input.fallbackRouter)
  ]);

  assertPairEnablePolicy({
    tokenInEnabled: tokenIn.enabled,
    tokenOutEnabled: tokenOut.enabled,
    tokenInRiskLevel: tokenIn.riskLevel,
    tokenOutRiskLevel: tokenOut.riskLevel,
    maxTradeUsd: input.maxTradeUsd,
    preferredRouterEnabled: preferredRouter.enabled,
    fallbackRouterEnabled: fallbackRouter.enabled
  });
};

export const createManagementService = (db: DbClient) => ({
  async listTokens() {
    return await db.select().from(tokens);
  },

  async createToken(input: {
    chainId?: number;
    symbol: string;
    name: string;
    address?: string | null;
    decimals: number;
    riskLevel?: RiskLevel;
    enabled?: boolean;
    maxTradeUsd?: string | number | null;
  }) {
    const enabled = input.enabled === true;
    const riskLevel = input.riskLevel ?? "MEDIUM";
    const maxTradeUsd = toNumericString(input.maxTradeUsd);

    assertHighRiskTokenPolicy({ enabled, riskLevel, maxTradeUsd });

    const token = await getOne(
      await db
        .insert(tokens)
        .values({
          chainId: input.chainId ?? BASE_CHAIN_ID,
          symbol: input.symbol.trim(),
          name: input.name.trim(),
          address: input.address ?? null,
          decimals: input.decimals,
          riskLevel,
          maxTradeUsd,
          enabled
        })
        .returning(),
      "Token"
    );

    await audit(db, "token.create", "token", token.id, {
      symbol: token.symbol,
      enabled: token.enabled
    });
    return token;
  },

  async updateToken(id: string, input: Partial<typeof tokens.$inferInsert>) {
    const existing = await getTokenById(db, id);
    const enabled = input.enabled ?? existing.enabled;
    const riskLevel = (input.riskLevel ?? existing.riskLevel) as RiskLevel;
    const maxTradeUsd =
      "maxTradeUsd" in input
        ? toNumericString(input.maxTradeUsd)
        : existing.maxTradeUsd;

    assertHighRiskTokenPolicy({ enabled, riskLevel, maxTradeUsd });

    const token = await getOne(
      await db
        .update(tokens)
        .set({
          ...input,
          maxTradeUsd,
          updatedAt: new Date()
        })
        .where(eq(tokens.id, id))
        .returning(),
      "Token"
    );

    await audit(db, "token.update", "token", token.id, {
      enabled: token.enabled,
      riskLevel: token.riskLevel
    });
    return token;
  },

  async setTokenEnabled(id: string, enabled: boolean) {
    const existing = await getTokenById(db, id);
    assertHighRiskTokenPolicy({
      enabled,
      riskLevel: existing.riskLevel,
      maxTradeUsd: existing.maxTradeUsd
    });
    return await this.updateToken(id, { enabled });
  },

  async listRouters() {
    return await db.select().from(routers);
  },

  async updateRouter(id: string, input: Partial<typeof routers.$inferInsert>) {
    const router = await getOne(
      await db.update(routers).set(input).where(eq(routers.id, id)).returning(),
      "Router"
    );
    await audit(db, "router.update", "router", router.id, {
      enabled: router.enabled
    });
    return router;
  },

  async setRouterEnabled(id: string, enabled: boolean) {
    return await this.updateRouter(id, { enabled });
  },

  async listPairs() {
    const [pairRows, tokenRows] = await Promise.all([
      db.select().from(pairs),
      db.select().from(tokens)
    ]);
    const tokenMap = new Map(tokenRows.map((token) => [token.id, token]));

    return pairRows.map((pair) => ({
      ...pair,
      tokenIn: tokenMap.get(pair.tokenInId) ?? null,
      tokenOut: tokenMap.get(pair.tokenOutId) ?? null
    }));
  },

  async createPair(input: {
    chainId?: number;
    tokenInId: string;
    tokenOutId: string;
    enabled?: boolean;
    maxTradeUsd?: string | number | null;
    maxSlippageBps?: string | number | null;
    maxPriceImpactBps?: string | number | null;
    preferredRouter?: string | null;
    fallbackRouter?: string | null;
  }) {
    const enabled = input.enabled === true;
    const maxTradeUsd = toNumericString(input.maxTradeUsd);
    const maxSlippageBps =
      toOptionalInteger(input.maxSlippageBps) ?? defaultMaxSlippageBps;

    await validatePairIfEnabled(db, {
      enabled,
      tokenInId: input.tokenInId,
      tokenOutId: input.tokenOutId,
      maxTradeUsd,
      preferredRouter: input.preferredRouter,
      fallbackRouter: input.fallbackRouter
    });

    const pair = await getOne(
      await db
        .insert(pairs)
        .values({
          chainId: input.chainId ?? BASE_CHAIN_ID,
          tokenInId: input.tokenInId,
          tokenOutId: input.tokenOutId,
          enabled,
          maxTradeUsd,
          maxSlippageBps,
          maxPriceImpactBps: toOptionalInteger(input.maxPriceImpactBps),
          preferredRouter: input.preferredRouter ?? null,
          fallbackRouter: input.fallbackRouter ?? null
        })
        .returning(),
      "Pair"
    );

    await audit(db, "pair.create", "pair", pair.id, { enabled: pair.enabled });
    return pair;
  },

  async updatePair(id: string, input: Partial<typeof pairs.$inferInsert>) {
    const existing = await getOne(
      await db.select().from(pairs).where(eq(pairs.id, id)),
      "Pair"
    );
    const enabled = input.enabled ?? existing.enabled;
    const maxTradeUsd =
      "maxTradeUsd" in input
        ? toNumericString(input.maxTradeUsd)
        : existing.maxTradeUsd;
    const tokenInId = input.tokenInId ?? existing.tokenInId;
    const tokenOutId = input.tokenOutId ?? existing.tokenOutId;
    const preferredRouter = input.preferredRouter ?? existing.preferredRouter;
    const fallbackRouter = input.fallbackRouter ?? existing.fallbackRouter;

    await validatePairIfEnabled(db, {
      enabled,
      tokenInId,
      tokenOutId,
      maxTradeUsd,
      preferredRouter,
      fallbackRouter
    });

    const pair = await getOne(
      await db
        .update(pairs)
        .set({
          ...input,
          maxTradeUsd,
          maxSlippageBps:
            "maxSlippageBps" in input
              ? toOptionalInteger(input.maxSlippageBps)
              : existing.maxSlippageBps,
          maxPriceImpactBps:
            "maxPriceImpactBps" in input
              ? toOptionalInteger(input.maxPriceImpactBps)
              : existing.maxPriceImpactBps,
          updatedAt: new Date()
        })
        .where(eq(pairs.id, id))
        .returning(),
      "Pair"
    );

    await audit(db, "pair.update", "pair", pair.id, { enabled: pair.enabled });
    return pair;
  },

  async setPairEnabled(id: string, enabled: boolean) {
    return await this.updatePair(id, { enabled });
  },

  async listWalletPairRules(walletId: string) {
    await getOne(
      await db.select({ id: wallets.id }).from(wallets).where(eq(wallets.id, walletId)),
      "Wallet"
    );
    const [ruleRows, pairRows] = await Promise.all([
      db
        .select()
        .from(walletPairRules)
        .where(eq(walletPairRules.walletId, walletId)),
      this.listPairs()
    ]);
    const ruleMap = new Map(ruleRows.map((rule) => [rule.pairId, rule]));

    return pairRows.map((pair) => ({
      pair,
      rule: ruleMap.get(pair.id) ?? null
    }));
  },

  async putWalletPairRules(
    walletId: string,
    input: {
      rules: {
        pairId: string;
        enabled: boolean;
        maxTradeUsd?: string | number | null;
        maxDailyTrades?: string | number | null;
      }[];
    }
  ) {
    await getOne(
      await db.select({ id: wallets.id }).from(wallets).where(eq(wallets.id, walletId)),
      "Wallet"
    );
    const pairIds = input.rules.map((rule) => rule.pairId);
    const pairRows =
      pairIds.length === 0
        ? []
        : await db.select().from(pairs).where(inArray(pairs.id, pairIds));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));

    for (const rule of input.rules) {
      const pair = pairMap.get(rule.pairId);
      if (!pair) {
        throw new ManagementError("Pair not found", 404);
      }

      const maxTradeUsd = toNumericString(rule.maxTradeUsd);
      assertWalletPairRulePolicy({
        enabled: rule.enabled,
        pairEnabled: pair.enabled,
        maxTradeUsd
      });

      await db
        .insert(walletPairRules)
        .values({
          walletId,
          pairId: rule.pairId,
          enabled: rule.enabled,
          maxTradeUsd,
          maxDailyTrades: toOptionalInteger(rule.maxDailyTrades)
        })
        .onConflictDoUpdate({
          target: [walletPairRules.walletId, walletPairRules.pairId],
          set: {
            enabled: rule.enabled,
            maxTradeUsd,
            maxDailyTrades: toOptionalInteger(rule.maxDailyTrades),
            updatedAt: new Date()
          }
        });
    }

    await audit(db, "wallet_pair_rules.replace", "wallet", walletId, {
      ruleCount: input.rules.length
    });

    return await this.listWalletPairRules(walletId);
  }
});

export const isManagementError = (
  error: unknown
): error is ManagementError | RiskPolicyError =>
  error instanceof ManagementError || error instanceof RiskPolicyError;
