/**
 * Local file-based vault provider.
 *
 * SECURITY WARNING: This provider stores the master key as a plaintext file
 * on the filesystem. This is acceptable ONLY for local development and demo
 * environments. It is NOT acceptable for production use with real funds.
 *
 * Risks of file-based storage:
 * - File permissions can be misconfigured, exposing the key
 * - Backup copies may be made inadvertently
 * - The key is stored alongside the application data
 * - No hardware-backed protection against key extraction
 * - No audit trail of key access
 *
 * For production use with meaningful funds, migrate to a KMS or HSM provider.
 * See docs/CUSTODY_HARDENING_ROADMAP.md.
 */

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  type VaultProvider,
  type VaultProviderName,
} from "./index.js";
import { getRuntimeConfig } from "../../config/runtime-config.js";

const algorithm = "aes-256-gcm";
const currentEncryptionVersion = 1;
const ivBytes = 12;
const authTagBytes = 16;
const masterKeyBytes = 32;

export class WalletVaultError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "WalletVaultError";
  }
}

export interface EncryptedPrivateKeyPayload {
  version: number;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
}

const getMasterKeyPath = () =>
  resolve(getRuntimeConfig().masterKeyFile);

export const loadOrCreateMasterKey = async (
  masterKeyPath = getMasterKeyPath()
) => {
  try {
    const existing = await readFile(masterKeyPath);
    if (existing.length !== masterKeyBytes) {
      throw new WalletVaultError(
        "Master key file must contain exactly 32 bytes",
        500
      );
    }
    return existing;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code !== "ENOENT"
    ) {
      throw error;
    }
  }

  const masterKey = randomBytes(masterKeyBytes);
  await mkdir(dirname(masterKeyPath), { recursive: true, mode: 0o700 });
  await writeFile(masterKeyPath, masterKey, { mode: 0o600, flag: "wx" });

  try {
    await chmod(masterKeyPath, 0o600);
  } catch {
    // Some filesystems do not support POSIX permissions.
  }

  return masterKey;
};

const encryptAesGcm = (secret: string, masterKey: Buffer): string => {
  if (masterKey.length !== masterKeyBytes) {
    throw new WalletVaultError("Invalid master key length", 500);
  }

  const iv = randomBytes(ivBytes);
  const cipher = createCipheriv(algorithm, masterKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPrivateKeyPayload = {
    version: currentEncryptionVersion,
    algorithm,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
};

const decryptAesGcm = (encryptedSecret: string, masterKey: Buffer): string => {
  try {
    const payload = JSON.parse(
      Buffer.from(encryptedSecret, "base64url").toString("utf8")
    ) as EncryptedPrivateKeyPayload;

    if (
      payload.version !== currentEncryptionVersion ||
      payload.algorithm !== algorithm
    ) {
      throw new Error("unsupported encryption payload");
    }

    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");

    if (iv.length !== ivBytes || authTag.length !== authTagBytes) {
      throw new Error("invalid encryption payload");
    }

    const decipher = createDecipheriv(algorithm, masterKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new WalletVaultError("Failed to decrypt encrypted secret", 500);
  }
};

export class LocalFileVaultProvider implements VaultProvider {
  readonly providerName: VaultProviderName = "local-file";

  isConfigured(): boolean {
    try {
      const config = getRuntimeConfig();
      return config.masterKeyFile !== undefined && config.masterKeyFile.length > 0;
    } catch {
      return false;
    }
  }

  supportsLiveSigning(): boolean {
    return true; // Can technically sign, but not recommended for production
  }

  requiresUnlock(): boolean {
    return true; // Operator must unlock via vault-lock.ts
  }

  getSafetyLevel(): "DEV_ONLY" | "PRODUCTION_CANDIDATE" | "PRODUCTION" {
    // File-based storage is not production-ready for meaningful funds
    return "DEV_ONLY";
  }

  getWarning(): string | null {
    return (
      "Local file vault is active. " +
      "The master key is stored on the filesystem and is not protected by hardware security. " +
      "This configuration is suitable for local development and demo only. " +
      "Do not use this for production or with real funds. " +
      "See docs/CUSTODY_HARDENING_ROADMAP.md to migrate to a secure provider."
    );
  }

  encryptSecret(secret: string, masterKey: Buffer): string {
    return encryptAesGcm(secret, masterKey);
  }

  decryptSecret(encryptedSecret: string, masterKey: Buffer): string {
    return decryptAesGcm(encryptedSecret, masterKey);
  }
}

export const localFileVaultProvider = new LocalFileVaultProvider();