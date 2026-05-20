-- Schedule Occurrences: restart-safe, duplicate-safe execution records
CREATE TABLE "schedule_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"strategy_profile_id" uuid,
	"mode" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"occurrence_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL DEFAULT 'PLANNED',
	"request_id" uuid,
	"trace_id" text,
	"quote_hash" text,
	"simulation_hash" text,
	"transaction_id" uuid,
	"job_id" text,
	"attempt_count" integer NOT NULL DEFAULT 0,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_occurrence_key_idx" ON "schedule_occurrences"("occurrence_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_occurrences_idempotency_key_idx" ON "schedule_occurrences"("idempotency_key");
--> statement-breakpoint
CREATE INDEX "schedule_occurrences_schedule_id_idx" ON "schedule_occurrences"("schedule_id");
--> statement-breakpoint
CREATE INDEX "schedule_occurrences_wallet_id_idx" ON "schedule_occurrences"("wallet_id");
--> statement-breakpoint
CREATE INDEX "schedule_occurrences_status_idx" ON "schedule_occurrences"("status");
--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_schedule_id_wallet_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."wallet_schedules"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- transaction_id has no FK here; reverse link is maintained via transactions.occurrence_id
--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD COLUMN "occurrence_id" uuid;
--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_occurrence_id_schedule_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."schedule_occurrences"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "occurrence_id" uuid;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_occurrence_id_schedule_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."schedule_occurrences"("id") ON DELETE set null ON UPDATE no action;