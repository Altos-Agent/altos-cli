import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { transactions, wallets } from "../db/schema.js";
import { getBaseChainStatus } from "./baseClient.js";
import {
  buildBasescanAddressLink,
  buildBasescanTransactionLink,
} from "./basescan.js";
import { readDemoWalletBalances, readWalletBalances } from "./balances.js";
import { listBaseTokens } from "./tokens.js";
import { isDemoMode } from "../runtime/mode.js";

interface IdParams {
  id: string;
}

const notFound = (entity: string) => ({
  statusCode: 404,
  body: { error: `${entity} not found` },
});

export const registerChainRoutes = async (
  server: FastifyInstance,
  db: DbClient,
) => {
  server.get("/api/chain/status", async () =>
    isDemoMode()
      ? {
          chainId: 8453,
          latestBlockNumber: "demo",
          rpcUrl: "demo-mode",
          nativeSymbol: "ETH",
        }
      : await getBaseChainStatus(),
  );

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/balances",
    async (request, reply) => {
      const [wallet] = await db
        .select({
          id: wallets.id,
          address: wallets.address,
          name: wallets.name,
        })
        .from(wallets)
        .where(eq(wallets.id, request.params.id));

      if (!wallet) {
        const handled = notFound("Wallet");
        return reply.code(handled.statusCode).send(handled.body);
      }

      const tokenRows = await listBaseTokens(db);
      const balances = isDemoMode()
        ? readDemoWalletBalances(wallet.address, tokenRows)
        : await readWalletBalances(wallet.address, tokenRows);

      return {
        wallet,
        balances,
      };
    },
  );

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/basescan",
    async (request, reply) => {
      const [wallet] = await db
        .select({
          id: wallets.id,
          address: wallets.address,
          name: wallets.name,
        })
        .from(wallets)
        .where(eq(wallets.id, request.params.id));

      if (!wallet) {
        const handled = notFound("Wallet");
        return reply.code(handled.statusCode).send(handled.body);
      }

      return {
        walletId: wallet.id,
        address: wallet.address,
        basescanUrl: buildBasescanAddressLink(wallet.address),
      };
    },
  );

  server.get<{ Params: IdParams }>(
    "/api/transactions/:id/basescan",
    async (request, reply) => {
      const [transaction] = await db
        .select({
          id: transactions.id,
          txHash: transactions.txHash,
          basescanUrl: transactions.basescanUrl,
        })
        .from(transactions)
        .where(eq(transactions.id, request.params.id));

      if (!transaction) {
        const handled = notFound("Transaction");
        return reply.code(handled.statusCode).send(handled.body);
      }

      return {
        transactionId: transaction.id,
        txHash: transaction.txHash,
        basescanUrl:
          transaction.basescanUrl ??
          (transaction.txHash
            ? buildBasescanTransactionLink(transaction.txHash)
            : null),
      };
    },
  );
};
