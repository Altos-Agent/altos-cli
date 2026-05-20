import { and, eq, inArray } from "drizzle-orm";
import { BASE_CHAIN_ID, PRODUCT_NAME } from "@base-orchestrator/shared";
import type { DbClient } from "./client.js";
import {
  dailyWalletStats,
  localSettings,
  pairs,
  routers,
  telegramSettings,
  tokens,
  transactions,
  walletPairRules,
  wallets,
  walletSchedules,
} from "./schema.js";

const localSettingsId = "00000000-0000-4000-8000-000000000001";
const telegramSettingsId = "00000000-0000-4000-8000-000000000002";

export const demoEncryptedPrivateKeyPlaceholder = "DEMO_MODE_NO_PRIVATE_KEY";

export const demoWalletIds = [
  "00000000-0000-4000-8000-00000000d001",
  "00000000-0000-4000-8000-00000000d002",
] as const;

const demoTokenIds = {
  usdc: "00000000-0000-4000-8000-00000000d101",
  weth: "00000000-0000-4000-8000-00000000d102",
  dai: "00000000-0000-4000-8000-00000000d103",
} as const;

const demoRouterId = "00000000-0000-4000-8000-00000000d201";

const demoPairIds = [
  "00000000-0000-4000-8000-00000000d301",
  "00000000-0000-4000-8000-00000000d302",
] as const;

const demoTransactionIds = [
  "00000000-0000-4000-8000-00000000d501",
  "00000000-0000-4000-8000-00000000d502",
  "00000000-0000-4000-8000-00000000d503",
  "00000000-0000-4000-8000-00000000d504",
] as const;

const demoTxHashes = [
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd0001",
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd0002",
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd0003",
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd0004",
] as const;

const demoBasescanLink = (txHash: string) =>
  `https://basescan.org/tx/${txHash}?demo=true`;

const upsertById = async (
  db: DbClient,
  table: Parameters<DbClient["insert"]>[0] & { id?: unknown },
  row: Record<string, unknown>,
  set: Record<string, unknown>,
) => {
  await db
    .insert(table)
    .values(row)
    .onConflictDoUpdate({
      target: table.id as never,
      set,
    });
};

export const seedDemoData = async (db: DbClient) => {
  const now = new Date();

  await upsertById(
    db,
    localSettings,
    {
      id: localSettingsId,
      appName: PRODUCT_NAME,
      dryRunDefault: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      appName: PRODUCT_NAME,
      dryRunDefault: true,
      updatedAt: now,
    },
  );

  await upsertById(
    db,
    telegramSettings,
    {
      id: telegramSettingsId,
      enabled: false,
      encryptedBotToken: null,
      chatId: null,
      notifyOnSubmitted: true,
      notifyOnConfirmed: true,
      notifyOnFailed: true,
      notifyOnRejected: true,
      notifyOnDryRun: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      enabled: false,
      encryptedBotToken: null,
      chatId: null,
      notifyOnSubmitted: true,
      notifyOnConfirmed: true,
      notifyOnFailed: true,
      notifyOnRejected: true,
      notifyOnDryRun: true,
      updatedAt: now,
    },
  );

  const demoTokens = [
    {
      id: demoTokenIds.usdc,
      chainId: BASE_CHAIN_ID,
      symbol: "USDC",
      name: "Demo USD Coin",
      address: "0x0000000000000000000000000000000000000101",
      checksumAddress: "0x0000000000000000000000000000000000000101",
      decimals: 6,
      riskLevel: "LOW" as const,
      maxTradeUsd: "100",
      enabled: true,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder address, not a real Base mainnet contract",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoTokenIds.weth,
      chainId: BASE_CHAIN_ID,
      symbol: "WETH",
      name: "Demo Wrapped Ether",
      address: "0x0000000000000000000000000000000000000102",
      checksumAddress: "0x0000000000000000000000000000000000000102",
      decimals: 18,
      riskLevel: "LOW" as const,
      maxTradeUsd: "100",
      enabled: true,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder address, not a real Base mainnet contract",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoTokenIds.dai,
      chainId: BASE_CHAIN_ID,
      symbol: "DAI",
      name: "Demo Dai",
      address: "0x0000000000000000000000000000000000000103",
      checksumAddress: "0x0000000000000000000000000000000000000103",
      decimals: 18,
      riskLevel: "MEDIUM" as const,
      maxTradeUsd: "75",
      enabled: true,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder address, not a real Base mainnet contract",
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const token of demoTokens) {
    await upsertById(db, tokens, token, {
      name: token.name,
      address: token.address,
      checksumAddress: token.checksumAddress,
      decimals: token.decimals,
      riskLevel: token.riskLevel,
      maxTradeUsd: token.maxTradeUsd,
      enabled: true,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: token.verificationNotes,
      updatedAt: now,
    });
  }

  await upsertById(
    db,
    routers,
    {
      id: demoRouterId,
      chainId: BASE_CHAIN_ID,
      name: "Demo Router",
      address: "0x0000000000000000000000000000000000000201",
      checksumAddress: "0x0000000000000000000000000000000000000201",
      spenderAddress: "0x0000000000000000000000000000000000000201",
      txTargetAddress: "0x0000000000000000000000000000000000000201",
      allowanceTargetAddress: "0x0000000000000000000000000000000000000201",
      enabled: true,
      riskLevel: "LOW" as const,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder router, not a real Base mainnet contract",
      notes: "Demo-only router. Do not use for live trading.",
    },
    {
      address: "0x0000000000000000000000000000000000000201",
      checksumAddress: "0x0000000000000000000000000000000000000201",
      spenderAddress: "0x0000000000000000000000000000000000000201",
      txTargetAddress: "0x0000000000000000000000000000000000000201",
      allowanceTargetAddress: "0x0000000000000000000000000000000000000201",
      enabled: true,
      riskLevel: "LOW" as const,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder router, not a real Base mainnet contract",
      notes: "Demo-only router. Do not use for live trading.",
    },
  );

  const demoWallets = [
    {
      id: demoWalletIds[0],
      name: "Demo Treasury",
      address: "0x0000000000000000000000000000000000000d01",
      encryptedPrivateKey: demoEncryptedPrivateKeyPlaceholder,
      encryptionVersion: 0,
      status: "ACTIVE" as const,
      maxTradeUsd: "50",
      maxDailyTrades: 5,
      maxDailyLossUsd: "25",
      maxGasUsd: "5",
      notes:
        "DEMO MODE: UI-only wallet with no private key. Live execution is blocked.",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoWalletIds[1],
      name: "Demo Strategy Wallet",
      address: "0x0000000000000000000000000000000000000d02",
      encryptedPrivateKey: demoEncryptedPrivateKeyPlaceholder,
      encryptionVersion: 0,
      status: "ACTIVE" as const,
      maxTradeUsd: "35",
      maxDailyTrades: 3,
      maxDailyLossUsd: "15",
      maxGasUsd: "4",
      notes:
        "DEMO MODE: UI-only wallet with no private key. Live execution is blocked.",
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const wallet of demoWallets) {
    await upsertById(db, wallets, wallet, {
      name: wallet.name,
      address: wallet.address,
      encryptedPrivateKey: demoEncryptedPrivateKeyPlaceholder,
      encryptionVersion: 0,
      status: "ACTIVE" as const,
      maxTradeUsd: wallet.maxTradeUsd,
      maxDailyTrades: wallet.maxDailyTrades,
      maxDailyLossUsd: wallet.maxDailyLossUsd,
      maxGasUsd: wallet.maxGasUsd,
      notes: wallet.notes,
      updatedAt: now,
    });
  }

  const demoPairs = [
    {
      id: demoPairIds[0],
      chainId: BASE_CHAIN_ID,
      tokenInId: demoTokenIds.usdc,
      tokenOutId: demoTokenIds.weth,
      enabled: true,
      maxTradeUsd: "50",
      maxSlippageBps: 50,
      maxPriceImpactBps: 100,
      preferredRouter: "Demo Router",
      fallbackRouter: null,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder pair, not live-ready",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: demoPairIds[1],
      chainId: BASE_CHAIN_ID,
      tokenInId: demoTokenIds.weth,
      tokenOutId: demoTokenIds.dai,
      enabled: true,
      maxTradeUsd: "35",
      maxSlippageBps: 50,
      maxPriceImpactBps: 100,
      preferredRouter: "Demo Router",
      fallbackRouter: null,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder pair, not live-ready",
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const pair of demoPairs) {
    await upsertById(db, pairs, pair, {
      enabled: true,
      maxTradeUsd: pair.maxTradeUsd,
      maxSlippageBps: pair.maxSlippageBps,
      maxPriceImpactBps: pair.maxPriceImpactBps,
      preferredRouter: pair.preferredRouter,
      fallbackRouter: null,
      verificationStatus: "PLACEHOLDER" as const,
      verificationSource: "DEMO_SEED",
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: "DEMO MODE: placeholder pair, not live-ready",
      updatedAt: now,
    });
  }

  for (const walletId of demoWalletIds) {
    for (const pairId of demoPairIds) {
      await db
        .insert(walletPairRules)
        .values({
          walletId,
          pairId,
          enabled: true,
          maxTradeUsd: walletId === demoWalletIds[0] ? "50" : "35",
          maxDailyTrades: walletId === demoWalletIds[0] ? 5 : 3,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [walletPairRules.walletId, walletPairRules.pairId],
          set: {
            enabled: true,
            maxTradeUsd: walletId === demoWalletIds[0] ? "50" : "35",
            maxDailyTrades: walletId === demoWalletIds[0] ? 5 : 3,
            updatedAt: now,
          },
        });
    }
  }

  const demoTransactions = [
    {
      id: demoTransactionIds[0],
      walletId: demoWalletIds[0],
      pairId: demoPairIds[0],
      status: "DRY_RUN" as const,
      tokenIn: "USDC",
      tokenOut: "WETH",
      amountIn: "25000000",
      amountOut: "24750000",
      gasUsd: "2.50",
      errorMessage: null,
    },
    {
      id: demoTransactionIds[1],
      walletId: demoWalletIds[0],
      pairId: demoPairIds[1],
      status: "REJECTED" as const,
      tokenIn: "WETH",
      tokenOut: "DAI",
      amountIn: "1000000",
      amountOut: null,
      gasUsd: "2.80",
      errorMessage: "Demo rejection: wallet-pair limit would be exceeded",
    },
    {
      id: demoTransactionIds[2],
      walletId: demoWalletIds[1],
      pairId: demoPairIds[0],
      status: "CONFIRMED" as const,
      tokenIn: "USDC",
      tokenOut: "WETH",
      amountIn: "15000000",
      amountOut: "14850000",
      gasUsd: "1.95",
      errorMessage: null,
    },
    {
      id: demoTransactionIds[3],
      walletId: demoWalletIds[1],
      pairId: demoPairIds[1],
      status: "FAILED" as const,
      tokenIn: "WETH",
      tokenOut: "DAI",
      amountIn: "500000",
      amountOut: null,
      gasUsd: "3.10",
      errorMessage: "Demo failure: simulated reverted receipt",
    },
  ];

  for (const [index, transaction] of demoTransactions.entries()) {
    const txHash = demoTxHashes[index];
    if (!txHash) {
      throw new Error("Missing demo transaction hash");
    }

    await upsertById(
      db,
      transactions,
      {
        ...transaction,
        chainId: BASE_CHAIN_ID,
        txHash,
        action: "SWAP" as const,
        router: "Demo Router",
        gasUsed: "180000",
        feeNative: "0.0007",
        basescanUrl: demoBasescanLink(txHash),
        createdAt: now,
        updatedAt: now,
      },
      {
        status: transaction.status,
        txHash,
        tokenIn: transaction.tokenIn,
        tokenOut: transaction.tokenOut,
        amountIn: transaction.amountIn,
        amountOut: transaction.amountOut,
        gasUsd: transaction.gasUsd,
        errorMessage: transaction.errorMessage,
        basescanUrl: demoBasescanLink(txHash),
        updatedAt: now,
      },
    );
  }
};

export const resetDemoData = async (db: DbClient) => {
  await db
    .delete(walletSchedules)
    .where(inArray(walletSchedules.walletId, [...demoWalletIds]));
  await db
    .delete(dailyWalletStats)
    .where(inArray(dailyWalletStats.walletId, [...demoWalletIds]));
  await db
    .delete(walletPairRules)
    .where(inArray(walletPairRules.walletId, [...demoWalletIds]));
  await db
    .delete(transactions)
    .where(inArray(transactions.id, [...demoTransactionIds]));
  await db.delete(pairs).where(inArray(pairs.id, [...demoPairIds]));
  await db.delete(wallets).where(inArray(wallets.id, [...demoWalletIds]));
  await db
    .delete(routers)
    .where(and(eq(routers.id, demoRouterId), eq(routers.name, "Demo Router")));
  await db
    .delete(tokens)
    .where(inArray(tokens.id, Object.values(demoTokenIds)));

  await db
    .update(telegramSettings)
    .set({
      enabled: false,
      encryptedBotToken: null,
      chatId: null,
      updatedAt: new Date(),
    })
    .where(eq(telegramSettings.id, telegramSettingsId));
};
