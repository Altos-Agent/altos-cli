import { describe, it, expect, beforeEach } from "vitest";
import { LocalFileCustodyProvider } from "./local-file-custody.ts";

describe("LocalFileCustodyProvider", () => {
  let provider: LocalFileCustodyProvider;

  beforeEach(() => {
    provider = new LocalFileCustodyProvider();
  });

  describe("providerType", () => {
    it("returns 'local-file'", () => {
      expect(provider.providerType).toBe("local-file");
    });
  });

  describe("isConfigured", () => {
    it("returns true always", () => {
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe("getSafetyLevel", () => {
    it("returns DEV_ONLY", () => {
      expect(provider.getSafetyLevel()).toBe("DEV_ONLY");
    });
  });

  describe("supportsPolicy", () => {
    it("returns false", () => {
      expect(provider.supportsPolicy()).toBe(false);
    });
  });

  describe("getWarning", () => {
    it("returns a warning message", () => {
      const warning = provider.getWarning();
      expect(warning).toBeTruthy();
      expect(warning).toContain("NOT FOR PRODUCTION USE");
      expect(warning).toContain("LOCAL_FILE_VAULT_LIMITATIONS.md");
      expect(warning).toContain("CUSTODY_HARDENING_ROADMAP.md");
    });

    it("mentions filesystem is not protected", () => {
      const warning = provider.getWarning();
      expect(warning).toContain("not protected by hardware security");
    });
  });

  describe("signTransaction", () => {
    it("throws an error explaining this is not for production use", async () => {
      await expect(provider.signTransaction({
        from: "0x1234567890123456789012345678901234567890",
        to: "0xDef4567890123456789012345678901234567890",
        value: "0",
        data: "0x095ea7b3",
        gasLimit: "21000",
        chainId: 8453,
      })).rejects.toThrow(/not implemented for production use/);
    });
  });

  describe("importWallet", () => {
    it("derives address from private key using ethers Wallet (address only)", async () => {
      // Test with a known private key
      const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const address = await provider.importWallet(privateKey, { name: "Test Wallet" });
      expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    it("normalizes address to checksum format", async () => {
      const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const address = await provider.importWallet(privateKey, { name: "Test" });
      // ethers.getAddress returns checksum address
      expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });
  });

  describe("registerAddress", () => {
    it("normalizes and returns the address", async () => {
      const address = await provider.registerAddress(
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        { name: "Watch Wallet" }
      );
      expect(address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    });

    it("throws for invalid address", async () => {
      await expect(provider.registerAddress("invalid", { name: "Test" }))
        .rejects.toThrow();
    });
  });

  describe("getAddress", () => {
    it("throws an error explaining wallet-service should be used", async () => {
      await expect(provider.getAddress("wallet-123"))
        .rejects.toThrow(/wallet-service/);
    });
  });
});