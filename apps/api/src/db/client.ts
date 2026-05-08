import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator";

export const dbPool = new Pool({
  connectionString,
  max: 10
});

export const db = drizzle(dbPool, { schema });

export type DbClient = typeof db;

export const closeDb = async () => {
  await dbPool.end();
};
