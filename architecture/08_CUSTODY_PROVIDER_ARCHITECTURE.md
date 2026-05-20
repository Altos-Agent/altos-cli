# Custody Provider Architecture

**Status:** Draft — Not Implemented
**Phase:** 12 (Custody Hardening Roadmap)
**Drives:** `VAULT_PROVIDER` env var, `VaultProvider` interface, `providers/` directory

---

## Context

The current vault implementation stores the master key as a plaintext file on the filesystem (`.local/master.key`). This is acceptable for local development and demo environments only. It is **not acceptable** for production use with real funds.

The custody hardening roadmap introduces a **vault provider abstraction** that:
1. Allows different storage backends (file, KMS, external signer) to be selected at runtime
2. Prevents silent fallback to less-secure providers
3. Provides a clear migration path for production deployments

---

## Current State

The `LocalFileVaultProvider`:
- Stores the master key at `MASTER_KEY_FILE` (default: `.local/master.key`)
- Uses AES-256-GCM encryption for stored secrets
- Requires explicit vault unlock via operator passphrase
- Has `safetyLevel = "DEV_ONLY"` — a permanent gate for production with real funds
- Always returns a warning via `getWarning()` regardless of configuration

The vault provider system is wired into `runtime-status.ts` via `getVaultProviderStatus()` and the `vaultProviderStatus` field.

---

## Provider Interface

All providers must implement `VaultProvider`:

```typescript
interface VaultProvider {
  readonly providerName: VaultProviderName; // "local-file" | "kms" | "external-signer"

  // Whether the provider has been configured with real credentials
  isConfigured(): boolean;

  // Whether this provider can sign transactions (vs. being a read-only store)
  supportsLiveSigning(): boolean;

  // Whether the vault must be explicitly unlocked before use
  requiresUnlock(): boolean;

  // Safety classification used to gate production use
  getSafetyLevel(): "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION";

  // Human-readable warning if provider is not production-ready
  getWarning(): string | null;

  // Core encryption operations
  encryptSecret(secret: string, masterKey: Buffer): string;
  decryptSecret(encryptedSecret: string, masterKey: Buffer): string;

  // Optional: key rotation support
  rotateMasterKey?(oldKey: Buffer, newKey: Buffer): Promise<void>;
}
```

### Safety Levels

| Level | Meaning | Production Allowed |
|-------|---------|-------------------|
| `DEV_ONLY` | File-based storage, no hardware protection | **No** — hard gate |
| `PRODUCTION_CANDIDATE` |audited, keys not on app filesystem | Conditional — audit required |
| `PRODUCTION` | HSM/KMS-backed, hardware key isolation | **Yes** — with config |

### Error Types

Providers throw typed errors to prevent silent failures:

- `VaultProviderNotConfiguredError` — thrown when a stub provider is used without real credentials. Prevents the application from running with a false sense of security.
- `VaultProviderUnsupportedError` — thrown when an operation (e.g., `rotateMasterKey`) is not supported by a provider.

---

## Provider Options

### 1. Local File (`local-file`) — **Default, Dev/Demo Only**

- Master key stored on filesystem at `MASTER_KEY_FILE`
- File permissions: `0o600` (owner read/write only)
- `safetyLevel: "DEV_ONLY"` — hard gate in production
- `isConfigured()`: returns `true` if `MASTER_KEY_FILE` is set

**Why it's not production-ready:**
- Key lives on same filesystem as application data
- Backups may inadvertently copy the key
- No hardware protection against extraction
- No audit trail of key access
- File permission misconfiguration is possible

### 2. KMS (`kms`) — **Stub, Not Implemented**

Target: AWS KMS, GCP Cloud KMS, or Azure Key Vault.

**How it would work:**
- Master key material never touches the application filesystem
- Encryption/decryption delegated to cloud KMS APIs
- `isConfigured()` returns `true` only when real credentials are present
- `safetyLevel: "PRODUCTION"` when credentials are configured

**Required env vars for future implementation:**
```
VAULT_PROVIDER=kms
KMS_PROVIDER=aws          # aws | gcp | azure
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
KMS_KEY_ID=...
```

**Security benefits:**
- Master key is generated and stored inside HSM
- Key extraction is technically impossible
- Access is governed by IAM permissions
- Cloud audit logs capture all key operations

**Stub behavior:** Currently throws `VaultProviderNotConfiguredError("kms")` on any encryption call.

### 3. External Signer (`external-signer`) — **Stub, Not Implemented**

Target: HSM-as-a-service (Fireblocks, BitGo), hardware wallet agents (Ledger Enterprise), or manual signing workflows.

**How it would work:**
- Application never holds private key material
- Transaction to be signed is sent to external service
- External service performs signing and returns signature
- Nonce management may be delegated to external service

**Required env vars for future implementation:**
```
VAULT_PROVIDER=external-signer
EXTERNAL_SIGNER_URL=https://signing-service.example.com
EXTERNAL_SIGNER_TOKEN=...
EXTERNAL_SIGNER_NONCE_STRATEGY=rpc|manual
```

**Security benefits:**
- Key material is fully outside application attack surface
- Hardware wallet integration possible
- MPC wallets provide multi-party key control
- Operator must approve each transaction

**Stub behavior:** Currently throws `VaultProviderNotConfiguredError("external-signer")` on any encryption call.

---

## Production Guard

The env schema (`src/config/env.ts`) enforces a hard gate:

```typescript
if (env.NODE_ENV === "production" && !env.DRY_RUN && env.VAULT_PROVIDER === "local-file") {
  context.addIssue({
    code: "custom",
    path: ["VAULT_PROVIDER"],
    message: "VAULT_PROVIDER=local-file is not permitted in production with live trading. Use kms or external-signer.",
  });
}
```

This means in production (`NODE_ENV=production`) with dry-run disabled (`DRY_RUN=false`), `VAULT_PROVIDER=local-file` will cause the application to refuse to start.

---

## Migration Path

### Step 1: Audit (LS1 Gate)

Before enabling live trading:
- Complete security audit of key management
- Document all systems with access to key storage
- Verify backup procedures do not expose keys

### Step 2: Select Provider

Evaluate:
- **KMS** — best for automated trading with cloud infrastructure
- **External Signer** — best for high-value funds requiring manual approval per transaction
- **HSM** — best for regulatory compliance requirements

### Step 3: Configure Provider

1. Set `VAULT_PROVIDER` to selected provider
2. Configure provider-specific credentials
3. Remove `MASTER_KEY_FILE` from environment
4. Run in `DRY_RUN=true` mode to validate

### Step 4: Migrate Secrets

The vault encryption format is provider-agnostic (AES-256-GCM ciphertext). Existing encrypted secrets can be decrypted with the old master key and re-encrypted with the new KMS-managed key. No data migration required.

### Step 5: Enable Live Trading

After all 10 implementation gates are passed, set `DRY_RUN=false`. The production guard will verify a production-grade provider is configured.

---

## Files

| File | Role |
|------|------|
| `src/vault/providers/index.ts` | `VaultProvider` interface, error types, `VaultProviderName` type |
| `src/vault/providers/local-file.ts` | Current implementation, `safetyLevel = DEV_ONLY` |
| `src/vault/providers/kms.ts` | Stub for cloud KMS integration |
| `src/vault/providers/external-signer.ts` | Stub for external signing service |
| `src/vault/providers/provider-registry.ts` | Factory, `getActiveVaultProvider()`, `getVaultProviderStatus()` |
| `src/config/env.ts` | `VAULT_PROVIDER` enum, production guard in `superRefine` |
| `src/runtime/runtime-status.ts` | Exposes `vaultProviderStatus` in runtime status API |

---

## Related Documents

- `docs/CUSTODY_HARDENING_ROADMAP.md` — Migration checklist and timeline
- `architecture/06_LIVE_SCHEDULER_THREAT_MODEL.md` — Threat model for live scheduler (threats CA-1 through CA-4 cover key custody)
- `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` — 10 gates including custody audit gate (LS1)