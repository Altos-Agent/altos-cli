import { eq } from "drizzle-orm";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import { tokens } from "../db/schema.js";

export const listBaseTokens = async (db: DbClient) =>
  await db
    .select()
    .from(tokens)
    .where(eq(tokens.chainId, BASE_CHAIN_ID));
