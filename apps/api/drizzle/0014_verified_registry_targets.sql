ALTER TABLE "tokens" ADD COLUMN "checksum_address" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verification_evidence_url" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "checksum_address" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "spender_address" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "tx_target_address" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "allowance_target_address" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "function_selector_allowlist" jsonb;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verification_evidence_url" text;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verification_source" text;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verification_evidence_url" text;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "pairs" ADD COLUMN "verification_notes" text;
