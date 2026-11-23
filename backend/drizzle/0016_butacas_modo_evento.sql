CREATE TYPE "public"."seating_mode" AS ENUM('NINGUNO', 'BUTACAS', 'MESAS_FIJAS', 'MESAS_FLEXIBLES');--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "seating_mode" "seating_mode" DEFAULT 'NINGUNO' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "seat_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_event_seat_unique" ON "ticket" USING btree ("event_id","seat_id") WHERE "ticket"."seat_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ticket_seat_id_idx" ON "ticket" USING btree ("seat_id");