# Technical Debt
Date: 2026-05-08
Repository audit scope: Current shortcuts, severity, impact, suggested fixes, estimated complexity, what can wait, and what blocks live mode.
Verdict/status: PARTIAL. Debt is acceptable for local demo, but several items block live funds.

## Prioritized Technical Debt List

| Severity | Status | Debt | Impact | Fix | Complexity | Blocks live |
|---|---|---|---|---|---|---|
| CRITICAL | MISSING | No API auth/authorization. | Any reachable client can mutate wallet/risk/live settings. | Add auth/session/CSRF and route policy. | L | Yes |
| CRITICAL | PARTIAL | File-based hot master key. | DB plus key file compromise exposes wallets. | Add vault provider with OS keyring/KMS/passphrase unlock. | XL | Yes |
| HIGH | MISSING | No idempotency/nonce lock. | Duplicate live submissions possible. | Add transaction request table and per-wallet lock. | L | Yes |
| HIGH | PARTIAL | Amount semantics unclear. | Decimals mistakes in trades/approvals/history. | Standardize display/raw amount types and conversions. | M | Yes |
| HIGH | PARTIAL | Quote validation shallow. | Malicious/bad provider response could target wrong spender/router/value. | Add strict quote schema and semantic checks. | L | Yes |
| HIGH | PARTIAL | Scheduler lifecycle limited. | Not reliable for automation. | Redesign recurrence, locks, stop behavior, job history. | L | Yes for scheduled live |
| HIGH | MISSING | Confirmation finality policy. | Reorg/stuck tx handling missing. | Add confirmations, replacement, timeout states. | M | Yes |
| MEDIUM | MISSING | Route schemas absent. | Runtime input mistakes and inconsistent API contracts. | Add Zod/TypeBox schemas. | M | Yes for live |
| MEDIUM | PARTIAL | Validation report stale. | Misleads future agents. | Regenerate after current validation. | S | No |
| MEDIUM | PARTIAL | Generated artifacts in workspace. | Noise and possible accidental commits. | Remove `.next/`, `*.tsbuildinfo` if tracked. | S | No |
| MEDIUM | MISSING | E2E tests absent. | Demo regressions can slip. | Add Playwright. | M | No for dry-run, yes before live UI |
| MEDIUM | PARTIAL | Web hides API errors as empty states. | Operators may miss backend failures. | Return explicit error states. | M | No |
| MEDIUM | MISSING | Production Docker/deployment absent. | Server deploy unsafe. | Add deployment manifests after auth/secrets. | L | Yes for server |

## What Can Wait

- Advanced portfolio analytics.
- Rich transaction filtering.
- Telegram Markdown formatting.
- Multi-user roles beyond a single local operator.
- Production server deployment manifests until auth/vault/live guardrails are complete.

## What Blocks Live Mode

1. Auth/authorization.
2. Vault hardening and unlock workflow.
3. Idempotency and nonce locks.
4. Strict route and quote validation.
5. Token decimals/raw unit correctness.
6. Confirmation finality policy.
7. Approval max policy and spender verification.
8. E2E/live guardrail test suite.
9. Operational backup/restore and emergency pause drill.

