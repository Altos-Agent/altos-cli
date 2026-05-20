import { describe, expect, it, vi } from "vitest";
import { api, isApiError } from "./api";

describe("web API read error handling", () => {
  it("returns a structured error instead of an empty wallet list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );

    const result = await api.getWallets();

    expect(isApiError(result)).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      status: 0,
      message: "API unavailable"
    });
  });

  it("returns structured errors for runtime status instead of null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );

    const result = await api.getRuntimeStatus();

    expect(isApiError(result)).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      status: 0,
      message: "API unavailable"
    });
  });
});
