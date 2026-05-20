import {
  BASE_MAINNET,
  DEFAULT_DRY_RUN,
  PRODUCT_NAME
} from "@base-orchestrator/shared";
import { closeDb, db } from "./client.js";
import { localSettings, routers, telegramSettings, tokens } from "./schema.js";

const localSettingsId = "00000000-0000-4000-8000-000000000001";
const telegramSettingsId = "00000000-0000-4000-8000-000000000002";
const unverifiedAddressNote =
  "TODO: verify Base Mainnet contract address before enabling live mode.";

// TODO: set verified Base Mainnet token addresses before enabling token records.
const defaultTokens = [
  { symbol: "USDC", name: "USD Coin", decimals: 6, riskLevel: "LOW" },
  { symbol: "WETH", name: "Wrapped Ether", decimals: 18, riskLevel: "LOW" },
  {
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    riskLevel: "MEDIUM"
  },
  {
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
    decimals: 18,
    riskLevel: "MEDIUM"
  },
  { symbol: "EURC", name: "Euro Coin", decimals: 6, riskLevel: "MEDIUM" },
  { symbol: "DAI", name: "Dai Stablecoin", decimals: 18, riskLevel: "MEDIUM" },
  { symbol: "AERO", name: "Aerodrome Finance", decimals: 18, riskLevel: "HIGH" }
] as const;

const defaultRouters = [
  { name: "0x", riskLevel: "MEDIUM" },
  { name: "Uniswap Universal Router", riskLevel: "MEDIUM" },
  { name: "Aerodrome Router", riskLevel: "MEDIUM" }
] as const;

const seed = async () => {
  await db
    .insert(localSettings)
    .values({
      id: localSettingsId,
      appName: PRODUCT_NAME,
      dryRunDefault: DEFAULT_DRY_RUN
    })
    .onConflictDoUpdate({
      target: localSettings.id,
      set: {
        appName: PRODUCT_NAME,
        dryRunDefault: DEFAULT_DRY_RUN
      }
    });

  await db
    .insert(telegramSettings)
    .values({
      id: telegramSettingsId,
      enabled: false
    })
    .onConflictDoUpdate({
      target: telegramSettings.id,
      set: {
        enabled: false,
        notifyOnDryRun: true
      }
    });

  for (const token of defaultTokens) {
    await db
      .insert(tokens)
      .values({
        chainId: BASE_MAINNET.chainId,
        symbol: token.symbol,
        name: token.name,
        address: null,
        checksumAddress: null,
        decimals: token.decimals,
        riskLevel: token.riskLevel,
        enabled: false,
        verificationStatus: "PLACEHOLDER",
        verificationSource: "SEED_PLACEHOLDER",
        verificationNotes: unverifiedAddressNote
      })
      .onConflictDoUpdate({
        target: [tokens.chainId, tokens.symbol],
        set: {
          name: token.name,
          decimals: token.decimals,
          riskLevel: token.riskLevel,
          enabled: false,
          verificationStatus: "PLACEHOLDER",
          verificationSource: "SEED_PLACEHOLDER",
          verificationNotes: unverifiedAddressNote
        }
      });
  }

  for (const router of defaultRouters) {
    await db
      .insert(routers)
      .values({
        chainId: BASE_MAINNET.chainId,
        name: router.name,
        address: null,
        checksumAddress: null,
        enabled: false,
        riskLevel: router.riskLevel,
        verificationStatus: "PLACEHOLDER",
        verificationSource: "SEED_PLACEHOLDER",
        notes: unverifiedAddressNote
      })
      .onConflictDoUpdate({
        target: [routers.chainId, routers.name],
        set: {
          enabled: false,
          riskLevel: router.riskLevel,
          verificationStatus: "PLACEHOLDER",
          verificationSource: "SEED_PLACEHOLDER",
          notes: unverifiedAddressNote
        }
      });
  }
};

try {
  await seed();
  console.log("Seeded Base token and router placeholders.");
} finally {
  await closeDb();
}
