import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import bcrypt from "bcryptjs";

export interface TOTPServiceOptions {
  issuer: string;
  secretLength?: number;
}

export interface GeneratedSecret {
  secret: string;
  otpauthUri: string;
  qrCodeBase64: string;
}

export class TOTPService {
  private readonly issuer: string;
  private readonly secretLength: number;

  constructor(options: TOTPServiceOptions) {
    this.issuer = options.issuer ?? "BaseOrchestrator";
    this.secretLength = options.secretLength ?? 20;
  }

  async generateSecret(): Promise<GeneratedSecret> {
    const secret = generateSecret({ length: this.secretLength });
    const otpauthUri = generateURI({ issuer: this.issuer, label: "operator", secret });
    const qrCodeBase64 = await QRCode.toDataURL(otpauthUri);
    return { secret, otpauthUri, qrCodeBase64 };
  }

  async validateCode(code: string, secret: string): Promise<boolean> {
    try {
      const result = await verify({ token: code, secret });
      return result.valid;
    } catch {
      return false;
    }
  }
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () =>
    randomBytes(4).toString("hex").toUpperCase()
  );
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyRecoveryCode(code: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(code, hashed);
}

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;

export function encryptTotpSecret(secret: string, sessionSecret: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = pbkdf2Sync(sessionSecret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString("base64");
}

export function decryptTotpSecret(encrypted: string, sessionSecret: string): string {
  const buf = Buffer.from(encrypted, "base64");
  const salt = buf.subarray(0, SALT_LENGTH);
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = pbkdf2Sync(sessionSecret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}