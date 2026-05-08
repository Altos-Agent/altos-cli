import type { FastifyInstance } from "fastify";
import { listWalletProfiles } from "./wallet-profiles.js";

export const registerProfileRoutes = async (server: FastifyInstance) => {
  server.get("/api/profiles", async () => listWalletProfiles());
};
