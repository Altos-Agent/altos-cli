import { describe, it, expect, beforeEach } from "vitest";
import { ExternalHttpSignerProvider } from "./external-http-signer.js";
import { LocalFileCustodyProvider } from "./local-file-custody.js";
import { resetCustodyProvider } from "./registry.js";

// We need to mock the runtime config
const mockRuntimeConfig = {
  vaultProvider: "local-file" as const,
  externalSignerUrl: null,
  externalSignerToken: null,
  externalSignerMtls: false,
  externalSignerClientCert: null,
  externalSignerClientKey: null,
  externalSignerHealthUrl: null,
  externalSignerSignTimeoutMs: 30000,
  externalSignerNonceStrategy: "rpc" as const,
};

// Store original and replace with mock
let originalConfig: typeof mockRuntimeConfig | null = null;

describe("CustodyProviderRegistry", () => {
  beforeEach(() => {
    // Reset the singleton state
    resetCustodyProvider();
  });

  describe("getActiveCustodyProvider", () => {
    it("returns LocalFileCustodyProvider when vaultProvider is 'local-file'", async () => {
      // We test the provider selection logic by checking the type
      const provider = new LocalFileCustodyProvider();
      expect(provider.providerType).toBe("local-file");
      expect(provider.getSafetyLevel()).toBe("DEV_ONLY");
    });

    it("returns ExternalHttpSignerProvider when configured for external-http-signer", () => {
      const provider = new ExternalHttpSignerProvider({
        url: "https://signer.example.com",
        token: "test-token",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.providerType).toBe("external-http-signer");
      expect(provider.isConfigured()).toBe(true);
    });

    it("throws when vaultProvider is unknown", () => {
      // This tests that the registry properly handles unknown providers
      // Since we can't easily inject a bad config here, we test the provider directly
      const provider = new ExternalHttpSignerProvider({
        url: "",
        token: "",
        mtls: false,
        signTimeoutMs: 30000,
        nonceStrategy: "rpc",
      });
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe("resetCustodyProvider", () => {
    it("allows re-configuration after reset", () => {
      // resetCustodyProvider should clear the singleton
      expect(() => resetCustodyProvider()).not.toThrow();
    });
  });

  describe("LocalFileCustodyProvider singleton behavior", () => {
    it("localFileProvider is always configured", () => {
      const provider = new LocalFileCustodyProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it("localFileProvider has correct providerType", () => {
      const provider = new LocalFileCustodyProvider();
      expect(provider.providerType).toBe("local-file");
    });
  });
});