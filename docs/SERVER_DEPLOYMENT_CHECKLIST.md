# Server Deployment Checklist

Status: live funds are NO-GO until every required item is complete.

## Required Before Any Public Server

- [ ] Auth is enabled and tested for every mutating route.
- [ ] Operator password hash is stored outside the repository.
- [ ] Session secret is unique, high entropy, and stored outside the repository.
- [ ] TLS is enabled with automated renewal.
- [ ] Reverse proxy routes `/api` to API and `/` to web.
- [ ] Firewall exposes only `80/tcp`, `443/tcp`, and restricted SSH.
- [ ] SSH password login and root login are disabled.
- [ ] Postgres and Redis are private and not published on host ports.
- [ ] API is reachable only through the reverse proxy.

## Required Before Wallet Material

- [ ] Secret manager, KMS, OS keyring, or hardware-backed key policy is selected.
- [ ] Vault unlock policy is documented.
- [ ] Master key is not stored in the repository or image.
- [ ] DB backups and wallet master key backups are stored separately.
- [ ] Backups are encrypted.
- [ ] Backup restore has been tested with demo wallets.
- [ ] Backup/Restore drill passes: `scripts/drills/backup-restore-demo-drill.sh`
- [ ] Emergency pause drill passes: `scripts/drills/emergency-pause-drill.sh`
- [ ] Key compromise emergency procedure is documented.

## Required Before Live Mode

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- [ ] `pnpm e2e` passes or an explicit skipped reason is recorded.
- [ ] `pnpm docker:build:api` passes.
- [ ] `pnpm docker:build:web` passes.
- [ ] `pnpm docker:compose:prod:check` or `docker compose -f docker-compose.prod.example.yml config` passes.
- [ ] `DEMO_MODE=false` change is explicitly approved.
- [ ] `DRY_RUN=false` change is explicitly approved.
- [ ] `SCHEDULER_LIVE_EXECUTION=false` remains set.
- [ ] Live scheduled execution remains disabled.
- [ ] Global emergency pause has been tested.
- [ ] Wallet emergency pause has been tested.
- [ ] Manual live execute-once guardrails are complete.
- [ ] Idempotency and wallet nonce locks are tested.
- [ ] Quote calldata/value validation is tested.
- [ ] Confirmation finality/reorg handling is tested.
- [ ] Monitoring and alerting are configured.
- [ ] Rollback procedure is documented and tested.

## Sign-Off

Live mode remains disabled unless this section is completed by the operator:

- Operator:
- Date:
- Scope:
- Test wallet IDs:
- Maximum live amount:
- Rollback owner:

Unsigned checklist status: NO-GO for live funds.
