# Gaps and Missing Features
Date: 2026-05-08
Repository audit scope: Missing features against intended product/docs, safety/UI/operational/blockchain/monitoring gaps, and prioritized roadmap.
Verdict/status: PARTIAL. The product has a strong demo base but lacks required live automation features.

## Missing Features Against Intended Product

| Severity | Status | Feature | Notes |
|---|---|---|---|
| CRITICAL | MISSING | Auth and local operator identity | Required for any serious wallet tool. |
| CRITICAL | PARTIAL | Production-grade vault | Current local key file is not enough for live funds. |
| HIGH | MISSING | Idempotent live transaction manager | Needed before execute-once live use. |
| HIGH | MISSING | Nonce and pending transaction management | Needed for all live wallets. |
| HIGH | PARTIAL | Scheduler automation | Dry-run only; live scheduled execution is blocked. |
| HIGH | PARTIAL | Quote/live calldata validation | Needs deeper schema and semantic verification. |

## Missing Features Against Docs

Docs are candid about future server deployment and KMS/MPC migration. Actual implementation does not yet include server auth, TLS, KMS/MPC, production backups, or live scheduler.

## Missing Safety Features

- Global emergency pause.
- Vault lock/unlock.
- App-wide live mode readiness gate.
- Approval max policy by wallet/token/router.
- Price impact enforcement.
- Confirmation depth and stuck transaction policy.
- Operator approval for enabling routers/tokens/pairs.

## Missing UI Features

- API-backed runtime mode banner.
- Vault status and unlock UI.
- Global emergency pause UI.
- Pending transaction/nonce queue view.
- Explicit demo/fake Basescan link badge.
- Better API offline/error states.
- Browser E2E-tested happy paths.

## Missing Operational Features

- Structured logs with request IDs.
- Metrics for queue depth, notification failures, transaction states.
- Backup scripts and restore drill.
- Secret rotation drill.
- Incident runbook for compromised key or bad approval.
- Production process supervision.

## Missing Blockchain Features

- Native token swap `value` support and validation.
- Quote expiry and min-out enforcement.
- Decoding/semantic checking of router calldata.
- Nonce manager.
- Replacement/cancel transaction handling.
- Reorg-aware finality.
- Multi-RPC fallback.

## Missing Monitoring Features

- Health probes beyond basic status.
- RPC latency/error metrics.
- Wallet pending tx alerts.
- Approval exposure alerts.
- Telegram delivery failure alerts.
- Scheduler missed-run alerts.

## Prioritized Roadmap

1. Auth, vault unlock, schemas.
2. Transaction manager with idempotency and nonce lock.
3. Amount/decimals correctness.
4. Quote validation and live guardrail tests.
5. UI mode/status/pending transaction safeguards.
6. Confirmation finality and reorg handling.
7. Scheduler recurrence hardening.
8. Observability and backup/restore automation.
9. Server deployment hardening.

