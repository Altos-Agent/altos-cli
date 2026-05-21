import { getAddress } from "ethers";
import type {
  CustodyProvider,
  SafetyLevel,
  SignRequest,
  SignResult,
  WalletMetadata,
} from "./base.js";

export class LocalFileCustodyProvider implements CustodyProvider {
  readonly providerType = "local-file" as const;

  isConfigured(): boolean {
    return true; // Always configured — local file is the default
  }

  getSafetyLevel(): SafetyLevel {
    return "DEV_ONLY";
  }

  supportsPolicy(): boolean {
    return false; // Local file does not support external policy enforcement
  }

  getWarning(): string | null {
    return (
      "Local file vault is active — NOT FOR PRODUCTION USE. " +
      "The master key is stored on the filesystem and is not protected by hardware security. " +
      "This configuration is suitable for local development and demo only. " +
      "Do not use this for production or with real funds. " +
      "See docs/LOCAL_FILE_VAULT_LIMITATIONS.md and docs/CUSTODY_HARDENING_ROADMAP.md."
    );
  }

  async signTransaction(_request: SignRequest): Promise<SignResult> {
    // This should only be called in dev/dry-run/tiny mode
    // In production this provider will fail boot due to env.ts enforcement
    throw new Error(
      "LocalFileCustodyProvider.signTransaction is not implemented for production use. " +
      "The local-file provider cannot sign transactions in production. " +
      "Use VAULT_PROVIDER=external-http-signer and configure EXTERNAL_SIGNER_URL/TOKEN. " +
      "See docs/EXTERNAL_SIGNER_SETUP.md."
    );
  }

  async importWallet(privateKey: string, _metadata: WalletMetadata): Promise<string> {
    // For local file, we just derive the address from the private key
    // ethers.js Wallet is used ONLY for address derivation, not signing
    const { Wallet } = await import("ethers");
    const wallet = new Wallet(privateKey);
    return getAddress(wallet.address);
  }

  async registerAddress(address: string, _metadata: WalletMetadata): Promise<string> {
    return getAddress(address);
  }

  async getAddress(_walletId: string): Promise<string> {
    throw new Error(
      "LocalFileCustodyProvider.getAddress requires wallet DB lookup. " +
      "Use the wallet-service for address lookups."
    );
  }
}