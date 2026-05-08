CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."transaction_action" AS ENUM('SWAP', 'APPROVE', 'TRANSFER', 'REVOKE', 'SIMULATION');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PLANNED', 'DRY_RUN', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."wallet_status" AS ENUM('ACTIVE', 'PAUSED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_wallet_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"gas_spent_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_loss_usd" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_name" text DEFAULT 'base-orchestrator' NOT NULL,
	"dry_run_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"token_in_id" uuid NOT NULL,
	"token_out_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_trade_usd" numeric(18, 2),
	"max_slippage_bps" integer,
	"max_price_impact_bps" integer,
	"preferred_router" text,
	"fallback_router" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"risk_level" "risk_level" DEFAULT 'MEDIUM' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "telegram_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_bot_token" text,
	"chat_id" text,
	"notify_on_submitted" boolean DEFAULT true NOT NULL,
	"notify_on_confirmed" boolean DEFAULT true NOT NULL,
	"notify_on_failed" boolean DEFAULT true NOT NULL,
	"notify_on_rejected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"decimals" integer NOT NULL,
	"risk_level" "risk_level" DEFAULT 'MEDIUM' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"pair_id" uuid,
	"chain_id" integer NOT NULL,
	"tx_hash" text,
	"status" "transaction_status" DEFAULT 'PLANNED' NOT NULL,
	"action" "transaction_action" NOT NULL,
	"router" text,
	"token_in" text,
	"token_out" text,
	"amount_in" numeric(78, 0),
	"amount_out" numeric(78, 0),
	"gas_used" numeric(78, 0),
	"gas_usd" numeric(18, 2),
	"fee_native" numeric(36, 18),
	"error_message" text,
	"basescan_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_pair_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"pair_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_trade_usd" numeric(18, 2),
	"max_daily_trades" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"encryption_version" integer NOT NULL,
	"status" "wallet_status" DEFAULT 'PAUSED' NOT NULL,
	"max_trade_usd" numeric(18, 2),
	"max_daily_trades" integer,
	"max_daily_loss_usd" numeric(18, 2),
	"max_gas_usd" numeric(18, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_wallet_stats" ADD CONSTRAINT "daily_wallet_stats_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_token_in_id_tokens_id_fk" FOREIGN KEY ("token_in_id") REFERENCES "public"."tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairs" ADD CONSTRAINT "pairs_token_out_id_tokens_id_fk" FOREIGN KEY ("token_out_id") REFERENCES "public"."tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pair_rules" ADD CONSTRAINT "wallet_pair_rules_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_pair_rules" ADD CONSTRAINT "wallet_pair_rules_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_wallet_stats_wallet_date_idx" ON "daily_wallet_stats" USING btree ("wallet_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "pairs_chain_token_direction_idx" ON "pairs" USING btree ("chain_id","token_in_id","token_out_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routers_chain_name_idx" ON "routers" USING btree ("chain_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_chain_symbol_idx" ON "tokens" USING btree ("chain_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_chain_address_idx" ON "tokens" USING btree ("chain_id","address");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_chain_tx_hash_idx" ON "transactions" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_pair_rules_wallet_pair_idx" ON "wallet_pair_rules" USING btree ("wallet_id","pair_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_address_idx" ON "wallets" USING btree ("address");