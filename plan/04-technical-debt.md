# Technical Debt

## Current Shortcuts

- Some non-critical CLI/test paths still read directly from `process.env`; critical runtime settings now go through central config.
- Some legacy API route surfaces still rely on service-level invariants for domain-specific checks, but route params, bodies, headers, and no-body mutation contracts now have explicit schema validation coverage.
- Some UI flows are functional but still minimal for retry guidance after backend failures.
- Audit logs exist but there is no immutable export, retention policy, or admin review UI.
- Daily loss accounting is not a real PnL engine.
- Gas USD estimates are quote/planner fields, not authoritative accounting.
- Execute-once sends transaction `value=0`, so native-value swaps are unsupported.
- Nonce policy is conservative rather than automatic: same-wallet live writes are blocked while submitted/pending/stuck transactions exist, but there is no replacement/cancel transaction flow.
- Local auth is single-operator and in-memory-session based. This is acceptable for local-first use, but server deployment still needs persistent sessions or a hardened reverse-proxy/auth boundary.
- `OPERATOR_PASSWORD` remains supported for local development. Shared machines should use `OPERATOR_PASSWORD_HASH`.
- Vault lock is process-local. Restarting the API returns the vault to `LOCKED`, but there is no hardware-backed key isolation yet.
- Global emergency pause does not revoke existing allowances or cancel submitted transactions.
- Reorg detection is operator-guided; finalized rows inside lookback are flagged for review but not automatically repaired.
- Drizzle migration metadata drift has a regression test and was reconciled through `0010_phase_i_transaction_status`, but the reconstructed `0005`-`0010` snapshots should be treated as release-critical metadata and checked with `pnpm --filter @base-orchestrator/api db:generate` before future migration work.

## Mock Provider Limitations

Owner file: `apps/api/src/quote/providers/mock.ts`.

- Does not call a real DEX or aggregator.
- Does not return transaction target or calldata.
- Does not return allowance target.
- Uses simple deterministic output and gas placeholder values.
- Suitable for dry-run UI and risk pipeline testing only.
- Cannot be used for live execution.

## 0x Integration Status

Owner file: `apps/api/src/quote/providers/zeroX.ts`.

Current state:

- Provider is selectable with `QUOTE_PROVIDER=zeroX`.
- Endpoint defaults to `https://api.0x.org/swap/allowance-holder/quote`.
- Supports `ZEROX_API_KEY`, `ZEROX_SWAP_QUOTE_URL`, and `ZEROX_API_VERSION`.
- Normalizes `buyAmount`, `sellAmount`, gas, allowance target, transaction target, data, warnings, issues, and bounded raw response.

Debt:

- Needs live validation against current 0x API behavior.
- Needs primary-source verification for router and allowance target addresses.
- Needs better error metadata for operator troubleshooting.
- Needs explicit transaction value support before native ETH swaps.
- Needs stronger raw-response sanitization if providers ever return sensitive or very large fields.

## Scheduler Limitations

Owner files: `apps/api/src/scheduler`.

- Scheduled trade jobs only execute dry-runs.
- Live scheduled execution throws intentionally.
- Profile strategy selection is basic and picks the first eligible enabled wallet-pair rule.
- No advanced backoff, recurring cron schedule, or calendar windows exist.
- No distributed worker coordination beyond BullMQ defaults.
- No UI for failed queue job inspection beyond queue counts.
- Scheduler state is process-local; API restart stops in-memory workers until `/api/scheduler/start` is called again.

## Future KMS/MPC Migration

Current vault owner: `apps/api/src/vault/wallet-vault.ts`.

Migration goals:

- Replace local flat-file `MASTER_KEY_FILE` with KMS, HSM, MPC, or OS keychain integration.
- Add key versioning and explicit re-encryption migrations.
- Add secure signing service abstraction so private keys do not enter application memory.
- Add policy controls for which wallets can sign, spend limits, and approval scopes.
- Add break-glass recovery and revocation process.
- Support migration from existing AES-GCM payloads without exposing plaintext keys to logs or export files.

Until this migration exists, treat the local machine as the custody boundary.
