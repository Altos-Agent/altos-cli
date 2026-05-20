/**
 * Vault provider interface.
 *
 * A vault provider abstracts how the master key is stored and accessed.
 * All providers expose the same encryption/decryption interface used by
 * wallet-vault.ts. The specific provider is selected at startup via VAULT_PROVIDER.
 *
 * Design principles:
 * - No secrets in memory longer than necessary.
 * - No provider ever claims to be more secure than it actually is.
 * - A "not configured" provider throws a clear error, not a silent fallback.
 */

export type VaultProviderName = "local-file" | "kms" | "external-signer";

export interface VaultProviderStatus {
  provider: VaultProviderName;
  configured: boolean;
  safetyLevel: "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION";
  liveSigningCapable: boolean;
  requiresUnlock: boolean;
  warning: string | null;
}

export interface VaultProvider {
  /**
   * The provider's canonical name.
   */
  readonly providerName: VaultProviderName;

  /**
   * Whether this provider is fully configured (credentials present, etc.).
   * Returns false if setup is incomplete — callers must not proceed.
   */
  isConfigured(): boolean;

  /**
   * Whether this provider supports live transaction signing.
   * A provider that returns false should not be used for live signing.
   */
  supportsLiveSigning(): boolean;

  /**
   * Whether the operator must explicitly unlock the vault before use.
   * Local-file requires unlock; KMS/external-signer may not.
   */
  requiresUnlock(): boolean;

  /**
   * Human-readable safety assessment of this provider.
   * "DEV_ONLY" = not suitable for real funds under any circumstances.
   * "PRODUCTION_CANDIDATE" = meets baseline security bar, operator must evaluate.
   * "PRODUCTION" = meets full security bar for meaningful funds.
   */
  getSafetyLevel(): "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION";

  /**
   * Short warning message to display in the UI, or null if no warning.
   * Always returns a message for DEV_ONLY providers.
   */
  getWarning(): string | null;

  /**
   * Encrypt a secret using the provider's underlying mechanism.
   * The master key material must be available in memory for this call.
   *
   * @param secret - The plaintext secret to encrypt
   * @param masterKey - The 32-byte master key
   * @returns base64url-encoded encrypted payload
   * @throws WalletVaultError if encryption fails
   */
  encryptSecret(secret: string, masterKey: Buffer): string;

  /**
   * Decrypt a secret using the provider's underlying mechanism.
   *
   * @param encryptedSecret - base64url-encoded encrypted payload
   * @param masterKey - The 32-byte master key
   * @returns plaintext secret
   * @throws WalletVaultError if decryption fails
   */
  decryptSecret(encryptedSecret: string, masterKey: Buffer): string;

  /**
   * Rotate the master key. Not all providers support this.
   * If not supported, throws WalletVaultError with code 501.
   */
  rotateMasterKey?(oldKey: Buffer, newKey: Buffer): Promise<void>;
}

/**
 * Thrown when a provider is used before being configured.
 */
export class VaultProviderNotConfiguredError extends Error {
  constructor(provider: VaultProviderName) {
    super(
      `Vault provider "${provider}" is not configured. ` +
      `Set the required environment variables or switch to a configured provider. ` +
      `See docs/CUSTODY_HARDENING_ROADMAP.md for setup instructions.`
    );
    this.name = "VaultProviderNotConfiguredError";
  }
}

/**
 * Thrown when a provider does not support an operation.
 */
export class VaultProviderUnsupportedError extends Error {
  constructor(operation: string, provider: VaultProviderName) {
    super(
      `Provider "${provider}" does not support ${operation}. ` +
      `This provider must be fully configured before this operation is attempted.`
    );
    this.name = "VaultProviderUnsupportedError";
  }
}