import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { registerRuntimeRoutes } from "./runtime-routes.js";

describe("runtime status route", () => {
  it("returns API-backed operator safety status", async () => {
    const { db } = createInMemoryDb();
    const server = Fastify({ logger: false });
    await registerRuntimeRoutes(server, db as never);

    const response = await server.inject({
      method: "GET",
      url: "/api/runtime/status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      demoMode: true,
      dryRun: true,
      liveExecutionAllowed: false,
      requireLiveConfirmation: true,
      schedulerLiveExecution: false,
      autoApprove: false,
      allowUnlimitedApproval: false,
      quoteProvider: "mock",
      baseChainId: 8453,
      vaultStatus: { status: "LOCKED" },
      emergencyPaused: false,
      authEnabled: true
    });

    await server.close();
  });
});
