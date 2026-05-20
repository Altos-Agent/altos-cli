import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { withCircuitBreaker, getCircuitBreaker } from "../quote/provider-circuit-breaker.js";

export const processQuoteJob = () => async (job: Job) => {
  const breaker = getCircuitBreaker();
  const canProceed = breaker.canAcceptRequest();

  if (!canProceed.allowed) {
    console.warn(`[quoteQueue] job ${job.id} rejected: ${canProceed.reason}`);
    throw new Error(`Circuit breaker prevented request: ${canProceed.reason}`);
  }

  breaker.startRequest();
  try {
    console.info(`[quoteQueue] job ${job.id} processing with circuit breaker`);
    // Quote job processing logic would go here
    // For now, just acknowledge the job
    breaker.recordSuccess();
    return { processed: true };
  } catch (error) {
    breaker.recordFailure(error instanceof Error ? error.message : String(error));
    throw error;
  }
};
