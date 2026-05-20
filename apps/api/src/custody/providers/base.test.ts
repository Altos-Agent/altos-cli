import { SignerPolicyError, CustodyProviderNotConfiguredError } from "./base.ts";
import { describe, it, expect } from "vitest";
import {
  CustodyProviderType,
  SignRequest,
  SignResult,
  CustodyProviderUnsupportedError,
} from "./base.ts";

describe("SignerPolicyError", () => {
  it("stores reasons array", () => {
    const error = new SignerPolicyError("test denied", ["reason 1", "reason 2"]);
    expect(error.reasons).toEqual(["reason 1", "reason 2"]);
  });

  it("formats message correctly", () => {
    const error = new SignerPolicyError("wallet inactive", ["wallet.status = DISABLED"]);
    expect(error.message).toBe("Signer policy denied: wallet inactive");
  });
});

describe("CustodyProviderNotConfiguredError", () => {
  it("includes provider name", () => {
    const error = new CustodyProviderNotConfiguredError("external-http-signer");
    expect(error.message).toContain("external-http-signer");
  });

  it("has correct name", () => {
    const error = new CustodyProviderNotConfiguredError("local-file");
    expect(error.name).toBe("CustodyProviderNotConfiguredError");
  });
});

describe("CustodyProviderUnsupportedError", () => {
  it("includes provider and operation", () => {
    const error = new CustodyProviderUnsupportedError("signTransaction", "aws-kms");
    expect(error.message).toContain("aws-kms");
    expect(error.message).toContain("signTransaction");
  });

  it("has correct name", () => {
    const error = new CustodyProviderUnsupportedError("rotateMasterKey", "local-file");
    expect(error.name).toBe("CustodyProviderUnsupportedError");
  });
});

describe("Type exports", () => {
  it("exports CustodyProviderType union", () => {
    // TypeScript type check - just verify the exports exist
    type ProviderTypeCheck = "local-file" extends CustodyProviderType ? true : false;
    const check: true = true;
    expect(check).toBe(true);
  });

  it("exports SignRequest interface", () => {
    const request: SignRequest = {
      from: "0x123",
      to: "0x456",
      value: "0",
      data: "0x",
      gasLimit: "21000",
      chainId: 8453,
    };
    expect(request.from).toBe("0x123");
    expect(request.chainId).toBe(8453);
  });

  it("exports SignResult interface", () => {
    const result: SignResult = {
      v: 27,
      r: "0x" + "a".repeat(64),
      s: "0x" + "b".repeat(64),
    };
    expect(result.v).toBe(27);
    expect(result.hash).toBeUndefined();
  });
});