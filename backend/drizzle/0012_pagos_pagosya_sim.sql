ALTER TYPE "public"."payment_status" ADD VALUE 'NO_CONCILIADO';--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"reference" text NOT NULL,
	"provider_tx_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "qr_payload" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_provider_tx_unique" ON "payment_event" USING btree ("provider_tx_id");--> statement-breakpoint
CREATE INDEX "payment_event_payment_id_idx" ON "payment_event" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_event_kind_idx" ON "payment_event" USING btree ("kind");