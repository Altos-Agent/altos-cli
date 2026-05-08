CREATE TYPE "public"."strategy_profile" AS ENUM('MANUAL_ONLY', 'STABLE_ONLY', 'LOW_FEE_ONLY', 'TOKEN_ROTATION_LIMITED');--> statement-breakpoint
CREATE TABLE "wallet_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"min_interval_minutes" integer DEFAULT 60 NOT NULL,
	"max_daily_trades" integer,
	"strategy_profile" "strategy_profile" DEFAULT 'MANUAL_ONLY' NOT NULL,
	"emergency_paused" boolean DEFAULT false NOT NULL,
	"failed_tx_pause_threshold" integer DEFAULT 3 NOT NULL,
	"last_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_schedules" ADD CONSTRAINT "wallet_schedules_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_schedules_wallet_idx" ON "wallet_schedules" USING btree ("wallet_id");