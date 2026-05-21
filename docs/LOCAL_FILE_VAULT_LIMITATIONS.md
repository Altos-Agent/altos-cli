# Local File Vault Limitations

## WARNING: NOT FOR PRODUCTION USE

The `local-file` custody provider is suitable ONLY for:
- Local development with no real funds
- Demo environments with tiny wallet limits
- Dry-run testing

**Do NOT use `VAULT_PROVIDER=local-file` in production with real funds.**

## Security Risks of File-Based Storage

1. **Key extraction** — Any process with filesystem access can read the master key file
2. **Backup exposure** — Database backups may include encrypted wallets, and the master key file may also be present
3. **No hardware root of trust** — Key is protected only by filesystem permissions (0o600), which can be misconfigured
4. **No audit trail** — No record of when or by whom the master key was accessed
5. **No access control** — Anyone with filesystem access can read the key

## Production Alternatives

See `docs/CUSTODY_HARDENING_ROADMAP.md` for migration options:

1. **External HTTP Signer** — Delegates signing to an external MPC/HSM service
2. **HashiCorp Vault Transit** — Uses Vault's Transit secrets engine
3. **AWS KMS** — Uses AWS Key Management Service

## Boot-Time Enforcement

The system will refuse to boot with `VAULT_PROVIDER=local-file` when:
- `NODE_ENV=production` AND `DRY_RUN=false`
- `SCHEDULER_LIVE_EXECUTION=true`

This is enforced in `apps/api/src/config/env.ts` via the `superRefine` block.

## When Local File IS Appropriate

- You are developing locally without real funds
- You are in demo mode with `DEMO_MODE=true`
- You are running dry-run tests with `DRY_RUN=true`
- You are manually reviewing every transaction

Even in these cases, never use local-file for wallets with meaningful value.