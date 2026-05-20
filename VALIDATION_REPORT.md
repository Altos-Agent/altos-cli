# Validation Report

Date: 2026-05-09
Scope: Phase F strict quote validation and confirmation finality, plus regression coverage from earlier safety phases in `base-orchestrator`.

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `pnpm typecheck` | PASS | Shared, API, and web TypeScript checks passed. |
| `pnpm lint` | PASS | Shared, API, and web ESLint checks passed with `--max-warnings 0`. |
| `pnpm --filter @base-orchestrator/api test -- quote-validation.test.ts confirmation.test.ts confirmation-finality.integration.test.ts live-execution.test.ts planner.test.ts` | PASS | Red/green slice for strict quote rejection cases and confirmation-depth finality. |
| `pnpm test` | PASS | API Vitest suite passed: 29 files, 92 tests. |
| `pnpm build` | PASS | Shared/API type builds and Next.js web build passed. |

## Errors

None in final validation.

## Warnings

- Test output includes Fastify request logs from auth, vault, runtime, Telegram, and emergency-pause integration tests. No private keys, Telegram tokens, master keys, or encrypted secret payloads were printed.

## Known Limitations

- Auth is single-operator and session storage is in memory; API restart clears sessions.
- `OPERATOR_PASSWORD` remains available for local development only. Shared or server-like use should use `OPERATOR_PASSWORD_HASH`.
- Vault lock is process-local and does not replace KMS/HSM/MPC or OS keychain custody.
- Global emergency pause blocks new live-impacting actions but does not revoke existing ERC20 allowances or cancel already-submitted transactions.
- Approval exposure aggregation is still partial in the dashboard; exact allowance review remains per wallet.
- Pending transactions and recent rejections are based on transaction records already available to the web app.
- Ops summary is an authenticated JSON endpoint, not a Prometheus/OpenTelemetry exporter.
- Notification rate limiting is local in-memory throttling; it is not distributed across processes.
- Live execution still lacks full router-specific calldata decoding, replacement transaction detection, reorg reconciliation, and production deployment hardening.
- Live native-value swaps remain blocked by default with `NATIVE_VALUE_SWAPS_ENABLED=false`; quotes with `txValue > 0` are rejected.
- No live blockchain transactions were sent during validation.

## Runtime Safety State

- Live trading enabled: NO by default.
- `DEMO_MODE`: true by default in `.env.example` and E2E.
- `DRY_RUN`: true by default in `.env.example` and E2E.
- `SCHEDULER_LIVE_EXECUTION`: false by default.
- `ALLOW_UNLIMITED_APPROVAL`: false by default.
- `AUTO_APPROVE`: false by default.

## Phase F Controls Validated

- Provider quote output is parsed through `normalizedQuoteSchema`.
- Live quote validation rejects wrong chain, disabled router, disabled spender, token mismatch, raw sell amount mismatch, missing calldata, positive native value, expired quote, excessive price impact, excessive slippage, and non-positive buy amount.
- Calldata hash and quote hash are stored on transaction records when quote data is available.
- Function selector allowlists are enforced when configured, but full calldata decoding remains a documented limitation.
- Confirmation refresh moves successful receipts to `CONFIRMED_PENDING_FINALITY` until `CONFIRMATIONS_REQUIRED` is met, then stores final `CONFIRMED`, `confirmation_count`, and `finalized_block`.
- Submitted transaction timeout writes a `dropped_reason` marker when no receipt is available after `SUBMITTED_TX_TIMEOUT_MS`.
