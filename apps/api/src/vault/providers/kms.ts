/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * KMS-backed vault provider (AWS KMS, GCP KMS, or Azure Key Vault).
 *
 * STUB — NOT IMPLEMENTED.
 *
 * This provider throws VaultProviderNotConfiguredError until real KMS
 * credentials and implementation are added. It exists to:
 * 1. Define the interface a real KMS provider must implement
 * 2. Serve as a placeholder for future implementation
 * 3. Prevent silent fallback to less secure providers
 *
 * When real KMS support is added:
 * - Set VAULT_PROVIDER=kms and configure the appropriate env vars
 * - Implement encryptSecret/decryptSecret using the KMS SDK
 * - The master key never touches the application filesystem
 * - Key rotation is handled by the KMS service natively
 *
 * Required env vars for future implementation:
 *   KMS_PROVIDER=aws|gcp|azure
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, KMS_KEY_ID
 *   Or: GCP_APPLICATION_CREDENTIALS, GCP_KMS_KEY_ID
 *   Or: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, AZURE_VAULT_URL, AZURE_KMS_KEY_ID
 *
 * IMPORTANT: This stub does NOT provide security. Do not ship code that
 * silently accepts this provider without real credentials configured.
 */

import type {
  VaultProvider,
  VaultProviderName,
} from "./index.js";
import {
  VaultProviderNotConfiguredError,
  VaultProviderUnsupportedError,
} from "./index.js";

export class KmsVaultProvider implements VaultProvider {
  readonly providerName: VaultProviderName = "kms";

  isConfigured(): boolean {
    // Not implemented — check returns false until real credentials are configured
    return false;
  }

  supportsLiveSigning(): boolean {
    return true;
  }

  requiresUnlock(): boolean {
    // KMS may not require explicit vault unlock, depending on configuration
    return false;
  }

  getSafetyLevel(): "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION" {
    return "PRODUCTION";
  }

  getWarning(): string | null {
    if (!this.isConfigured()) {
      return (
        "KMS provider is not configured. Set VAULT_PROVIDER=kms and configure " +
        "KMS credentials. See docs/CUSTODY_HARDENING_ROADMAP.md."
      );
    }
    return null;
  }

  encryptSecret(_secret: string, _masterKey: Buffer): string {
    throw new VaultProviderNotConfiguredError("kms");
  }

  decryptSecret(_encryptedSecret: string, _masterKey: Buffer): string {
    throw new VaultProviderNotConfiguredError("kms");
  }

  async rotateMasterKey(
    _oldKey: Buffer,
    _newKey: Buffer
  ): Promise<void> {
    throw new VaultProviderUnsupportedError("rotateMasterKey", "kms");
  }
}

export const kmsVaultProvider = new KmsVaultProvider();