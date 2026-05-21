# Signer Policy Engine

## Overview

The signer policy engine evaluates every transaction against configurable rules BEFORE the custody provider signs. If any rule fails, the transaction is denied and a `SignerPolicyError` is thrown.

## Policy Rules

| Rule | Description | Default |
|------|-------------|---------|
| Wallet Status | Wallet must be ACTIVE | Enabled |
| Emergency Pause | Emergency pause must be OFF | Enabled |
| Router Verification | `tx.to` must be a VERIFIED router | Enabled |
| Function Selector | Must be in allowlist | Enabled |
| Max Trade USD | Trade value must not exceed `wallet.maxTradeUsd` | Enabled |
| Max Gas USD | Estimated gas cost must not exceed `wallet.maxGasUsd` | Enabled |
| Aggregate Risk | `aggregateRiskPassed` must be true | Enabled |

## Function Selector Allowlist

Default allowed selectors:
- `0x095ea7b3` — approve(address,uint256)
- `0xa9059cbb` — transfer(address,uint256)
- `0x23b872dd` — transferFrom(address,address,uint256)
- `0xb6f9de95` — swapExactTokensForTokens (Uniswap V2)
- `0x7ff36ab5` — swapExactETHForTokens
- `0x18cbafe5` — swapExactTokensForETH
- `0x38ed1739` — swapExactTokensForTokens (Uniswap V3)
- `0x5ae401dc` — multicall
- `0xac9650d8` — multicall (V3)

## Configuration

Policy context is passed explicitly from the caller:

```typescript
const context: SignerPolicyContext = {
  wallet: { address, status, maxTradeUsd, maxGasUsd, ... },
  transaction: { to, value, data, gasLimit },
  quote: { sellToken, buyToken, sellAmountRaw, expectedReturnUsd },
  routers: [{ address, verificationStatus }],
  emergencyPaused: false,
  aggregateRiskPassed: true,
};

const result = policyEngine.check(context);
if (result.denied) {
  throw new SignerPolicyError(result.reasons.join("; "), result.reasons);
}
```

## Gas Estimation

Gas cost in USD is estimated as:
```
estimatedGasUsd = (gasLimit * BASE_GAS_PRICE_GWEI * ETH_USD_PRICE) / 1e9
```

Where `BASE_GAS_PRICE_GWEI = 0.01` (approximate Base gas price) and `ETH_USD_PRICE = 3000` (configurable).

## Custom Function Selectors

Pass custom allowlist to `SignerPolicyEngine`:

```typescript
const engine = new SignerPolicyEngine({
  allowedFunctionSelectors: ["0x095ea7b3", "0xa9059cbb", "0xcustomselector"],
});
```