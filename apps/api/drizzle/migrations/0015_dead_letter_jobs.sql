-- Migration: 0015_dead_letter_jobs
-- Add dead letter queue table for failed job tracking and replay

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  wallet_id UUID,
  pair_id UUID,
  schedule_id UUID,
  request_id TEXT,
  trace_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  retryable BOOLEAN NOT NULL DEFAULT false,
  payload_preview_json JSONB,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS dlq_queue_name_idx ON dead_letter_jobs (queue_name);
CREATE INDEX IF NOT EXISTS dlq_wallet_id_idx ON dead_letter_jobs (wallet_id);
CREATE INDEX IF NOT EXISTS dlq_pair_id_idx ON dead_letter_jobs (pair_id);
CREATE INDEX IF NOT EXISTS dlq_failed_at_idx ON dead_letter_jobs (failed_at DESC);
CREATE INDEX IF NOT EXISTS dlq_error_code_idx ON dead_letter_jobs (error_code);
CREATE INDEX IF NOT EXISTS dlq_retryable_idx ON dead_letter_jobs (retryable) WHERE resolved_at IS NULL;