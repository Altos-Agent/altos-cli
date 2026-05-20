import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { wallets } from "../db/schema.js";
import { NonceReservationService } from "../nonce/nonce-reservation.js";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import {
  emitWalletQuarantinedAlert,
  emitDroppedTxAlert,
  emitStuckTxAlert,
} from "../ops/alert-webhook.js";
import type { SchedulerQueues } from "../scheduler/queues.js";

export interface ReconciliationJob {
  walletId: string;
}

export const processReconciliationJob =
  (db: DbClient) =>
  async (job: Job<ReconciliationJob>) => {
    const nonceService = new NonceReservationService(db);

    try {
      const result = await nonceService.reconcileWalletNonce(
        job.data.walletId,
        BASE_CHAIN_ID
      );

      if (result.state === "QUARANTINED") {
        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.id, job.data.walletId))
          .limit(1);

        if (wallet) {
          if (result.stuckTxHashes.length > 0) {
            await emitStuckTxAlert(wallet.address, result.stuckTxHashes);
          }
          if (result.droppedTxHashes.length > 0) {
            await emitDroppedTxAlert(wallet.address, result.droppedTxHashes);
          }
          await emitWalletQuarantinedAlert(wallet.address, wallet.name);
        }
      }

      return result;
    } catch (err) {
      console.error(`[reconciliation] wallet ${job.data.walletId} error:`, err);
      throw err;
    }
  };
