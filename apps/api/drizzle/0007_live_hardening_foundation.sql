CREATE TYPE "public"."transaction_request_status" AS ENUM('PENDING', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'FAILED', 'CONFLICT');
CREATE TYPE "public"."pending_wallet_lock_status" AS ENUM('ACTIVE', 'RELEASED', 'EXPIRED');

CREATE TABLE "transaction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"wallet_id" uuid NOT NULL,
	"action" "transaction_action" NOT NULL,
	"status" "transaction_request_status" DEFAULT 'PENDING' NOT NULL,
	"request_hash" text NOT NULL,
	"pair_id" uuid,
	"router_id" uuid,
	"sell_token" text,
	"buy_token" text,
	"sell_amount_raw" numeric(78, 0),
	"quote_hash" text,
	"simulation_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_requests_idempotency_key_idx" UNIQUE("idempotency_key")
);

CREATE TABLE "pending_wallet_locks" (
	"wallet_id" uuid PRIMARY KEY NOT NULL,
	"locked_by_request_id" uuid NOT NULL,
	"nonce" integer,
	"status" "pending_wallet_lock_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "transaction_requests" ADD CONSTRAINT "transaction_requests_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "transaction_requests" ADD CONSTRAINT "transaction_requests_pair_id_pairs_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."pairs"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "transaction_requests" ADD CONSTRAINT "transaction_requests_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pending_wallet_locks" ADD CONSTRAINT "pending_wallet_locks_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pending_wallet_locks" ADD CONSTRAINT "pending_wallet_locks_locked_by_request_id_transaction_requests_id_fk" FOREIGN KEY ("locked_by_request_id") REFERENCES "public"."transaction_requests"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "transactions" ADD COLUMN "request_id" uuid;
ALTER TABLE "transactions" ADD COLUMN "nonce" integer;
ALTER TABLE "transactions" ADD COLUMN "from_address" text;
ALTER TABLE "transactions" ADD COLUMN "to_address" text;
ALTER TABLE "transactions" ADD COLUMN "calldata_hash" text;
ALTER TABLE "transactions" ADD COLUMN "quote_hash" text;
ALTER TABLE "transactions" ADD COLUMN "simulation_hash" text;
ALTER TABLE "transactions" ADD COLUMN "confirmation_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "finalized_block" numeric(78, 0);
ALTER TABLE "transactions" ADD COLUMN "replaced_by_tx_hash" text;
ALTER TABLE "transactions" ADD COLUMN "dropped_reason" text;
