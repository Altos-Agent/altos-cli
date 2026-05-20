# Custody Hardening Roadmap

**Phase:** 12 (Custody Hardening)
**Purpose:** Document the migration path from file-based vault storage to production-grade custody solutions. No live trading is enabled until all gates are passed.

---

## Overview

The system uses a vault to store encrypted private keys for wallet backups. The current implementation (`VAULT_PROVIDER=local-file`) stores the master key as a plaintext file on the filesystem. This is appropriate for local development and demo environments only.

**This document is the migration guide. It does not enable live trading.**

---

## Why This Matters

File-based key storage has fundamental risks:

1. **Key extraction** — Any process with filesystem access can read the master key
2. **Backup exposure** — Backup copies of the database may include the master key file
3. **No hardware root of trust** — The key is protected only by filesystem permissions (0o600), which can be misconfigured
4. **No audit trail** — There is no record of when or by whom the master key was accessed

For demo environments these risks are acceptable. For production with meaningful funds, they are not.

---

## Current Configuration

```
VAULT_PROVIDER=local-file     # Default — dev/demo only
MASTER_KEY_FILE=.local/master.key
VAULT_UNLOCK_PASSPHRASE=<operator-set>
VAULT_AUTO_LOCK_MS=900000      # 15 minutes
```

The vault must be unlocked before any wallet operations (signing, approvals). After `VAULT_AUTO_LOCK_MS` of inactivity, it re-locks automatically.

---

## Migration Options

### Option A: Cloud KMS (AWS KMS / GCP Cloud KMS / Azure Key Vault)

**Best for:** Automated trading systems with cloud infrastructure.

**How it works:**
- Master key is generated and stored inside the cloud HSM
- Application calls KMS API to encrypt/decrypt secrets
- Master key material never touches the application filesystem
- IAM policies control who can use the key

**Env vars:**
```bash
VAULT_PROVIDER=kms
KMS_PROVIDER=aws               # aws | gcp | azure
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_REGION=us-east-1
KMS_KEY_ID=<key-id>
```

**Security properties:**
- Key extraction is cryptographically impossible
- All key operations are logged in cloud audit trail
- Access requires valid AWS credentials with KMS permissions
- Key rotation is handled by the KMS service

**Implementation status:** Stub — `VaultProviderNotConfiguredError("kms")` is thrown on encryption calls. Real implementation requires AWS SDK integration.

---

### Option B: External Signer (MPC / Hardware Wallet / Manual)

**Best for:** High-value funds requiring human approval per transaction.

**How it works:**
- Application never holds private key material
- Transaction to be signed is sent to external service (Fireblocks, BitGo, Ledger Enterprise)
- External service performs signing and returns the signature
- Operator can configure automatic approval rules or require manual confirmation

**Env vars:**
```bash
VAULT_PROVIDER=external-signer
EXTERNAL_SIGNER_URL=https://signing-service.example.com
EXTERNAL_SIGNER_TOKEN=<token>
EXTERNAL_SIGNER_NONCE_STRATEGY=rpc   # or "manual"
```

**Security properties:**
- Key material is fully outside the application attack surface
- Hardware wallet integration possible (Ledger Enterprise)
- MPC wallets provide multi-party key control (M-of-N signatures)
- Human operator must approve each transaction (configurable)

**Implementation status:** Stub — `VaultProviderNotConfiguredError("external-signer")` is thrown on encryption calls. Real implementation requires signing service API integration.

---

## Migration Checklist

Complete all items before enabling `DRY_RUN=false` in production.

### Security Audit Gate (LS1)

- [ ] Audit completed by external security firm or qualified internal team
- [ ] All systems with filesystem access to key storage identified
- [ ] Backup procedures reviewed — no unencrypted key copies exist
- [ ] Penetration test performed (focus on key extraction attack paths)
- [ ] Findings remediated and verified

### Provider Selection

- [ ] Provider type selected: KMS (automated) or External Signer (manual/hardware)
- [ ] Provider credentials configured in target environment
- [ ] Provider implementation verified (integration test with real credentials)

### Key Migration

- [ ] New provider tested in `DRY_RUN=true` mode
- [ ] Existing encrypted vault data decrypted with old key
- [ ] Vault data re-encrypted with new provider
- [ ] Old master key file securely deleted from production systems
- [ ] Rollback procedure documented and tested

### Configuration Validation

- [ ] `VAULT_PROVIDER` set to selected provider (not `local-file`)
- [ ] `NODE_ENV=production`
- [ ] `DRY_RUN=false`
- [ ] Application starts without errors or warnings
- [ ] Vault unlock flow works with new provider

### Operational Readiness

- [ ] Monitoring configured for vault provider errors
- [ ] Alert webhook tested — vault provider errors trigger alerts
- [ ] Runbook updated for vault provider failure scenarios
- [ ] Key rotation procedure documented and tested (if supported)
- [ ] Disaster recovery procedure documented

### Approval Gate

- [ ] All LS1-LS5 implementation gates passed
- [ ] Code review completed by senior engineer
- [ ] Sign-off documented in project record

---

## What NOT To Do

**Do NOT** skip the audit gate and enable live trading with `local-file` provider in production. The production guard exists to prevent this, but it is a safety net, not a substitute for due diligence.

**Do NOT** store the master key in version control, environment variables, or CI/CD secrets.** Do NOT** use the same master key across multiple environments.

**Do NOT** enable live trading until all 10 implementation gates (LS1-LS5) from `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` are passed.

---

## Rollback Procedure

If a vault provider failure occurs in production:

1. **Immediate:** Set `DRY_RUN=true` to halt live trading
2. **Assess:** Determine if the issue is a provider outage or a configuration problem
3. **Temporary fix:** If KMS or external signer is temporarily unavailable, the system can operate in dry-run mode indefinitely
4. **Restore:** Fix the provider issue, validate, then set `DRY_RUN=false`

There is no need to delete the vault or re-import wallets. Encrypted wallet data is provider-agnostic and can be decrypted by any correctly-configured provider given the correct master key (for KMS) or access to the external signing service (for external signer).

---

## Testing the Migration

Before migrating in production, test the full migration path in a staging environment:

1. Start with `VAULT_PROVIDER=local-file`, `DRY_RUN=true`
2. Set up KMS or external signer in staging
3. Run migration:
   - Trigger key migration via admin API or CLI
   - Verify encrypted data is re-encrypted with new provider
4. Validate wallet operations work with new provider
5. Test rollback: migrate back to local-file, verify no data loss
6. Document any issues found during staging migration

---

## Related Documents

- `architecture/08_CUSTODY_PROVIDER_ARCHITECTURE.md` — Provider interface design and security comparison
- `architecture/06_LIVE_SCHEDULER_THREAT_MODEL.md` — Threat model (CA-1 through CA-4 cover key custody)
- `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` — 10 implementation gates including custody audit (LS1)