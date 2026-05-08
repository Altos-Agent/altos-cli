import { Queue, type JobsOptions, type QueueOptions } from "bullmq";

export const queueNames = {
  quote: "quoteQueue",
  trade: "tradeQueue",
  confirmation: "confirmationQueue",
  notification: "notificationQueue"
} as const;

export interface ScheduledTradeJob {
  walletId: string;
  pairId: string;
  amountIn: string;
  mode: "DRY_RUN" | "LIVE";
}

export interface ConfirmationJob {
  transactionId: string;
  walletId: string;
}

export interface NotificationJob {
  eventType:
    | "dry-run accepted"
    | "dry-run rejected"
    | "transaction submitted"
    | "transaction failed"
    | "transaction rejected"
    | "wallet paused due to risk limit"
    | "emergency pause";
  walletName: string;
  walletAddress: string;
  action: string;
  pair: string;
  amount: string;
  status: string;
  txHash: string | null;
  basescanUrl: string | null;
}

const redisConnection = () => {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || "6379"),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1) || "0") : 0,
    maxRetriesPerRequest: null
  };
};

export const bullQueueOptions = (): QueueOptions => ({
  connection: redisConnection()
});

export const defaultJobOptions: JobsOptions = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100
};

export const createSchedulerQueues = () => {
  const options = bullQueueOptions();

  return {
    quoteQueue: new Queue(queueNames.quote, options),
    tradeQueue: new Queue<ScheduledTradeJob>(queueNames.trade, options),
    confirmationQueue: new Queue<ConfirmationJob>(
      queueNames.confirmation,
      options
    ),
    notificationQueue: new Queue<NotificationJob>(
      queueNames.notification,
      options
    )
  };
};

export type SchedulerQueues = ReturnType<typeof createSchedulerQueues>;
