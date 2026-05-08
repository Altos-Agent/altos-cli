import { describe, expect, it } from "vitest";
import {
  buildBasescanAddressLink,
  buildBasescanTokenLink,
  buildBasescanTransactionLink
} from "./basescan.js";

describe("basescan link builders", () => {
  it("builds Base Mainnet explorer links for addresses, transactions, and tokens", () => {
    const address = "0x0000000000000000000000000000000000000001";
    const txHash =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    expect(buildBasescanAddressLink(address)).toBe(
      "https://basescan.org/address/0x0000000000000000000000000000000000000001"
    );
    expect(buildBasescanTransactionLink(txHash)).toBe(
      "https://basescan.org/tx/0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    expect(buildBasescanTokenLink(address)).toBe(
      "https://basescan.org/token/0x0000000000000000000000000000000000000001"
    );
  });
});
