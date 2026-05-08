import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Wallet, getAddress } from "ethers";

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

export const getMasterKeyPath = () =>
  resolve(process.env.MASTER_KEY_FILE ?? ".local/master.key");

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
      error.code !== "ENOENT"
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

export const encryptSecret = (
  secret: string,
  masterKey: Buffer
): string => {
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

export const decryptSecret = (
  encryptedSecret: string,
  masterKey: Buffer
): string => {
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

export const encryptPrivateKey = (privateKey: string, masterKey: Buffer) =>
  encryptSecret(privateKey, masterKey);

export const decryptPrivateKey = (
  encryptedPrivateKey: string,
  masterKey: Buffer
) => {
  try {
    return decryptSecret(encryptedPrivateKey, masterKey);
  } catch {
    throw new WalletVaultError("Failed to decrypt wallet private key", 500);
  }
};

export const deriveAddressFromPrivateKey = (privateKey: string) => {
  try {
    return getAddress(new Wallet(privateKey).address);
  } catch {
    throw new WalletVaultError("Invalid private key");
  }
};

export const normalizeAddress = (address: string) => {
  try {
    return getAddress(address);
  } catch {
    throw new WalletVaultError("Invalid wallet address");
  }
};

export const assertPrivateKeyMatchesAddress = (
  privateKey: string,
  address: string
) => {
  const derivedAddress = deriveAddressFromPrivateKey(privateKey);
  const normalizedAddress = normalizeAddress(address);

  if (
    derivedAddress.length !== normalizedAddress.length ||
    !timingSafeEqual(Buffer.from(derivedAddress), Buffer.from(normalizedAddress))
  ) {
    throw new WalletVaultError("Private key does not match wallet address");
  }

  return derivedAddress;
};

export const getEncryptionVersion = () => currentEncryptionVersion;
