import { describe, expect, it, beforeEach } from "vitest";
import { TOTPService, generateRecoveryCodes, encryptTotpSecret, decryptTotpSecret, hashRecoveryCode, verifyRecoveryCode } from "./mfa-service.js";

describe("TOTPService", () => {
  let service: TOTPService;

  beforeEach(() => {
    service = new TOTPService({ issuer: "TestApp", secretLength: 20 });
  });

  it("generates a valid TOTP secret", async () => {
    const result = await service.generateSecret();
    expect(result.secret).toHaveLength(32); // Base32 of 20 bytes
    expect(result.otpauthUri).toContain("otpauth://totp/");
    expect(result.qrCodeBase64).toBeDefined();
    expect(result.qrCodeBase64).toMatch(/^data:image\/png;base64,/);
  });

  it("validates a correct TOTP code", async () => {
    const { secret } = await service.generateSecret();
    const { generate } = await import("otplib");
    const code = await generate({ secret });
    const valid = await service.validateCode(code, secret);
    expect(valid).toBe(true);
  });

  it("rejects an incorrect TOTP code", async () => {
    const { secret } = await service.generateSecret();
    const valid = await service.validateCode("000000", secret);
    expect(valid).toBe(false);
  });
});

describe("Recovery codes", () => {
  it("generates 8 recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    codes.forEach(code => {
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });
  });

  it("hash and verify recovery code", async () => {
    const code = "ABCD1234";
    const hashed = await hashRecoveryCode(code);
    const verified = await verifyRecoveryCode(code, hashed);
    expect(verified).toBe(true);
  });

  it("rejects wrong recovery code", async () => {
    const hashed = await hashRecoveryCode("ABCD1234");
    const verified = await verifyRecoveryCode("XXXX5678", hashed);
    expect(verified).toBe(false);
  });
});

describe("TOTP secret encryption", () => {
  it("encrypts and decrypts correctly", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const sessionSecret = "0123456789abcdef0123456789abcdef";
    const encrypted = encryptTotpSecret(secret, sessionSecret);
    expect(encrypted).not.toBe(secret);
    const decrypted = decryptTotpSecret(encrypted, sessionSecret);
    expect(decrypted).toBe(secret);
  });
});