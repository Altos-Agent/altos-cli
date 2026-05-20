CREATE TABLE "aggregate_risk_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer DEFAULT 8453 NOT NULL,
	"max_daily_trade_usd" numeric(18, 2) DEFAULT '10000' NOT NULL,
	"max_daily_gas_usd" numeric(18, 2) DEFAULT '500' NOT NULL,
	"max_pending_trade_usd" numeric(18, 2) DEFAULT '2000' NOT NULL,
	"max_pending_wallets" integer DEFAULT 10 NOT NULL,
	"max_failed_tx_per_day" integer DEFAULT 5 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aggregate_risk_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"chain_id" integer DEFAULT 8453 NOT NULL,
	"total_trade_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_gas_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_pending_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active_wallet_count" integer DEFAULT 0 NOT NULL,
	"failed_tx_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aggregate_risk_stats_chain_date_idx" ON "aggregate_risk_stats" USING btree ("chain_id","date");