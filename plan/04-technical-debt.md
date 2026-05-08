# Technical Debt

## Current Shortcuts

- Runtime environment values are read directly from `process.env` in many modules rather than through a central typed config object.
- API route request bodies rely mostly on TypeScript interfaces and service checks, not comprehensive runtime schemas.
- Some UI flows are functional but still minimal for error recovery and operator confirmations.
- Audit logs exist but there is no immutable export, retention policy, or admin review UI.
- Daily loss accounting is not a real PnL engine.
- Gas USD estimates are quote/planner fields, not authoritative accounting.
- Execute-once sends transaction `value=0`, so native-value swaps are unsupported.
- No nonce manager exists for concurrent live sends.
- There is no authentication or authorization because the project is local-only.

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
