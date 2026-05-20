import { describe, expect, it } from "vitest";
import {
  formatTokenAmount,
  parseTokenAmount,
  safeDecimalStringSchema
} from "@base-orchestrator/shared";

describe("token amount conversion", () => {
  it("parses and formats USDC amounts with 6 decimals", () => {
    expect(parseTokenAmount("12.345678", 6)).toBe(12_345_678n);
    expect(formatTokenAmount(12_345_678n, 6)).toBe("12.345678");
  });

  it("parses and formats WETH and DAI amounts with 18 decimals", () => {
    expect(parseTokenAmount("0.000000000000000001", 18)).toBe(1n);
    expect(parseTokenAmount("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe("1.5");
  });

  it("handles small decimal-token amounts without 1e18 scaling", () => {
    expect(parseTokenAmount("1.23", 2)).toBe(123n);
    expect(formatTokenAmount(123n, 2)).toBe("1.23");
  });

  it("rejects unsupported decimal strings and excess precision", () => {
    expect(() => safeDecimalStringSchema.parse("1e-3")).toThrow();
    expect(() => safeDecimalStringSchema.parse("-1")).toThrow();
    expect(() => parseTokenAmount("1.000001", 4)).toThrow(
      "Too many decimal places"
    );
  });

  it("rejects invalid token decimal metadata", () => {
    expect(() => parseTokenAmount("1", 37)).toThrow();
    expect(() => formatTokenAmount(1n, -1)).toThrow();
  });
});
