# Live Automation And Scheduler Threat Model

Date: 2026-05-20

Scope: Live scheduler threat model, duplicate tx, nonce conflict, replacement/cancel, provider rate limits, gas spikes, quote staleness, stuck/dropped/reorg, aggregate exposure, compromised wallet/session/Redis/Postgres, restart during jobs, required architecture, and no-go gates.

Verdict/status: MISSING / HARD_NO_GO. Live scheduler execution is intentionally not implemented and must remain disabled.

## Live Scheduler Threat Model

Live automation would convert an operator-reviewed one-shot system into a system capable of repeated signing. That changes the risk category from local tool to autonomous fund-moving infrastructure.

## Duplicate Transaction Risk

- Threat: Same schedule or retry creates multiple live swaps.
- Current status: PARTIAL. Dry-run duplicate suppression exists. Live scheduler is missing.
- Required: Idempotency per schedule occurrence, queue dedupe, DB uniqueness, wallet lock tied to nonce, and restart-safe replay.

## Nonce Conflict

- Threat: Multiple jobs or manual action use same wallet nonce.
- Current status: PARTIAL. Same-wallet pending statuses block another live write.
- Required: Explicit nonce reservation, nonce reconciliation with RPC, and lock release only after finality or operator-reviewed terminal state.

## Replacement/Cancel Risk

- Threat: Stuck transaction requires cancel/replace and automation submits unsafe follow-up.
- Current status: MISSING. Replacement/cancel sending not implemented.
- Required: Operator-approved replacement flow, nonce-aware cancel, and no automated retry signing without current nonce proof.

## Provider Rate Limit

- Threat: Quote/RPC provider 429 leads to missed, stale, or inconsistent jobs.
- Current status: NOT_TESTED. Load-test CLI exists.
- Required: Provider backoff, circuit breaker, per-provider concurrency, 429 alerting, and load-test artifact.

## Gas Spike

- Threat: Gas rises between quote/simulation/send.
- Current status: PARTIAL. Wallet gas cap exists but gas USD is quote/provider dependent.
- Required: Real gas estimate cap, max fee policy, slippage/gas revalidation immediately before signing.

## Quote Staleness

- Threat: Scheduler signs expired or stale quote.
- Current status: PARTIAL. Quote expiry is validated.
- Required: Fresh quote immediately before signing and abort if expiry is near.

## Stuck/Dropped/Reorg

- Threat: Automation keeps trading while a wallet has uncertain nonce/finality.
- Current status: PARTIAL. `STUCK` and pending-finality block same wallet; reorg detection operator-guided.
- Required: Hard wallet pause on stuck/dropped, operator review workflow, and no scheduler resume until nonce verified.

## Aggregate Exposure

- Threat: Many wallets create aggregate exposure above operator intent.
- Current status: PARTIAL. Aggregate risk exists but live route enforcement is incomplete.
- Required: Chain-wide and portfolio-wide caps enforced immediately before every live signature.

## Compromised Wallet

- Threat: One wallet key or allowance compromised.
- Current status: PARTIAL. Emergency pause and revoke flow exist.
- Required: Per-wallet pause, allowance audit, revoke playbook, wallet quarantine, alerting.

## Compromised Operator Session

- Threat: Attacker with session starts scheduler or live tx.
- Current status: PARTIAL. Auth/CSRF exist; no MFA/RBAC.
- Required: MFA, short sessions, re-auth for live scheduler, IP allowlist or identity proxy, audit alerts.

## Compromised Redis/Postgres

- Threat: Attacker modifies queues, schedules, wallet states, or config.
- Current status: PARTIAL. DB is trusted control plane.
- Required: DB access controls, backups, tamper-evident audit, signer policy independent of DB.

## Restart During Pending Jobs

- Threat: API restart loses in-memory scheduler state while jobs/locks remain.
- Current status: PARTIAL. DB scheduler locks and BullMQ persist, but workers require start.
- Required: restart-safe worker deployment, startup reconciliation, pending tx refresh, and lock owner recovery.

## Required Architecture Before Implementation

- External signer/KMS policy boundary.
- Pre-sign aggregate risk enforcement.
- Fresh quote and simulation immediately before signing.
- Per-wallet nonce reservation and reconciliation.
- Idempotent schedule occurrence records.
- DLQ, backoff, alerting, and operator UI.
- Provider circuit breakers.
- Emergency stop that blocks signing and drains/pauses queues safely.

## No-Go Gates

- No live scheduler until tiny manual live test passes.
- No live scheduler with local-file custody.
- No live scheduler without provider load test.
- No live scheduler without aggregate risk enforcement.
- No live scheduler without nonce/replacement/reorg plan.
- No live scheduler while CI masks E2E failures.

## Acceptance Criteria

- A simulated restart during pending live job does not duplicate a transaction.
- A stuck transaction pauses that wallet and prevents all scheduler jobs.
- Aggregate cap breach rejects before signing and alerts.
- Compromised DB cannot cause signer to sign arbitrary calldata.
