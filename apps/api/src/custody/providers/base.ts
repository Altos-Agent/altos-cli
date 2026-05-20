export type CustodyProviderType =
  | "local-file"
  | "external-http-signer"
  | "hashicorp-vault-transit"
  | "aws-kms";

export type SafetyLevel = "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION";

export type ExternalSignerHealth = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface WalletMetadata {
  name: string;
  maxTradeUsd?: string | null;
  maxDailyTrades?: number | null;
  maxDailyLossUsd?: string | null;
  maxGasUsd?: string | null;
  notes?: string | null;
}

export interface SignRequest {
  from: string;
  to: string;
  value: string;
  data: string;
  gasLimit: string;
  chainId: number;
  nonce?: number;
}

export interface SignResult {
  v: number;
  r: string;
  s: string;
  hash?: string;
}

export interface CustodyProviderStatus {
  provider: CustodyProviderType;
  configured: boolean;
  safetyLevel: SafetyLevel;
  liveSigningCapable: boolean;
  supportsPolicy: boolean;
  warning: string | null;
  externalSignerHealth?: ExternalSignerHealth;
}

export interface CustodyProvider {
  readonly providerType: CustodyProviderType;

  importWallet?(privateKey: string, metadata: WalletMetadata): Promise<string>;
  registerAddress?(address: string, metadata: WalletMetadata): Promise<string>;
  signTransaction(request: SignRequest): Promise<SignResult>;
  getAddress?(walletId: string): Promise<string>;
  healthCheck?(): Promise<ExternalSignerHealth>;
  supportsPolicy(): boolean;
  getSafetyLevel(): SafetyLevel;
  getWarning(): string | null;
  isConfigured(): boolean;
}

export class CustodyProviderNotConfiguredError extends Error {
  constructor(provider: CustodyProviderType) {
    super(
      `Custody provider "${provider}" is not configured. ` +
      `Set the required environment variables or switch to a configured provider. ` +
      `See docs/EXTERNAL_SIGNER_SETUP.md.`
    );
    this.name = "CustodyProviderNotConfiguredError";
  }
}

export class CustodyProviderUnsupportedError extends Error {
  constructor(operation: string, provider: CustodyProviderType) {
    super(
      `Provider "${provider}" does not support ${operation}.`
    );
    this.name = "CustodyProviderUnsupportedError";
  }
}

export class SignerPolicyError extends Error {
  constructor(message: string, public readonly reasons: string[] = []) {
    super(`Signer policy denied: ${message}`);
    this.name = "SignerPolicyError";
  }
}