/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * External signer vault provider.
 *
 * STUB — NOT IMPLEMENTED.
 *
 * This provider represents a workflow where transaction signing is delegated
 * to an external system:
 * - Hardware security modules (HSMs)
 * - Multi-party computation (MPC) wallets (e.g., Fireblocks, BitGo)
 * - Hardware wallets (Ledger, Trezor) via a local agent
 * - Manual signing by a human operator
 *
 * This provider does NOT store the master key at all. Instead, it stores a
 * reference to the external signing service. Transactions requiring a signature
 * are sent to the external service, which performs the actual signing.
 *
 * Design considerations for future implementation:
 * - A transaction queue for manual signing approvals (operator must confirm)
 * - Webhook or polling interface to the external service
 * - Nonce management may be delegated to the external service
 * - Audit trail from external service must be correlated via request IDs
 *
 * STUB BEHAVIOR: Throws VaultProviderNotConfiguredError on any encryption call.
 * This stub exists to:
 * 1. Define the interface a real external signer must implement
 * 2. Prevent silent fallback to less secure providers
 *
 * Required env vars for future implementation:
 *   EXTERNAL_SIGNER_URL=https://signing-service.example.com
 *   EXTERNAL_SIGNER_TOKEN=...           (API token for the signing service)
 *   EXTERNAL_SIGNER_NONCE_STRATEGY=rpc|manual  (how nonce is obtained)
 *
 * IMPORTANT: This stub does NOT provide security. Do not ship code that
 * silently accepts this provider without a real signing service.
 */

import type {
  VaultProvider,
  VaultProviderName,
} from "./index.js";
import {
  VaultProviderNotConfiguredError,
  VaultProviderUnsupportedError,
} from "./index.js";

export class ExternalSignerVaultProvider implements VaultProvider {
  readonly providerName: VaultProviderName = "external-signer";

  isConfigured(): boolean {
    // Not implemented — check returns false until real service is configured
    return false;
  }

  supportsLiveSigning(): boolean {
    // External signer can technically sign, but only if service is wired up
    return false;
  }

  requiresUnlock(): boolean {
    // Unlock semantics depend on the external service
    return true;
  }

  getSafetyLevel(): "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION" {
    // Depends entirely on the external service implementation
    if (!this.isConfigured()) return "DEV_ONLY";
    return "PRODUCTION";
  }

  getWarning(): string | null {
    if (!this.isConfigured()) {
      return (
        "External signer provider is not configured. Set VAULT_PROVIDER=external-signer " +
        "and configure EXTERNAL_SIGNER_URL. See docs/CUSTODY_HARDENING_ROADMAP.md."
      );
    }
    return null;
  }

  encryptSecret(_secret: string, _masterKey: Buffer): string {
    throw new VaultProviderNotConfiguredError("external-signer");
  }

  decryptSecret(_encryptedSecret: string, _masterKey: Buffer): string {
    throw new VaultProviderNotConfiguredError("external-signer");
  }

  async rotateMasterKey(
    _oldKey: Buffer,
    _newKey: Buffer
  ): Promise<void> {
    throw new VaultProviderUnsupportedError("rotateMasterKey", "external-signer");
  }
}

export const externalSignerVaultProvider = new ExternalSignerVaultProvider();