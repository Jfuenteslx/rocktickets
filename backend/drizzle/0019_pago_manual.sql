ALTER TYPE "public"."payment_status" ADD VALUE 'EN_REVISION';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'RECHAZADO';--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "payer_email" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "payer_phone" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;