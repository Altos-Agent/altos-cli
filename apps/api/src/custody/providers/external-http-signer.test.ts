import { describe, it, expect } from "vitest";
import { ExternalHttpSignerProvider } from "./external-http-signer.ts";
import { CustodyProviderNotConfiguredError } from "./base.js";

describe("ExternalHttpSignerProvider", () => {
  describe("isConfigured", () => {
    it("returns false when URL is missing", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.isConfigured()).toBe(false);
    });

    it("returns false when token is missing", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.isConfigured()).toBe(false);
    });

    it("returns false when both URL and token are empty", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.isConfigured()).toBe(false);
    });

    it("returns true when URL and token are present", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe("getSafetyLevel", () => {
    it("returns DEV_ONLY when not configured", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.getSafetyLevel()).toBe("DEV_ONLY");
    });

    it("returns PRODUCTION when configured", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.getSafetyLevel()).toBe("PRODUCTION");
    });
  });

  describe("supportsPolicy", () => {
    it("returns true", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.supportsPolicy()).toBe(true);
    });
  });

  describe("getWarning", () => {
    it("returns warning when not configured", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      const warning = provider.getWarning();
      expect(warning).toContain("not configured");
      expect(warning).toContain("EXTERNAL_SIGNER_URL");
    });

    it("returns null when configured", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.getWarning()).toBeNull();
    });
  });

  describe("signTransaction", () => {
    it("throws CustodyProviderNotConfiguredError when not configured", async () => {
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      await expect(provider.signTransaction({
        from: "0x1234567890123456789012345678901234567890",
        to: "0xDef4567890123456789012345678901234567890",
        value: "0",
        data: "0x095ea7b3000000",
        gasLimit: "21000",
        chainId: 8453,
      })).rejects.toThrow(CustodyProviderNotConfiguredError);
    });
  });

  describe("providerType", () => {
    it("returns 'external-http-signer'", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.providerType).toBe("external-http-signer");
    });
  });
});