ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amount_in_raw" numeric(78, 0);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amount_out_raw" numeric(78, 0);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amount_in_usd" numeric(18, 2);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "amount_out_usd" numeric(18, 2);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "usd_price_source" text;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "usd_price_timestamp" timestamp with time zone;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "quote_usd_source" text;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "risk_checked_at" timestamp with time zone;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "aggregate_risk_snapshot_json" jsonb;

UPDATE "transactions"
SET
  "amount_in_raw" = COALESCE("amount_in_raw", "amount_in"),
  "amount_out_raw" = COALESCE("amount_out_raw", "amount_out")
WHERE "amount_in_raw" IS NULL OR "amount_out_raw" IS NULL;
