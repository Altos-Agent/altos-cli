export interface SignerPolicyContext {
  wallet: {
    address: string;
    status: "ACTIVE" | "PAUSED" | "DISABLED";
    maxTradeUsd: string | null;
    maxGasUsd: string | null;
    maxDailyTrades: number | null;
    maxDailyLossUsd: string | null;
  };
  transaction: {
    to: string;
    value: string;
    data: string;
    gasLimit: string;
  };
  quote?: {
    sellToken: string;
    buyToken: string;
    sellAmountRaw: string;
    expectedReturnUsd: string;
  };
  routers: Array<{
    address: string;
    verificationStatus: "VERIFIED" | "UNVERIFIED";
  }>;
  emergencyPaused: boolean;
  aggregateRiskPassed: boolean;
}

export interface PolicyCheckResult {
  allowed: boolean;
  denied: boolean;
  reasons: string[];
}

const BASE_GAS_PRICE_GWEI = 0.01; // Approximate Base gas price in gwei
const ETH_USD_PRICE = 3000; // Approximate ETH/USD

const ALLOWED_FUNCTION_SELECTORS = [
  "0x095ea7b3", // approve(address,uint256)
  "0xa9059cbb", // transfer(address,uint256)
  "0x23b872dd", // transferFrom(address,address,uint256)
  "0xb6f9de95", // swapExactTokensForTokens (Uniswap V2)
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x38ed1739", // swapExactTokensForTokens (Uniswap V3)
  "0x5ae401dc", // multicall
  "0xac9650d8", // multicall (V3)
  "0xf305d719", // fundManagement (Balancer)
  "0x0c4e0b91", // joinPool (Balancer)
];

export class SignerPolicyEngine {
  private readonly allowedFunctionSelectors: string[];

  constructor(options?: { allowedFunctionSelectors?: string[] }) {
    this.allowedFunctionSelectors = options?.allowedFunctionSelectors ?? ALLOWED_FUNCTION_SELECTORS;
  }

  check(context: SignerPolicyContext): PolicyCheckResult {
    const reasons: string[] = [];

    // Rule 1: Wallet must be ACTIVE
    if (context.wallet.status !== "ACTIVE") {
      reasons.push(`Wallet status is ${context.wallet.status}, must be ACTIVE`);
    }

    // Rule 2: Emergency pause must be off
    if (context.emergencyPaused) {
      reasons.push("Emergency pause is active");
    }

    // Rule 3: tx.to must be a verified router
    if (context.routers.length > 0) {
      const txTo = context.transaction.to.toLowerCase();
      const validTargets = context.routers
        .filter(r => r.verificationStatus === "VERIFIED")
        .flatMap(r => [r.address.toLowerCase()]);

      if (validTargets.length > 0 && !validTargets.includes(txTo)) {
        reasons.push(`Transaction target ${context.transaction.to} is not a verified router`);
      }
    }

    // Rule 4: Function selector must be in allowlist
    const selector = context.transaction.data.length >= 10
      ? context.transaction.data.slice(0, 10)
      : "0x";

    if (!this.allowedFunctionSelectors.includes(selector)) {
      reasons.push(`Function selector ${selector} is not in the allowlist`);
    }

    // Rule 5: maxTradeUsd check
    if (
      context.wallet.maxTradeUsd !== null &&
      context.quote?.expectedReturnUsd !== undefined
    ) {
      const tradeUsd = parseFloat(context.quote.expectedReturnUsd);
      const maxTradeUsd = parseFloat(context.wallet.maxTradeUsd);
      if (!isNaN(tradeUsd) && !isNaN(maxTradeUsd) && tradeUsd > maxTradeUsd) {
        reasons.push(
          `Trade value ${context.quote.expectedReturnUsd} USD exceeds ` +
          `wallet maxTradeUsd ${context.wallet.maxTradeUsd}`
        );
      }
    }

    // Rule 6: maxGasUsd check
    if (context.wallet.maxGasUsd !== null) {
      const gasLimit = parseFloat(context.transaction.gasLimit);
      const estimatedGasUsd = (gasLimit * BASE_GAS_PRICE_GWEI * ETH_USD_PRICE) / 1e9;
      const maxGasUsd = parseFloat(context.wallet.maxGasUsd);
      if (!isNaN(estimatedGasUsd) && !isNaN(maxGasUsd) && estimatedGasUsd > maxGasUsd) {
        reasons.push(
          `Estimated gas cost ${estimatedGasUsd.toFixed(2)} USD exceeds ` +
          `wallet maxGasUsd ${context.wallet.maxGasUsd}`
        );
      }
    }

    // Rule 7: Aggregate risk must pass
    if (!context.aggregateRiskPassed) {
      reasons.push("Aggregate risk check did not pass");
    }

    return {
      allowed: reasons.length === 0,
      denied: reasons.length > 0,
      reasons,
    };
  }
}