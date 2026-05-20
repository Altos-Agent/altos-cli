# Technical Debt And Gaps

Date: 2026-05-13  
Scope: Prioritized debt, severity, status, impact, fix, complexity, and blockers for tiny live test, automation, and deployment.  
Verdict/status: PARTIAL; local demo/dry-run are strong, live/server hardening remains.

## Prioritized Technical Debt

| Severity | Status | Item | Impact | Suggested fix | Complexity |
| --- | --- | --- | --- | --- | --- |
| CRITICAL | PARTIAL | Local file-based wallet custody | Master key compromise drains all imported wallets | Add KMS/HSM/MPC/hardware-wallet design before meaningful funds | XL |
| CRITICAL | MISSING | Live scheduler | No safe unattended live execution | Keep disabled; design separately with safety gates | XL |
| HIGH | PARTIAL | Production auth hardening | Public brute force/session risk | Adaptive password hash, login rate limit, durable sessions | M |
| HIGH | OPERATOR_REQUIRED | Token/router live verification | Wrong addresses can lose funds | Verified-by/verified-at fields and checklist evidence | M |
| HIGH | PARTIAL | Nonce/replacement recovery | Stuck/dropped state can block or risk duplicate sends | Add operator recovery workflow and tests | L |
| HIGH | NOT_TESTED | Backup/restore drill | Loss of key or DB can strand or expose funds | Drill demo restore and document evidence | M |
| MEDIUM | PARTIAL | Migration metadata hygiene | Release/rebuild risk | Reconcile Drizzle meta snapshots/journal | S |
| MEDIUM | NOT_TESTED | Build/E2E in current audit | QA confidence gap | Run in permitted validation pass | S |
| MEDIUM | MISSING | Production monitoring | Incidents may be missed | Add metrics/alerts/log shipping | L |
| MEDIUM | PARTIAL | Queue retry/backoff | Operational fragility | Add retry policy and poison job handling | M |
| MEDIUM | PARTIAL | Aggregate exposure tracking | Multi-wallet risk blind spots | Add cross-wallet exposure summaries and limits | L |
| LOW | IMPLEMENTED | Error/loading wrapper compatibility | Minor duplication | Keep wrappers or remove after import cleanup | S |

## What Blocks Tiny Manual Live Test

- Dedicated low-value wallet and funds are OPERATOR_REQUIRED.
- Token/router/allowance target verification is OPERATOR_REQUIRED.
- Live quote provider configuration is NOT_TESTED.
- Vault backup/restore drill is NOT_TESTED.
- Emergency pause drill is NOT_TESTED.
- Revoke/finality/Basescan observation checklist is OPERATOR_REQUIRED.

## What Blocks Live Automation

- Scheduler live execution intentionally rejected.
- No safe replacement/nonce recovery automation.
- No hardware/KMS/MPC custody.
- Insufficient monitoring/alerting.
- Limited aggregate multi-wallet exposure controls.
- Queue retry and failover hardening incomplete.

## What Blocks Server Deployment

- Placeholder production secrets.
- Local-first auth/session/rate-limit model.
- TLS/cert renewal/firewall not verified on a host.
- Backups not drilled.
- Monitoring not implemented.
- Custody remains local-file based.

## What Can Wait

- UI icon standardization.
- Removing thin compatibility wrappers.
- More component-level tests.
- Additional design polish after safety workflows stabilize.
- Public API versioning until external clients exist.

