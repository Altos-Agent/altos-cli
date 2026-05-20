# Token Router And Base Config Verification

Date: 2026-05-20

Scope: Base chain config, RPC/Basescan config, token registry, router/spender registry, verification state, placeholder/demo risks, live blockers, and operator verification steps.

Verdict/status: PARTIAL / OPERATOR_REQUIRED. Base chain constants are implemented, but live token/router data must be independently verified before any live use.

## Base Chain Config

- IMPLEMENTED: `BASE_CHAIN_ID=8453` in `packages/shared/src/index.ts`.
- IMPLEMENTED: Runtime config rejects other `BASE_CHAIN_ID` values.
- IMPLEMENTED: `BASE_NATIVE_SYMBOL=ETH`.
- IMPLEMENTED: Base mainnet viem chain config is used by signing clients.

## RPC Config

- IMPLEMENTED: `BASE_RPC_URL` default is `https://mainnet.base.org`.
- IMPLEMENTED: `apps/api/src/blockchain/baseClient.ts` centralizes public client.
- PARTIAL: Default public RPC is not sufficient for reliable live operations at scale.
- NOT_TESTED: RPC provider load/finality behavior was not tested in this audit.

## Basescan Config

- IMPLEMENTED: `BASESCAN_BASE_URL` default is `https://basescan.org`.
- IMPLEMENTED: Address and tx link builders have tests.
- IMPLEMENTED: Demo Basescan URLs include `demo=true` and UI displays a demo badge.

## Token Registry

- IMPLEMENTED: `tokens` table has chain id, symbol, name, address, decimals, risk level, max trade, enabled, verification status/source/verified metadata.
- IMPLEMENTED: Seed data intentionally uses placeholders/unverified data.
- IMPLEMENTED: Token whitelist check rejects disabled, placeholder, blocked, and unverified tokens.
- PARTIAL: Management update can set token fields, but operator verification workflow is not cryptographically enforced.

## Router/Spender Registry

- IMPLEMENTED: `routers` table has chain id, name, address, enabled, risk level, verification fields, notes.
- IMPLEMENTED: Router whitelist checks enabled and verified routers for trade routing and allowance target validation.
- PARTIAL: Approval service currently validates router address and enabled state; make `verificationStatus=VERIFIED` explicit there as well.

## Verification Status

- IMPLEMENTED: Verification enum values are `UNVERIFIED`, `VERIFIED`, `PLACEHOLDER`, `BLOCKED`.
- IMPLEMENTED: `canUseInLiveMode` returns true only for enabled and `VERIFIED`.
- IMPLEMENTED: Demo seed labels tokens as `PLACEHOLDER`.

## Placeholder/Unverified Addresses

- HIGH / OPERATOR_REQUIRED: Seeded tokens and routers are not live-ready.
- HIGH / OPERATOR_REQUIRED: Demo tokens use placeholder addresses and should not be confused with Base mainnet contracts.
- HIGH / OPERATOR_REQUIRED: Enabling a row is not enough; address, decimals, router, spender, quote target, and function semantics must be verified externally.

## Seed/Demo Data Risks

- IMPLEMENTED: Demo wallets use `DEMO_MODE_NO_PRIVATE_KEY`.
- IMPLEMENTED: Demo mode blocks live execution.
- RISK: Demo data can make the UI look operational even though contracts are placeholders.
- MITIGATION: UI demo badges and docs warn that demo links are not real transactions.

## Live-Readiness Blockers

- HIGH: No verified live token/router set was produced by this audit.
- HIGH: No 0x allowance target verification was performed.
- HIGH: No router calldata selector policy is configured.
- HIGH: No live quote was compared against independent source data.

## Required Operator Verification Steps

1. Record Base mainnet token address, decimals, symbol, and source.
2. Verify token contract on Basescan and compare decimals on-chain.
3. Record router contract address and allowance target returned by quote provider.
4. Verify router/spender code, name, upgrade/admin posture, and official docs.
5. Mark token/router `VERIFIED` with `verifiedBy`, `verifiedAt`, source, and notes.
6. Enable only exact pair and wallet-pair rule needed for the tiny test.
7. Confirm quote `txTo`, `routerAddress`, `spenderAddress`, and `allowanceTarget` all match verified router/spender records.
8. Keep `ALLOW_UNLIMITED_APPROVAL=false`, `AUTO_APPROVE=false`.

## Acceptance Criteria

- Every enabled live token has verified address and decimals.
- Every enabled live router/spender has verified Base address and source.
- Quote provider target and allowance target are equal to enabled verified records.
- A dry-run using the live quote provider passes all whitelist checks before any live transaction is attempted.
