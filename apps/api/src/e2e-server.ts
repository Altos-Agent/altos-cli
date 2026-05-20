process.env.NODE_ENV = "test";
process.env.API_HOST = process.env.API_HOST ?? "127.0.0.1";
process.env.API_PORT = process.env.API_PORT ?? "4100";
process.env.WEB_PORT = process.env.WEB_PORT ?? "3100";
process.env.BASE_CHAIN_ID = "8453";
process.env.BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
process.env.BASESCAN_BASE_URL = "https://basescan.org";
process.env.DRY_RUN = "true";
process.env.DEMO_MODE = "true";
process.env.REQUIRE_LIVE_CONFIRMATION = "true";
process.env.ALLOW_UNLIMITED_APPROVAL = "false";
process.env.AUTO_APPROVE = "false";
process.env.SCHEDULER_LIVE_EXECUTION = "false";
process.env.QUOTE_PROVIDER = "mock";
process.env.TELEGRAM_ENABLED = "false";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.DATABASE_URL =
  "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator";
process.env.OPERATOR_USERNAME = "operator";
process.env.OPERATOR_PASSWORD = "demo-password";
process.env.SESSION_SECRET = "e2e-session-secret-change-before-live";
process.env.MASTER_KEY_FILE = ".local/e2e-master.key";

const [{ buildServer }, { seedDemoData }, { createInMemoryDb }] =
  await Promise.all([
    import("./server.js"),
    import("./db/demo-data.js"),
    import("./test-utils/in-memory-db.js")
  ]);

const { db } = createInMemoryDb();
await seedDemoData(db as never);
const server = await buildServer({ dbClient: db as never });
const port = Number(process.env.API_PORT ?? "4100");

await server.listen({ host: "127.0.0.1", port });
