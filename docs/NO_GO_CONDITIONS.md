# No-Go Conditions

All conditions that block live execution, ranked by severity.

## Hard No-Go (Cannot Be Overridden)

| ID | Condition | Description |
|----|-----------|-------------|
| N1 | Live scheduler enabled | Live scheduler must remain disabled at all times |
| N2 | Live scheduler check fails | Check 20 detected live scheduler is enabled — immediately transitions to `LIVE_AUTOMATION_HARD_NO_GO` |
| N3 | Vault locked | Private keys not accessible for signing |
| N19 | Custody provider health BLOCKED | Custody provider unreachable; provider health is unknown — treated as hard no-go |

## Operator-Gated (Require Acknowledgment)

| ID | Condition | Description |
|----|-----------|-------------|
| G1 | Demo mode enabled | System not in production configuration |
| G2 | Dry run disabled | System not validated in dry-run mode |
| G3 | Aggregate risk disabled | No risk guardrails active |
| G4 | Token not verified | Token address not confirmed on Basescan |
| G5 | Router not verified | Router not confirmed on Basescan |
| G6 | Spender not verified | Spender address not confirmed on Basescan |
| G7 | Missing backup drill artifact | Backup/restore drill not completed |
| G8 | Missing emergency drill artifact | Emergency drill not completed |
| G9 | No tiny live wallet | No dedicated wallet for tiny live test |
| G10 | Tiny wallet not paused | Tiny wallet must be PAUSED until test |
| G11 | Stuck/dropped wallet | System health issue detected |
| G12 | CI not green | Untested code in deployment |
| G13 | Missing Telegram test | Alert channel not verified |
| G14 | Missing dry-run load test artifact | Performance under load not validated |
| G15 | Metrics token not configured | Observability gap |
| G16 | Custody provider unhealthy | Custody layer not operational |
| G17 | Exact approval flow unavailable | Cannot set precise approval |
| G18 | Revoke flow unavailable | Cannot revoke approval |
| G19 | Aggregate risk not USD-normalized | Risk accounting not comparable across assets |

## Tiny Manual Live Specific (State: TINY_MANUAL_LIVE_BLOCKED)

When in `TINY_MANUAL_LIVE_BLOCKED` state, one or more of the Operator-Gated conditions above are active. Fix them all before proceeding.