import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTelegramMessage,
  maskTelegramToken,
  sendTelegramMessage
} from "./telegram.js";

describe("telegram notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("masks bot tokens without returning the decrypted value", () => {
    expect(maskTelegramToken("123456:ABCDEFghijklmnopqrstuvwxyz")).toBe(
      "123456:ABC...xyz"
    );
  });

  it("formats notification messages with project and transaction context", () => {
    const message = buildTelegramMessage({
      eventType: "dry-run accepted",
      walletName: "Primary",
      walletAddress: "0x0000000000000000000000000000000000000001",
      action: "SWAP",
      pair: "USDC/WETH",
      amount: "25",
      status: "DRY_RUN",
      txHash: null,
      basescanUrl: null,
      timestamp: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(message).toContain("base-orchestrator");
    expect(message).toContain("dry-run accepted");
    expect(message).toContain("Primary");
    expect(message).toContain("0x0000...0001");
  });

  it("sends messages through Telegram Bot API without exposing token in the request body", async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage({
      botToken: "123456:ABCDEFghijklmnopqrstuvwxyz",
      chatId: "123",
      text: "hello"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as [
      string,
      { body?: unknown }
    ][];
    const [, init] = calls[0] ?? ["", {}];
    expect(init?.body).toBe(JSON.stringify({ chat_id: "123", text: "hello" }));
  });
});
