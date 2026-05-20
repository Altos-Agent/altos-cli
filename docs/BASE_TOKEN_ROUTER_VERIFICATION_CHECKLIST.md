# Base Token And Router Verification Checklist

Date: 2026-05-20

Use this checklist before marking any token, pair, router, spender, transaction target, or allowance target as `VERIFIED`.

## Token Checklist

- Confirm the contract is on Base Mainnet, chain id `8453`.
- Confirm the contract address on Basescan.
- Confirm the symbol and decimals from the contract.
- Confirm the official source, such as project docs or verified deployer announcement.
- Confirm the record is not seed/demo/placeholder data.
- Save the Basescan token URL in `verificationEvidenceUrl`.
- Save source notes in `verificationSource` and `verificationNotes`.
- Mark `VERIFIED` only after evidence is saved.

## Router And Spender Checklist

- Confirm the router contract is on Base Mainnet, chain id `8453`.
- Confirm `txTargetAddress` from the quote provider is expected for swaps.
- Confirm `allowanceTargetAddress` / spender from the quote provider is expected for ERC20 approvals.
- Confirm the router and allowance target are not placeholder, zero, or demo addresses.
- Confirm optional function selectors if configured.
- Save the Basescan address URL and provider docs URL where available.
- Mark `VERIFIED` only after router, tx target, and allowance target evidence exists.

## Pair Checklist

- Confirm both tokens are `VERIFIED`.
- Confirm the pair direction is intentional.
- Confirm preferred and fallback routers are `VERIFIED`.
- Confirm max trade, slippage, and price impact limits.
- Save operator notes and evidence URL.
- Mark the pair `VERIFIED` only after token/router checks are complete.

## Stop Conditions

- Do not mark records `VERIFIED` based only on UI labels or token symbols.
- Do not live-use `UNVERIFIED`, `PLACEHOLDER`, or `BLOCKED` records.
- Do not live-use quote targets that differ from the verified router target.
- Do not enable live scheduler while verified registry gates are incomplete or failing tests.
