CREATE TABLE "venue_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"path" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "maps_url" text;--> statement-breakpoint
ALTER TABLE "venue" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "venue_photo" ADD CONSTRAINT "venue_photo_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_photo_venue_id_idx" ON "venue_photo" USING btree ("venue_id");