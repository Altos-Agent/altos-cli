import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";

const connectionString = getRuntimeConfig().databaseUrl;

export const dbPool = new Pool({
  connectionString,
  max: 10
});

export const db = drizzle(dbPool, { schema });

export type DbClient = typeof db;

export const closeDb = async () => {
  await dbPool.end();
};
