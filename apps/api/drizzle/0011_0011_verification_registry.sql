CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'VERIFIED', 'PLACEHOLDER', 'BLOCKED');--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verification_source" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "verification_notes" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verification_source" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "verification_notes" text;