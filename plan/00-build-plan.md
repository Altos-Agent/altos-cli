# Build Plan

## Phase List

| Phase | Name                                          | Status                                                                    |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------- |
| 0     | Repository scaffold                           | Complete                                                                  |
| 1     | Local development infrastructure              | Complete                                                                  |
| 2     | Database schema                               | Complete in code, local runtime verification required                     |
| 3     | Wallet vault                                  | Complete in code, live import verification required                       |
| 4     | Base read-only client                         | Complete in code, RPC verification required                               |
| 5     | Initial web dashboard                         | Complete                                                                  |
| 6     | Management APIs and risk controls             | Complete                                                                  |
| 7     | Dry-run planner and quote abstraction         | Complete                                                                  |
| 8     | Telegram notifications                        | Complete in code, real bot verification required                          |
| 9     | Manual live execute once                      | Complete in guarded form, real live testing pending                       |
| 10    | ERC20 approval management                     | Complete in guarded form, real contract testing pending                   |
| 11    | BullMQ scheduler                              | Complete for scheduled dry-runs, live scheduled execution not implemented |
| 12    | Transaction confirmation watcher              | Complete in code, real receipt verification pending                       |
| 13    | Wallet profiles and encrypted bulk onboarding | Complete in code, operator workflow verification pending                  |

## Current Status

The repository contains a working local-first monorepo:

- Next.js dashboard in `apps/web`.
- Fastify API in `apps/api`.
- Shared constants in `packages/shared`.
- Postgres and Redis local services in `docker-compose.yml`.
- Drizzle schema and migrations.
- Encrypted wallet vault using a local master key file.
- Management APIs for tokens, pairs, routers, and wallet-pair rules.
- Dry-run planner and quote provider abstraction.
- 0x quote provider scaffold behind `QUOTE_PROVIDER=zeroX`.
- Telegram settings and event notifications.
- Guarded manual execute-once endpoint.
- ERC20 allowance reads, exact approvals, and revokes.
- BullMQ scheduler for scheduled dry-runs and confirmation/notification workers.
- Transaction confirmation watcher.
- Wallet profiles, bulk status changes, and encrypted wallet backup import/export.

Important current boundaries:

- `DRY_RUN=true` is the default.
- Live manual execution exists but requires explicit environment and request gates.
- Live scheduled execution is intentionally not implemented.
- Seeded token and router addresses are placeholders and disabled by default.
- Native-value swaps are not supported because execute-once currently sends `value=0`.
- Real-world live testing against verified Base contracts and funded dedicated wallets remains pending.

## Future Server Deployment Plan

Server deployment should not simply copy the local setup unchanged. Future production/server work should include:

1. Replace file-based `MASTER_KEY_FILE` with KMS, HSM, MPC, or OS-backed secret storage.
2. Add authentication and authorization for every API route before exposing beyond localhost.
3. Add HTTPS, CSRF protections for browser flows, and strict CORS policy.
4. Add structured runtime configuration validation and deployment-specific config profiles.
5. Use managed Postgres and Redis with backups, monitoring, and restricted network access.
6. Move secrets into a secret manager; do not use committed or shared `.env` files.
7. Add audit log export and immutable retention strategy.
8. Add operator approval workflows for router/token enablement and live mode changes.
9. Add confirmation-depth controls and live transaction monitoring dashboards.
10. Add incident playbooks for key compromise, router compromise, RPC outage, quote provider outage, stuck nonce, and gas spikes.
11. Add deployment health checks and worker process supervision.
12. Add KMS/MPC migration tooling for existing locally encrypted wallets.

Do not enable public or multi-user deployment until authentication, authorization, secret storage, and incident handling are designed and implemented.
