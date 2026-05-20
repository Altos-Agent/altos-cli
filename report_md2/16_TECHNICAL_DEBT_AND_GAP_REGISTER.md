# Technical Debt And Gap Register

Date: 2026-05-20

Scope: Prioritized debt list with severity, status, impact, suggested fix, complexity, and blockers for tiny manual live, live automation, server deployment, and deferrable work.

Verdict/status: PARTIAL. The codebase is strong for local demo/dry-run. Remaining debt is concentrated around live funds, automation, deployment, and operational proof.

## Prioritized Register

| Severity | Status | Impact | Suggested fix | Complexity |
|---|---:|---|---|---:|
| CRITICAL | MISSING | Live automation could duplicate or misprice transactions if implemented prematurely. | Keep live scheduler blocked until gates pass. | L |
| HIGH | PARTIAL | Local-file custody can expose keys if host or backups are compromised. | Implement external signer/KMS path and make it authoritative. | XL |
| HIGH | PARTIAL | Aggregate exposure can be misstated and not enforced live. | Normalize USD amounts and enforce aggregate risk before signing. | M |
| HIGH | OPERATOR_REQUIRED | Unverified token/router/spender config can approve or send to wrong contract. | Add verification workflow and require `VERIFIED` everywhere. | M |
| HIGH | NOT_TESTED | Tiny live execute-once is unproven. | Run gated tiny manual live drill with dedicated wallet. | M |
| HIGH | PARTIAL | Stuck/dropped/replaced tx can block or cause nonce conflict. | Add operator recovery wizard and nonce reconciliation tests. | L |
| HIGH | PARTIAL | CI can hide E2E failures. | Remove `|| true`, make E2E gating explicit. | S |
| HIGH | PARTIAL | Server deployment can start with placeholders if operator misses env. | Fail production boot on placeholder hash/session/db secrets. | S |
| MEDIUM | PARTIAL | Sensitive endpoints lack route-level throttles. | Add rate limits for vault/live/backup/scheduler/emergency. | M |
| MEDIUM | PARTIAL | Metrics can be open if token unset. | Require metrics token in production. | S |
| MEDIUM | PARTIAL | Alerting not drilled. | Add alert drill and documented expected events. | S |
| MEDIUM | PARTIAL | Docker runtime not smoke-tested here. | Add hard-failing container health smoke. | M |
| MEDIUM | PARTIAL | Audit logs are mutable and lack UI. | Add audit review/export/retention. | M |
| MEDIUM | PARTIAL | Provider errors are generic. | Add typed provider error classes and metrics. | M |
| MEDIUM | PARTIAL | 0x price impact is not populated. | Parse provider price impact or mark unavailable explicitly. | M |
| MEDIUM | PARTIAL | Approval service should require `VERIFIED` explicitly. | Call verification assertions before approve/revoke reads/writes. | S |
| LOW | PARTIAL | Web imports Google Fonts. | Self-host Inter for local/private deployments. | S |
| LOW | PARTIAL | Some pages use empty fallback on secondary read errors. | Surface partial data errors consistently. | S |

## What Blocks Tiny Manual Live Test

- OPERATOR_REQUIRED: Dedicated low-value wallet funded with tiny amount.
- OPERATOR_REQUIRED: Verified Base token addresses and decimals.
- OPERATOR_REQUIRED: Verified router and allowance target.
- OPERATOR_REQUIRED: 0x quote provider configured and read-tested.
- OPERATOR_REQUIRED: Exact approval amount and revoke plan.
- NOT_TESTED: Backup/restore and emergency pause drills.
- NOT_TESTED: Telegram notification delivery.
- PARTIAL: Aggregate risk should be enforced before signing.

## What Blocks Live Automation

- MISSING: Live scheduler implementation.
- MISSING: Production custody provider.
- MISSING: Reliable live provider load test.
- MISSING: Nonce replacement/cancel/reorg strategy.
- PARTIAL: Aggregate risk and pending exposure correctness.
- PARTIAL: DLQ/retry/backoff/alerting for queues.
- PARTIAL: CI and operational drills.

## What Blocks Server Deployment

- OPERATOR_REQUIRED: Real secrets and TLS certs.
- PARTIAL: Redis-backed production sessions/rate limits.
- PARTIAL: Metrics and alerting locked down.
- PARTIAL: Backup/restore and emergency pause drills.
- PARTIAL: Nginx CSP and auth boundary review.
- HIGH: Local-file custody blocks meaningful funds.

## What Can Wait

- Advanced dashboard polish after safety gates.
- Multi-provider quote abstraction beyond 0x/mock.
- Native ETH value swaps.
- Automated replacement/cancel sender, as long as live automation remains blocked.
- Rich PnL engine, as long as aggregate live risk uses conservative caps and tiny amounts only.

## Acceptance Criteria

- Each HIGH/CRITICAL item has an owner, issue, test, and acceptance checklist before live work resumes.
- Tiny manual live checklist reaches all PASS/OPERATOR_REQUIRED accepted gates before any live tx.
- Live automation design cannot be implemented until scheduler gates are testable.
