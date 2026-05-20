import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import { BASE_MAINNET, PRODUCT_NAME } from "@base-orchestrator/shared";
import { createAuthContext, installAuthMiddleware } from "./auth/auth-middleware.js";
import { registerAuthRoutes } from "./auth/auth-routes.js";
import { registerMfaRoutes } from "./auth/mfa-routes.js";
import { registerApprovalRoutes } from "./approvals/approval-routes.js";
import { db, type DbClient } from "./db/client.js";
import { registerChainRoutes } from "./blockchain/chain-routes.js";
import { getRuntimeConfig } from "./config/runtime-config.js";
import { registerManagementRoutes } from "./management/management-routes.js";
import { registerTelegramRoutes } from "./notifications/telegram-routes.js";
import { registerProfileRoutes } from "./profiles/profile-routes.js";
import { registerRuntimeRoutes } from "./runtime/runtime-routes.js";
import { registerOpsRoutes } from "./ops/ops-routes.js";
import { registerMetricsRoutes } from "./ops/metrics-routes.js";
import { getHealthStatus } from "./ops/health.js";
import { createSchedulerRoutes } from "./scheduler/scheduler-routes.js";
import { createPreflightRoutes } from "./scheduler/preflight.routes.js";
import { registerEmergencyPauseRoutes } from "./security/emergency-pause-routes.js";
import { registerPlanRoutes } from "./strategy/plan-routes.js";
import { registerRiskRoutes } from "./risk-routes.js";
import { registerTradeRoutes } from "./trades/trade-routes.js";
import { registerTransactionRoutes } from "./transactions/transaction-routes.js";
import { registerVaultRoutes } from "./vault/vault-routes.js";
import { registerWalletRoutes } from "./wallets/wallet-routes.js";
import { registerTraceRoutes } from "./trace/trace.routes.js";
import { isDemoMode } from "./runtime/mode.js";
import { installRequestContext } from "./http/request-context.js";
import { createRateLimitProvider } from "./http/rate-limit-provider.js";
import { createSessionStore } from "./auth/session-store-factory.js";

interface BuildServerOptions {
  dbClient?: DbClient;
}

export const buildServer = async (options: BuildServerOptions = {}) => {
  const config = getRuntimeConfig();
  const dbClient = options.dbClient ?? db;
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

  installRequestContext(server);

  server.get("/health", async (_request, reply) => {
    const health = await getHealthStatus(dbClient);
    return reply.code(200).send({
      ...health,
      service: PRODUCT_NAME,
      demoMode: isDemoMode(),
      dryRun: config.dryRun,
      network: BASE_MAINNET,
    });
  });

  const rateLimitProvider = await createRateLimitProvider(config);
  const sessionStore = await createSessionStore(config);
  const authContext = createAuthContext(config, sessionStore, rateLimitProvider);
  installAuthMiddleware(server, authContext);
  await registerAuthRoutes(server, authContext);
  await registerMfaRoutes(server, authContext);
  await registerVaultRoutes(server, authContext);
  await registerEmergencyPauseRoutes(server, dbClient, authContext);
  await registerChainRoutes(server, dbClient);
  await registerManagementRoutes(server, dbClient, authContext);
  await registerApprovalRoutes(server, dbClient, authContext);
  await registerProfileRoutes(server);
  await registerRuntimeRoutes(server, dbClient);
  await registerOpsRoutes(server, dbClient);
  await registerMetricsRoutes(server, dbClient);
  await registerTelegramRoutes(server, dbClient, authContext);
  await createSchedulerRoutes(dbClient, authContext)(server);
  await createPreflightRoutes(dbClient)(server);
  await registerPlanRoutes(server, dbClient);
  await registerRiskRoutes(server, dbClient, authContext);
  await registerTradeRoutes(server, dbClient, authContext);
  await registerTransactionRoutes(server, dbClient);
  await registerWalletRoutes(server, dbClient, authContext);
  await registerTraceRoutes(dbClient)(server);

  return server;
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const config = getRuntimeConfig();
  const server = await buildServer();

  try {
    await server.listen({ host: config.apiHost, port: config.apiPort });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}