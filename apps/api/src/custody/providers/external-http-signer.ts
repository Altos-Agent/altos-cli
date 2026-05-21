import type {
  CustodyProvider,
  ExternalSignerHealth,
  SignRequest,
  SignResult,
  WalletMetadata,
} from "./base.js";
import {
  CustodyProviderNotConfiguredError,
  type SafetyLevel,
} from "./base.js";

export interface ExternalSignerConfig {
  url: string;
  token: string;
  mtls: boolean;
  clientCert?: string;
  clientKey?: string;
  healthCheckUrl?: string;
  signTimeoutMs: number;
  nonceStrategy: "rpc" | "managed";
}

export class ExternalHttpSignerProvider implements CustodyProvider {
  readonly providerType = "external-http-signer" as const;

  constructor(private readonly config: ExternalSignerConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.url && this.config.token);
  }

  getSafetyLevel(): SafetyLevel {
    return this.isConfigured() ? "PRODUCTION" : "DEV_ONLY";
  }

  supportsPolicy(): boolean {
    return true;
  }

  getWarning(): string | null {
    if (!this.isConfigured()) {
      return (
        "External HTTP signer is not configured. Set EXTERNAL_SIGNER_URL and " +
        "EXTERNAL_SIGNER_TOKEN. See docs/EXTERNAL_SIGNER_SETUP.md."
      );
    }
    return null;
  }

  async signTransaction(request: SignRequest): Promise<SignResult> {
    if (!this.isConfigured()) {
      throw new CustodyProviderNotConfiguredError("external-http-signer");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.signTimeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.token}`,
      };

      if (this.config.mtls && this.config.clientCert) {
        headers["X-Client-Cert"] = this.config.clientCert;
      }

      const response = await fetch(`${this.config.url}/sign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: request.from,
          to: request.to,
          value: request.value,
          data: request.data,
          gasLimit: request.gasLimit,
          chainId: request.chainId,
          nonce: request.nonce,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`External signer returned ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as { v: number; r: string; s: string; hash?: string };

      return {
        v: result.v,
        r: result.r,
        s: result.s,
        hash: result.hash,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("External signer request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<ExternalSignerHealth> {
    if (!this.config.healthCheckUrl) {
      return "HEALTHY";
    }

    try {
      const response = await fetch(this.config.healthCheckUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.token}`,
        },
      });

      if (response.ok) {
        return "HEALTHY";
      }
      if (response.status >= 500) {
        return "UNAVAILABLE";
      }
      return "DEGRADED";
    } catch {
      return "UNAVAILABLE";
    }
  }

  async importWallet(privateKey: string, metadata: WalletMetadata): Promise<string> {
    if (!this.isConfigured()) {
      throw new CustodyProviderNotConfiguredError("external-http-signer");
    }

    const response = await fetch(`${this.config.url}/wallets/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ privateKey, metadata }),
    });

    if (!response.ok) {
      throw new Error(`Failed to import wallet: ${response.statusText}`);
    }

    const result = await response.json() as { address: string };
    return result.address;
  }

  async registerAddress(address: string, metadata: WalletMetadata): Promise<string> {
    if (!this.isConfigured()) {
      throw new CustodyProviderNotConfiguredError("external-http-signer");
    }

    const response = await fetch(`${this.config.url}/wallets/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({ address, metadata }),
    });

    if (!response.ok) {
      throw new Error(`Failed to register address: ${response.statusText}`);
    }

    const result = await response.json() as { address: string };
    return result.address;
  }

  async getAddress(walletId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new CustodyProviderNotConfiguredError("external-http-signer");
    }

    const response = await fetch(`${this.config.url}/wallets/${walletId}/address`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.config.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get address: ${response.statusText}`);
    }

    const result = await response.json() as { address: string };
    return result.address;
  }
}