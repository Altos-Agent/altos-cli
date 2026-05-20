import { describe, expect, it, beforeEach } from "vitest";
import { createInMemorySessionStore } from "./session-store-factory.js";

describe("OperatorSession role and lastReauthAt", () => {
  let store: Awaited<ReturnType<typeof createInMemorySessionStore>>;

  beforeEach(async () => {
    store = createInMemorySessionStore();
  });

  it("creates session with role=admin and lastReauthAt=0 by default", async () => {
    const session = await store.create("operator");
    expect(session.role).toBe("admin");
    expect(session.lastReauthAt).toBe(0);
  });

  it("updates lastReauthAt on touch", async () => {
    const session = await store.create("operator");
    await store.touch(session.id);
    const updated = await store.get(session.id);
    expect(updated?.lastReauthAt).toBeGreaterThan(0);
  });
});