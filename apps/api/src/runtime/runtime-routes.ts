import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { getRuntimeStatus } from "./runtime-status.js";

export const registerRuntimeRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  server.get("/api/runtime/status", async () => await getRuntimeStatus(db));
};
