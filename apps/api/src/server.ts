import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import { BASE_MAINNET, PRODUCT_NAME } from "@base-orchestrator/shared";
import { registerApprovalRoutes } from "./approvals/approval-routes.js";
import { db } from "./db/client.js";
import { registerChainRoutes } from "./blockchain/chain-routes.js";
import { registerManagementRoutes } from "./management/management-routes.js";
import { registerTelegramRoutes } from "./notifications/telegram-routes.js";
import { registerProfileRoutes } from "./profiles/profile-routes.js";
import { createSchedulerRoutes } from "./scheduler/scheduler-routes.js";
import { registerPlanRoutes } from "./strategy/plan-routes.js";
import { registerTradeRoutes } from "./trades/trade-routes.js";
import { registerTransactionRoutes } from "./transactions/transaction-routes.js";
import { registerWalletRoutes } from "./wallets/wallet-routes.js";
import { isDemoMode } from "./runtime/mode.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "4100");

export const buildServer = async () => {
  const server = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.privateKey",
        "req.body.botToken",
        "privateKey",
        "encryptedPrivateKey",
        "encryptedBotToken",
        "telegramBotToken",
        "privateKey",
        "seedPhrase",
        "masterEncryptionKey",
        "decryptedSecret",
      ],
    },
  });

  server.get("/health", async () => ({
    ok: true,
    service: PRODUCT_NAME,
    demoMode: isDemoMode(),
    dryRun: process.env.DRY_RUN !== "false",
    network: BASE_MAINNET,
  }));

  await registerChainRoutes(server, db);
  await registerManagementRoutes(server, db);
  await registerApprovalRoutes(server, db);
  await registerProfileRoutes(server);
  await registerTelegramRoutes(server, db);
  await createSchedulerRoutes(db)(server);
  await registerPlanRoutes(server, db);
  await registerTradeRoutes(server, db);
  await registerTransactionRoutes(server, db);
  await registerWalletRoutes(server, db);

  return server;
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const server = await buildServer();

  try {
    await server.listen({ host, port });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}
