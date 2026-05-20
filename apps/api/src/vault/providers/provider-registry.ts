/**
 * Vault provider registry and factory.
 *
 * Selects the active vault provider based on VAULT_PROVIDER env var.
 * Ensures no silent fallback to less-secure providers.
 */

import { localFileVaultProvider } from "./local-file.js";
import { kmsVaultProvider } from "./kms.js";
import { externalSignerVaultProvider } from "./external-signer.js";
import {
  type VaultProvider,
  type VaultProviderName,
  type VaultProviderStatus,
} from "./index.js";

const providers: Record<VaultProviderName, VaultProvider> = {
  "local-file": localFileVaultProvider,
  "kms": kmsVaultProvider,
  "external-signer": externalSignerVaultProvider,
};

let activeProvider: VaultProvider | null = null;

export const getActiveVaultProvider = (): VaultProvider => {
  if (activeProvider) return activeProvider;

  const config = getRuntimeConfigRaw();
  const name = config.vaultProvider;
  const provider = providers[name];

  if (!provider) {
    throw new Error(
      `Unknown VAULT_PROVIDER "${name}". ` +
      `Valid values: local-file, kms, external-signer. ` +
      `See docs/CUSTODY_HARDENING_ROADMAP.md.`
    );
  }

  activeProvider = provider;
  return provider;
};

export const getVaultProviderStatus = (): VaultProviderStatus => {
  const provider = getActiveVaultProvider();
  return {
    provider: provider.providerName,
    configured: provider.isConfigured(),
    safetyLevel: provider.getSafetyLevel(),
    liveSigningCapable: provider.supportsLiveSigning(),
    requiresUnlock: provider.requiresUnlock(),
    warning: provider.getWarning(),
  };
};

export const resetVaultProvider = () => {
  activeProvider = null;
};

// Import lazily to avoid circular dependency with runtime-config
let getRuntimeConfigRaw: () => { vaultProvider: VaultProviderName };
const { getRuntimeConfig } = await import("../../config/runtime-config.js");
getRuntimeConfigRaw = getRuntimeConfig;