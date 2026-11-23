CREATE TABLE "buyer_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"picture_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_account_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "buyer_id" uuid;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_buyer_id_buyer_account_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyer_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_buyer_id_idx" ON "order" USING btree ("buyer_id");