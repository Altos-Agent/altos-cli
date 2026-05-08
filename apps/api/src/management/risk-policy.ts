export const defaultMaxSlippageBps = 50;

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export class RiskPolicyError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "RiskPolicyError";
  }
}

const hasPositiveLimit = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0;
};

export const assertHighRiskTokenPolicy = ({
  enabled,
  riskLevel,
  maxTradeUsd
}: {
  enabled: boolean;
  riskLevel: RiskLevel;
  maxTradeUsd: string | number | null | undefined;
}) => {
  if (enabled && riskLevel === "HIGH" && !hasPositiveLimit(maxTradeUsd)) {
    throw new RiskPolicyError(
      "High-risk tokens require a max trade size before enabling"
    );
  }
};

export const assertPairEnablePolicy = ({
  tokenInEnabled,
  tokenOutEnabled,
  tokenInRiskLevel,
  tokenOutRiskLevel,
  maxTradeUsd,
  preferredRouterEnabled,
  fallbackRouterEnabled
}: {
  tokenInEnabled: boolean;
  tokenOutEnabled: boolean;
  tokenInRiskLevel: RiskLevel;
  tokenOutRiskLevel: RiskLevel;
  maxTradeUsd: string | number | null | undefined;
  preferredRouterEnabled: boolean;
  fallbackRouterEnabled: boolean;
}) => {
  if (!tokenInEnabled || !tokenOutEnabled) {
    throw new RiskPolicyError("Pairs may only use enabled tokens");
  }

  if (
    (tokenInRiskLevel === "HIGH" || tokenOutRiskLevel === "HIGH") &&
    !hasPositiveLimit(maxTradeUsd)
  ) {
    throw new RiskPolicyError(
      "Pairs containing high-risk tokens require a max trade size"
    );
  }

  if (!preferredRouterEnabled || !fallbackRouterEnabled) {
    throw new RiskPolicyError("Pairs may only use enabled routers");
  }
};

export const assertWalletPairRulePolicy = ({
  enabled,
  pairEnabled,
  maxTradeUsd
}: {
  enabled: boolean;
  pairEnabled: boolean;
  maxTradeUsd: string | number | null | undefined;
}) => {
  if (enabled && !pairEnabled) {
    throw new RiskPolicyError("A wallet may only trade enabled pairs");
  }

  if (enabled && !hasPositiveLimit(maxTradeUsd)) {
    throw new RiskPolicyError(
      "Enabled wallet pair rules require a wallet-specific max trade size"
    );
  }
};
