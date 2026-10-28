-- DEV ONLY: el modelo cambia de raíz (sector→venue, ticket pre-creado, tier sin stock).
-- Los datos de prueba del MVP anterior no son migrables; se conservan "user" y "venue".
TRUNCATE TABLE "access", "ticket", "payment", "order_item", "order", "tier", "sector", "event", "audit_log" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."tier_kind" AS ENUM('VENTA', 'CORTESIA');--> statement-breakpoint
CREATE TABLE "courtesy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"reason" text,
	"issued_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sector" DROP CONSTRAINT "sector_event_name_unique";--> statement-breakpoint
ALTER TABLE "tier" DROP CONSTRAINT "tier_sector_name_unique";--> statement-breakpoint
ALTER TABLE "ticket" DROP CONSTRAINT "ticket_short_code_unique";--> statement-breakpoint
ALTER TABLE "tier" DROP CONSTRAINT "tier_stock_non_negative";--> statement-breakpoint
ALTER TABLE "tier" DROP CONSTRAINT "tier_sold_within_stock";--> statement-breakpoint
ALTER TABLE "venue" DROP CONSTRAINT "venue_capacity_positive";--> statement-breakpoint
ALTER TABLE "sector" DROP CONSTRAINT "sector_event_id_event_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "status" SET DEFAULT 'DISPONIBLE'::text;--> statement-breakpoint
DROP TYPE "public"."ticket_status";--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('DISPONIBLE', 'RESERVADO', 'VALIDO', 'UTILIZADO', 'ANULADO');--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "status" SET DEFAULT 'DISPONIBLE'::"public"."ticket_status";--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "status" SET DATA TYPE "public"."ticket_status" USING "status"::"public"."ticket_status";--> statement-breakpoint
DROP INDEX "event_status_date_idx";--> statement-breakpoint
DROP INDEX "sector_event_id_idx";--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "order_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "starts_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "ends_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "image_path" text;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "venue_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "capacity" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "tier" ADD COLUMN "event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tier" ADD COLUMN "kind" "tier_kind" DEFAULT 'VENTA' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "sector_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "tier_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "courtesy_id" uuid;--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_venue_name_unique" UNIQUE("venue_id","name");--> statement-breakpoint
ALTER TABLE "tier" ADD CONSTRAINT "tier_event_sector_name_unique" UNIQUE("event_id","sector_id","name");--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_event_short_code_unique" UNIQUE("event_id","short_code");--> statement-breakpoint
CREATE UNIQUE INDEX "tier_id_event_sector_unique" ON "tier" USING btree ("id","event_id","sector_id");--> statement-breakpoint
ALTER TABLE "courtesy" ADD CONSTRAINT "courtesy_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courtesy" ADD CONSTRAINT "courtesy_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courtesy_event_id_idx" ON "courtesy" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier" ADD CONSTRAINT "tier_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_sector_id_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_courtesy_id_courtesy_id_fk" FOREIGN KEY ("courtesy_id") REFERENCES "public"."courtesy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_tier_coherence_fk" FOREIGN KEY ("tier_id","event_id","sector_id") REFERENCES "public"."tier"("id","event_id","sector_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_status_starts_idx" ON "event" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "sector_venue_id_idx" ON "sector" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "tier_event_id_idx" ON "tier" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "ticket_event_status_idx" ON "ticket" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_tier_status_idx" ON "ticket" USING btree ("tier_id","status");--> statement-breakpoint
CREATE INDEX "ticket_courtesy_id_idx" ON "ticket" USING btree ("courtesy_id");--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN "date";--> statement-breakpoint
ALTER TABLE "sector" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "tier" DROP COLUMN "stock";--> statement-breakpoint
ALTER TABLE "tier" DROP COLUMN "sold";--> statement-breakpoint
ALTER TABLE "venue" DROP COLUMN "capacity";--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_valid_time_range" CHECK ("event"."ends_at" > "event"."starts_at");--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_capacity_positive" CHECK ("sector"."capacity" > 0);--> statement-breakpoint
ALTER TABLE "tier" ADD CONSTRAINT "tier_courtesy_is_free" CHECK ("tier"."kind" <> 'CORTESIA' OR "tier"."price" = 0);--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_owner_matches_status" CHECK ((
      ("ticket"."status" = 'DISPONIBLE' AND "ticket"."order_item_id" IS NULL AND "ticket"."courtesy_id" IS NULL)
      OR ("ticket"."status" = 'RESERVADO' AND "ticket"."order_item_id" IS NOT NULL AND "ticket"."courtesy_id" IS NULL)
      OR ("ticket"."status" IN ('VALIDO','UTILIZADO') AND ("ticket"."order_item_id" IS NULL) <> ("ticket"."courtesy_id" IS NULL))
      OR ("ticket"."status" = 'ANULADO' AND NOT ("ticket"."order_item_id" IS NOT NULL AND "ticket"."courtesy_id" IS NOT NULL))
    ));--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_owned_requires_tier" CHECK ("ticket"."status" IN ('DISPONIBLE','ANULADO') OR "ticket"."tier_id" IS NOT NULL);