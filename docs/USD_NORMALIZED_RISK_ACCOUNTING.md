# USD-Normalized Risk Accounting

Date: 2026-05-20

## Rule

Aggregate exposure must never be calculated from raw token units.

Raw token units are token-decimal dependent. For example, `1000000` raw USDC is `1.00` USDC because USDC has 6 decimals, while `1000000` raw WETH is `0.000000000001` WETH because WETH has 18 decimals. Summing those values as dollars is financially wrong and can either over-block safe activity or, worse, undercount real exposure.

## Source Of Truth

The transaction ledger now separates raw token amounts from normalized USD accounting:

- `transactions.amount_in_raw`: raw token amount for token math and transaction reconstruction.
- `transactions.amount_out_raw`: raw token amount for token math and transaction reconstruction.
- `transactions.amount_in_usd`: USD-normalized notional used by aggregate risk.
- `transactions.amount_out_usd`: USD-normalized output notional when available.
- `transactions.gas_usd`: USD-normalized gas cost.
- `transactions.usd_price_source`: source used to derive USD notional.
- `transactions.usd_price_timestamp`: timestamp of the USD price source.
- `transactions.quote_usd_source`: quote/provider path that supplied the USD notional.
- `transactions.risk_checked_at`: time the aggregate risk gate ran.
- `transactions.aggregate_risk_snapshot_json`: serialized aggregate risk decision.

Legacy `amount_in` and `amount_out` remain for backward compatibility and UI continuity, but they must not be used for aggregate risk calculations.

## Aggregate Risk Gate

The aggregate risk engine uses only USD-normalized fields:

- Daily trade exposure uses `amount_in_usd`.
- Pending exposure uses `amount_in_usd` for submitted, pending-finality, and stuck transactions.
- Daily gas exposure uses `gas_usd`.
- Failed transaction limits use transaction status counts.
- Pending wallet limits use distinct wallets with pending live transactions.

The manual live execute-once flow checks aggregate risk after quote validation and simulation inputs are known, but before wallet key decryption or signing. If the risk gate fails, the route stores a rejected transaction with a risk snapshot and returns a structured rejection. No private key is decrypted.

## Live Scheduler No-Go

Live scheduler execution remains disabled. It must remain a no-go if the pre-sign aggregate risk gate is disabled, bypassed, or unable to produce a USD-normalized risk decision.

## Operator Notes

- Unknown USD notional must block live signing.
- Stablecoin parity may be acceptable only for verified stablecoin token addresses and decimals.
- Non-stablecoin pairs require a trusted USD price source before live execution.
- Dry-runs may continue to run, but risk reporting should clearly distinguish unknown USD notional from accepted USD-normalized exposure.
