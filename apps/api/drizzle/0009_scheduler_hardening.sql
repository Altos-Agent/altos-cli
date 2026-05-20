CREATE TABLE "scheduler_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"heartbeat_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_schedules" ADD COLUMN "max_daily_runs" integer;
ALTER TABLE "wallet_schedules" ADD COLUMN "next_run_at" timestamp with time zone;
ALTER TABLE "wallet_schedules" ADD COLUMN "last_run_at" timestamp with time zone;
ALTER TABLE "wallet_schedules" ADD COLUMN "last_status" text;
ALTER TABLE "wallet_schedules" ADD COLUMN "failure_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "wallet_schedules"
SET
	"max_daily_runs" = "max_daily_trades",
	"next_run_at" = COALESCE("last_scheduled_at", now())
WHERE "next_run_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "scheduler_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"schedule_id" uuid,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scheduler_jobs" ADD CONSTRAINT "scheduler_jobs_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scheduler_jobs" ADD CONSTRAINT "scheduler_jobs_schedule_id_wallet_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."wallet_schedules"("id") ON DELETE set null ON UPDATE no action;
