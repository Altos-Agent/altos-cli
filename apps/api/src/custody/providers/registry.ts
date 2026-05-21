import type { CustodyProvider, CustodyProviderStatus, ExternalSignerHealth } from "./base.js";
import { ExternalHttpSignerProvider } from "./external-http-signer.js";
import { LocalFileCustodyProvider } from "./local-file-custody.js";
import { getRuntimeConfig } from "../../config/runtime-config.js";

let activeProvider: CustodyProvider | null = null;

const localFileProvider = new LocalFileCustodyProvider();

export const getActiveCustodyProvider = (): CustodyProvider => {
  if (activeProvider) return activeProvider;

  const config = getRuntimeConfig();

  if (config.vaultProvider === "external-http-signer" || config.vaultProvider === "external-signer") {
    const configOptions: {
      url: string;
      token: string;
      mtls: boolean;
      signTimeoutMs: number;
      nonceStrategy: "rpc" | "managed";
      clientCert?: string;
      clientKey?: string;
      healthCheckUrl?: string;
    } = {
      url: config.externalSignerUrl || "",
      token: config.externalSignerToken || "",
      mtls: config.externalSignerMtls,
      signTimeoutMs: config.externalSignerSignTimeoutMs,
      nonceStrategy: config.externalSignerNonceStrategy,
    };

    if (config.externalSignerClientCert) {
      configOptions.clientCert = config.externalSignerClientCert;
    }
    if (config.externalSignerClientKey) {
      configOptions.clientKey = config.externalSignerClientKey;
    }
    if (config.externalSignerHealthUrl) {
      configOptions.healthCheckUrl = config.externalSignerHealthUrl;
    }

    const provider = new ExternalHttpSignerProvider(configOptions);
    activeProvider = provider;
  } else {
    activeProvider = localFileProvider;
  }

  return activeProvider;
};

export const getCustodyProviderStatus = async (): Promise<CustodyProviderStatus> => {
  const provider = getActiveCustodyProvider();

  const status: CustodyProviderStatus = {
    provider: provider.providerType,
    configured: provider.isConfigured(),
    safetyLevel: provider.getSafetyLevel(),
    liveSigningCapable: provider.supportsPolicy(),
    supportsPolicy: provider.supportsPolicy(),
    warning: provider.getWarning(),
  };

  if (provider.providerType === "external-http-signer" && provider.healthCheck) {
    status.externalSignerHealth = await provider.healthCheck();
  }

  return status;
};

export const resetCustodyProvider = () => {
  activeProvider = null;
};