CREATE TYPE "public"."access_result" AS ENUM('ADMITIDO', 'RECHAZADO_YA_USADO', 'RECHAZADO_INVALIDO');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('ACTIVO', 'CANCELADO');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDIENTE_PAGO', 'PAGADA', 'EXPIRADA');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDIENTE', 'CONFIRMADO', 'EXPIRADO', 'ERROR', 'CONFIRMADO_SIN_ORDEN', 'REEMBOLSADO');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('GENERADO', 'VALIDO', 'UTILIZADO', 'ANULADO');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'STAFF_PUERTA');--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"date" timestamp with time zone NOT NULL,
	"status" "event_status" DEFAULT 'ACTIVO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sector_event_name_unique" UNIQUE("event_id","name")
);
--> statement-breakpoint
CREATE TABLE "tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"stock" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_sector_name_unique" UNIQUE("sector_id","name"),
	CONSTRAINT "tier_price_non_negative" CHECK ("tier"."price" >= 0),
	CONSTRAINT "tier_stock_non_negative" CHECK ("tier"."stock" >= 0),
	CONSTRAINT "tier_sold_within_stock" CHECK ("tier"."sold" >= 0 AND "tier"."sold" <= "tier"."stock"),
	CONSTRAINT "tier_valid_window" CHECK ("tier"."starts_at" IS NULL OR "tier"."ends_at" IS NULL OR "tier"."starts_at" < "tier"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_capacity_positive" CHECK ("venue"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier" ADD CONSTRAINT "tier_sector_id_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sector"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_venue_id_idx" ON "event" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "event_status_date_idx" ON "event" USING btree ("status","date");--> statement-breakpoint
CREATE INDEX "sector_event_id_idx" ON "sector" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tier_sector_id_idx" ON "tier" USING btree ("sector_id");