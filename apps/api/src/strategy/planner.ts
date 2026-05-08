import { BASE_CHAIN_ID, DEFAULT_DRY_RUN } from "@base-orchestrator/shared";
import { buildBasescanAddressLink } from "../blockchain/basescan.js";
import type {
  DailyWalletStats,
  Pair,
  Router,
  Token,
  Wallet,
  WalletPairRule
} from "../db/schema.js";
import type { NormalizedQuote } from "../quote/types.js";
import { checkGasLimit, estimateDryRunGas } from "../risk/gas.js";
import { checkTradeLimits } from "../risk/limits.js";
import {
  checkAllowanceTarget,
  resolveRouter
} from "../risk/routerWhitelist.js";
import {
  checkSlippage,
  estimatedDryRunSlippageBps
} from "../risk/slippage.js";
import { checkTokenWhitelist } from "../risk/tokenWhitelist.js";
import { isWalletActive, isWalletPairRuleEnabled } from "./walletProfiles.js";

export interface DryRunPlanInput {
  walletId: string;
  pairId: string;
  amountIn: string | number;
  preferredRouter?: string | null | undefined;
  mode: "DRY_RUN_ONLY";
}

export interface DryRunPlanContext {
  wallet: Wallet;
  pair: Pair;
  walletPairRule: WalletPairRule | null;
  tokenIn: Token | null;
  tokenOut: Token | null;
  routers: Router[];
  dailyWalletStats: DailyWalletStats | null;
  dryRunEnabled?: boolean;
  quote?: NormalizedQuote | null;
}

export interface DryRunPlanResult {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
  estimatedRoute: {
    chainId: typeof BASE_CHAIN_ID;
    router: string | null;
    tokenIn: string | null;
    tokenOut: string | null;
    amountIn: string;
  };
  estimatedGas: ReturnType<typeof estimateDryRunGas>;
  estimatedCost: {
    amountUsd: string;
    estimatedGasUsd: string;
    estimatedTotalUsd: string;
  };
  basescanLinks: {
    wallet: string;
    tokenIn: string | null;
    tokenOut: string | null;
  };
  quote: NormalizedQuote | null;
  txHash: null;
}

const globalDryRunEnabled = () => process.env.DRY_RUN !== "false";

const toAmountUsd = (amountIn: string | number) => Number(amountIn);

const formatUsd = (value: number) => value.toFixed(2);

export const evaluateTradeRisk = (
  input: Pick<DryRunPlanInput, "amountIn" | "preferredRouter">,
  context: DryRunPlanContext
): {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
  estimatedGas: ReturnType<typeof estimateDryRunGas>;
  router: string | null;
} => {
  const reasons: string[] = [];
  const amountUsd = toAmountUsd(input.amountIn);
  const estimatedGas = context.quote?.estimatedGas ?? estimateDryRunGas();
  const routerResolution = resolveRouter({
    requestedRouter: context.quote?.routerName ?? input.preferredRouter,
    preferredRouter: context.pair.preferredRouter,
    fallbackRouter: context.pair.fallbackRouter,
    routers: context.routers
  });

  if (!isWalletActive(context.wallet)) {
    reasons.push("Wallet status must be ACTIVE");
  }
  if (!context.pair.enabled) {
    reasons.push("Pair is disabled");
  }
  if (!isWalletPairRuleEnabled(context.walletPairRule)) {
    reasons.push("Wallet pair rule is disabled");
  }

  reasons.push(
    ...checkTokenWhitelist({
      tokenIn: context.tokenIn,
      tokenOut: context.tokenOut
    })
  );
  reasons.push(...routerResolution.reasons);
  reasons.push(
    ...checkAllowanceTarget({
      allowanceTarget: context.quote?.allowanceTarget ?? null,
      routers: context.routers
    })
  );
  reasons.push(
    ...checkTradeLimits({
      amountUsd,
      walletMaxTradeUsd: context.wallet.maxTradeUsd,
      pairMaxTradeUsd: context.pair.maxTradeUsd,
      walletPairMaxTradeUsd: context.walletPairRule?.maxTradeUsd ?? null,
      walletMaxDailyTrades: context.wallet.maxDailyTrades,
      dailyTxCount: context.dailyWalletStats?.txCount ?? 0,
      walletMaxDailyLossUsd: context.wallet.maxDailyLossUsd,
      dailyEstimatedLossUsd: context.dailyWalletStats?.estimatedLossUsd ?? null
    })
  );
  reasons.push(
    ...checkGasLimit({
      estimatedGasUsd: estimatedGas.gasUsd,
      walletMaxGasUsd: context.wallet.maxGasUsd
    })
  );
  reasons.push(
    ...checkSlippage({
      requestedSlippageBps: estimatedDryRunSlippageBps,
      maxSlippageBps: context.pair.maxSlippageBps
    })
  );

  const accepted = reasons.length === 0;

  return {
    accepted,
    rejected: !accepted,
    reasons,
    estimatedGas,
    router: routerResolution.routerName
  };
};

export const planDryRunTrade = (
  input: DryRunPlanInput,
  context: DryRunPlanContext
): DryRunPlanResult => {
  const dryRunReasons: string[] = [];
  if (input.mode !== "DRY_RUN_ONLY") {
    dryRunReasons.push("Only DRY_RUN_ONLY mode is supported");
  }
  if (!(context.dryRunEnabled ?? DEFAULT_DRY_RUN) || !globalDryRunEnabled()) {
    dryRunReasons.push("Global DRY_RUN mode is disabled");
  }

  const risk = evaluateTradeRisk(input, context);
  const reasons = [...dryRunReasons, ...risk.reasons];
  const accepted = reasons.length === 0;
  const amountUsd = toAmountUsd(input.amountIn);
  const estimatedGas = risk.estimatedGas;
  const estimatedTotalUsd = Number.isFinite(amountUsd)
    ? amountUsd + Number(estimatedGas.gasUsd)
    : Number(estimatedGas.gasUsd);

  return {
    accepted,
    rejected: !accepted,
    reasons,
    estimatedRoute: {
      chainId: BASE_CHAIN_ID,
      router: risk.router,
      tokenIn: context.quote?.sellToken ?? context.tokenIn?.symbol ?? null,
      tokenOut: context.quote?.buyToken ?? context.tokenOut?.symbol ?? null,
      amountIn: context.quote?.sellAmount ?? String(input.amountIn)
    },
    estimatedGas,
    estimatedCost: {
      amountUsd: Number.isFinite(amountUsd) ? formatUsd(amountUsd) : "0.00",
      estimatedGasUsd: estimatedGas.gasUsd,
      estimatedTotalUsd: formatUsd(estimatedTotalUsd)
    },
    basescanLinks: {
      wallet: buildBasescanAddressLink(context.wallet.address),
      tokenIn: context.tokenIn?.address
        ? buildBasescanAddressLink(context.tokenIn.address)
        : null,
      tokenOut: context.tokenOut?.address
        ? buildBasescanAddressLink(context.tokenOut.address)
        : null
    },
    quote: context.quote ?? null,
    txHash: null
  };
};
