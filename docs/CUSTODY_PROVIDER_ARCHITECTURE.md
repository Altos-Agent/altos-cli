# Custody Provider Architecture

## Overview

The custody provider system replaces the previous vault-based key storage with a broader abstraction that covers both key storage AND transaction signing, ensuring private keys never enter the API process memory for production use.

## Provider Types

| Provider | Safety Level | Private Key Exposure | Policy Support |
|----------|-------------|----------------------|----------------|
| local-file | DEV_ONLY | Full exposure to filesystem | No |
| external-http-signer | PRODUCTION | None — signing delegated | Yes |
| hashicorp-vault-transit | PRODUCTION_CANDIDATE | None — Vault Transit | Yes |
| aws-kms | PRODUCTION_CANDIDATE | None — AWS KMS | Yes |

## CustodyProvider Interface

See `apps/api/src/custody/providers/base.ts` for the full interface.

Key methods:
- `signTransaction(SignRequest): Promise<SignResult>` — Signs a transaction without exposing private key
- `importWallet(privateKey, metadata)` — Imports a wallet into the custody system
- `registerAddress(address, metadata)` — Registers a watch-only address
- `healthCheck()` — Returns signer health status
- `supportsPolicy()` — Whether the provider enforces signer policy

## Signing Flow

1. Transaction request received (execute-once, scheduler, etc.)
2. `SigningCoordinator.signTransaction()` called with `SignRequest` + `SignerPolicyContext`
3. `SignerPolicyEngine.check()` evaluates all policy rules
4. If policy denies: `SignerPolicyError` thrown, transaction rejected
5. If policy passes: `CustodyProvider.signTransaction()` called
6. Result returned to caller — no private key material in logs

## Local File Restrictions

`VAULT_PROVIDER=local-file` is blocked at boot when:
- `NODE_ENV=production` AND `DRY_RUN=false`
- `SCHEDULER_LIVE_EXECUTION=true`

Local file is allowed in:
- `NODE_ENV=development` with `DRY_RUN=true`
- `DEMO_MODE=true`
- Manual approval mode with tiny wallet limits

See `docs/LOCAL_FILE_VAULT_LIMITATIONS.md`.