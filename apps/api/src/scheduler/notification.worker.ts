import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { createTelegramService } from "../notifications/telegram.js";
import type { NotificationJob } from "./queues.js";

export const processNotificationJob =
  (db: DbClient) => async (job: Job<NotificationJob>) => {
    console.info(`[notificationQueue] job ${job.id} ${job.data.eventType}`);
    const telegram = createTelegramService(db);
    await telegram.notify({
      ...job.data,
      timestamp: new Date()
    });
  };
