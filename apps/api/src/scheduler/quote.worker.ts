import type { Job } from "bullmq";

export const processQuoteJob = () => async (job: Job) => {
  console.info(`[quoteQueue] job ${job.id} processed`);
};
