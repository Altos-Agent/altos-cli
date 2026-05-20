import { and, eq, inArray } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
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
import { getCurrentRequestId } from "../http/request-context.js";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "PLACEHOLDER" | "BLOCKED";

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

const checksumOrNull = (value: string | null | undefined) => {
  if (!value) return null;
  if (!isAddress(value)) {
    throw new ManagementError("Address must be a valid EVM address");
  }
  return getAddress(value);
};

const evidenceRequired = (status: VerificationStatus | undefined) =>
  status === "VERIFIED";

const assertVerificationEvidence = (
  entityType: string,
  input: {
    verificationStatus?: VerificationStatus | undefined;
    verificationSource?: string | null | undefined;
    verificationEvidenceUrl?: string | null | undefined;
    verifiedBy?: string | null | undefined;
  }
) => {
  if (!evidenceRequired(input.verificationStatus)) return;
  if (!input.verificationSource || !input.verificationEvidenceUrl || !input.verifiedBy) {
    throw new ManagementError(
      `${entityType} VERIFIED status requires verificationSource, verificationEvidenceUrl, and verifiedBy`
    );
  }
};

const assertCanEnableVerificationStatus = (
  entityType: string,
  enabled: boolean,
  status: VerificationStatus
) => {
  if (enabled && (status === "BLOCKED" || status === "PLACEHOLDER")) {
    throw new ManagementError(`${entityType} ${status} records cannot be enabled`);
  }
};

const resetVerificationOnSensitiveChange = ({
  existingStatus,
  requestedStatus,
  sensitiveChanged,
}: {
  existingStatus: VerificationStatus;
  requestedStatus?: VerificationStatus | undefined;
  sensitiveChanged: boolean;
}) => {
  if (!sensitiveChanged) return requestedStatus ?? existingStatus;
  return requestedStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";
};

const evidenceFieldsForStatus = (
  status: VerificationStatus,
  input: {
    verificationSource?: string | null | undefined;
    verificationEvidenceUrl?: string | null | undefined;
    verifiedBy?: string | null | undefined;
    verificationNotes?: string | null | undefined;
  },
  existing?: {
    verificationSource: string | null;
    verificationEvidenceUrl?: string | null;
    verifiedAt: Date | null;
    verifiedBy: string | null;
    verificationNotes: string | null;
  }
) => {
  if (status === "VERIFIED") {
    const verificationSource = input.verificationSource ?? existing?.verificationSource ?? null;
    const verificationEvidenceUrl =
      input.verificationEvidenceUrl ?? existing?.verificationEvidenceUrl ?? null;
    const verifiedBy = input.verifiedBy ?? existing?.verifiedBy ?? null;
    assertVerificationEvidence("Registry record", {
      verificationStatus: status,
      verificationSource,
      verificationEvidenceUrl,
      verifiedBy,
    });
    return {
      verificationSource,
      verificationEvidenceUrl,
      verifiedBy,
      verifiedAt: existing?.verifiedAt ?? new Date(),
      verificationNotes:
        input.verificationNotes !== undefined
          ? input.verificationNotes
          : existing?.verificationNotes ?? null,
    };
  }

  return {
    verificationSource: input.verificationSource ?? (status === "UNVERIFIED" ? null : existing?.verificationSource ?? null),
    verificationEvidenceUrl:
      input.verificationEvidenceUrl ?? (status === "UNVERIFIED" ? null : existing?.verificationEvidenceUrl ?? null),
    verifiedBy: input.verifiedBy ?? (status === "UNVERIFIED" ? null : existing?.verifiedBy ?? null),
    verifiedAt: status === "UNVERIFIED" ? null : existing?.verifiedAt ?? null,
    verificationNotes:
      input.verificationNotes !== undefined
        ? input.verificationNotes
        : existing?.verificationNotes ?? null,
  };
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
    metadataJson: {
      ...(metadataJson ?? {}),
      requestId: getCurrentRequestId()
    }
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
    chainId?: number | undefined;
    symbol: string;
    name: string;
    address?: string | null | undefined;
    decimals: number;
    riskLevel?: RiskLevel | undefined;
    enabled?: boolean | undefined;
    maxTradeUsd?: string | number | null | undefined;
    verificationStatus?: VerificationStatus | undefined;
    verificationSource?: string | null | undefined;
    verificationEvidenceUrl?: string | null | undefined;
    verifiedBy?: string | null | undefined;
    verificationNotes?: string | null | undefined;
  }) {
    const enabled = input.enabled === true;
    const riskLevel = input.riskLevel ?? "MEDIUM";
    const maxTradeUsd = toNumericString(input.maxTradeUsd);
    const verificationStatus = input.verificationStatus ?? "UNVERIFIED";
    const address = input.address ?? null;
    const verificationFields = evidenceFieldsForStatus(verificationStatus, input);

    assertHighRiskTokenPolicy({ enabled, riskLevel, maxTradeUsd });
    assertCanEnableVerificationStatus("Token", enabled, verificationStatus);

    const token = await getOne(
      await db
        .insert(tokens)
        .values({
          chainId: input.chainId ?? BASE_CHAIN_ID,
          symbol: input.symbol.trim(),
          name: input.name.trim(),
          address,
          checksumAddress: checksumOrNull(address),
          decimals: input.decimals,
          riskLevel,
          maxTradeUsd,
          enabled,
          verificationStatus,
          ...verificationFields
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
    const address =
      "address" in input ? input.address ?? null : existing.address;
    const sensitiveChanged =
      ("address" in input && input.address !== existing.address) ||
      ("decimals" in input && input.decimals !== existing.decimals);
    const verificationStatus = resetVerificationOnSensitiveChange({
      existingStatus: existing.verificationStatus,
      requestedStatus: input.verificationStatus as VerificationStatus | undefined,
      sensitiveChanged,
    });
    const verificationFields = evidenceFieldsForStatus(
      verificationStatus,
      input as Parameters<typeof evidenceFieldsForStatus>[1],
      sensitiveChanged ? undefined : existing
    );

    assertHighRiskTokenPolicy({ enabled, riskLevel, maxTradeUsd });
    assertCanEnableVerificationStatus("Token", enabled, verificationStatus);

    const token = await getOne(
      await db
        .update(tokens)
        .set({
          ...input,
          address,
          checksumAddress: checksumOrNull(address),
          maxTradeUsd,
          verificationStatus,
          ...verificationFields,
          updatedAt: new Date()
        })
        .where(eq(tokens.id, id))
        .returning(),
      "Token"
    );

    await audit(db, "token.update", "token", token.id, {
      enabled: token.enabled,
      riskLevel: token.riskLevel,
      verificationStatus: token.verificationStatus
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
    const existing = await getOne(
      await db.select().from(routers).where(eq(routers.id, id)),
      "Router"
    );
    const enabled = input.enabled ?? existing.enabled;
    const address =
      "address" in input ? input.address ?? null : existing.address;
    const sensitiveChanged =
      ("address" in input && input.address !== existing.address) ||
      ("spenderAddress" in input && input.spenderAddress !== existing.spenderAddress) ||
      ("txTargetAddress" in input && input.txTargetAddress !== existing.txTargetAddress) ||
      ("allowanceTargetAddress" in input &&
        input.allowanceTargetAddress !== existing.allowanceTargetAddress) ||
      ("functionSelectorAllowlist" in input &&
        JSON.stringify(input.functionSelectorAllowlist ?? null) !==
          JSON.stringify(existing.functionSelectorAllowlist ?? null));
    const verificationStatus = resetVerificationOnSensitiveChange({
      existingStatus: existing.verificationStatus,
      requestedStatus: input.verificationStatus as VerificationStatus | undefined,
      sensitiveChanged,
    });
    const verificationFields = evidenceFieldsForStatus(
      verificationStatus,
      input as Parameters<typeof evidenceFieldsForStatus>[1],
      sensitiveChanged ? undefined : existing
    );
    assertCanEnableVerificationStatus("Router", enabled, verificationStatus);

    const router = await getOne(
      await db
        .update(routers)
        .set({
          ...input,
          address,
          checksumAddress: checksumOrNull(address),
          spenderAddress:
            "spenderAddress" in input
              ? input.spenderAddress ?? null
              : existing.spenderAddress,
          txTargetAddress:
            "txTargetAddress" in input
              ? input.txTargetAddress ?? null
              : existing.txTargetAddress,
          allowanceTargetAddress:
            "allowanceTargetAddress" in input
              ? input.allowanceTargetAddress ?? null
              : existing.allowanceTargetAddress,
          verificationStatus,
          ...verificationFields,
        })
        .where(eq(routers.id, id))
        .returning(),
      "Router"
    );
    await audit(db, "router.update", "router", router.id, {
      enabled: router.enabled,
      verificationStatus: router.verificationStatus
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
    chainId?: number | undefined;
    tokenInId: string;
    tokenOutId: string;
    enabled?: boolean | undefined;
    maxTradeUsd?: string | number | null | undefined;
    maxSlippageBps?: string | number | null | undefined;
    maxPriceImpactBps?: string | number | null | undefined;
    preferredRouter?: string | null | undefined;
    fallbackRouter?: string | null | undefined;
    verificationStatus?: VerificationStatus | undefined;
    verificationSource?: string | null | undefined;
    verificationEvidenceUrl?: string | null | undefined;
    verifiedBy?: string | null | undefined;
    verificationNotes?: string | null | undefined;
  }) {
    const enabled = input.enabled === true;
    const maxTradeUsd = toNumericString(input.maxTradeUsd);
    const maxSlippageBps =
      toOptionalInteger(input.maxSlippageBps) ?? defaultMaxSlippageBps;
    const verificationStatus = input.verificationStatus ?? "UNVERIFIED";
    const verificationFields = evidenceFieldsForStatus(verificationStatus, input);
    assertCanEnableVerificationStatus("Pair", enabled, verificationStatus);

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
          fallbackRouter: input.fallbackRouter ?? null,
          verificationStatus,
          ...verificationFields
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
    const sensitiveChanged =
      ("tokenInId" in input && input.tokenInId !== existing.tokenInId) ||
      ("tokenOutId" in input && input.tokenOutId !== existing.tokenOutId) ||
      ("preferredRouter" in input && input.preferredRouter !== existing.preferredRouter) ||
      ("fallbackRouter" in input && input.fallbackRouter !== existing.fallbackRouter);
    const verificationStatus = resetVerificationOnSensitiveChange({
      existingStatus: existing.verificationStatus,
      requestedStatus: input.verificationStatus as VerificationStatus | undefined,
      sensitiveChanged,
    });
    const verificationFields = evidenceFieldsForStatus(
      verificationStatus,
      input as Parameters<typeof evidenceFieldsForStatus>[1],
      sensitiveChanged ? undefined : existing
    );
    assertCanEnableVerificationStatus("Pair", enabled, verificationStatus);

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
          verificationStatus,
          ...verificationFields,
          updatedAt: new Date()
        })
        .where(eq(pairs.id, id))
        .returning(),
      "Pair"
    );

    await audit(db, "pair.update", "pair", pair.id, {
      enabled: pair.enabled,
      verificationStatus: pair.verificationStatus
    });
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
