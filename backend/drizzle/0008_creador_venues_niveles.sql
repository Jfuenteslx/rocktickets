CREATE TYPE "public"."sector_type" AS ENUM('MESAS', 'BUTACAS', 'DE_PIE', 'MIXTO');--> statement-breakpoint
CREATE TYPE "public"."sector_view" AS ENUM('LIBRE', 'OBSTRUIDA', 'PRIVILEGIADA');--> statement-breakpoint
CREATE TYPE "public"."venue_element_kind" AS ENUM('ESCENARIO', 'BARRA', 'BANOS', 'SALIDA_EMERGENCIA', 'OTRO');--> statement-breakpoint
CREATE TABLE "venue_element" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"kind" "venue_element_kind" NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_element_rect_valid" CHECK ("venue_element"."x" >= 0 AND "venue_element"."y" >= 0 AND "venue_element"."w" > 0 AND "venue_element"."h" > 0)
);
--> statement-breakpoint
CREATE TABLE "venue_level" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_level_venue_name_unique" UNIQUE("venue_id","name")
);
--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "level_id" uuid;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "type" "sector_type" DEFAULT 'MIXTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "view" "sector_view" DEFAULT 'LIBRE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "sellable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "color" text DEFAULT '#F28C0F' NOT NULL;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "buyer_text" text;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "x" integer;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "y" integer;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "w" integer;--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "h" integer;--> statement-breakpoint
ALTER TABLE "venue_element" ADD CONSTRAINT "venue_element_level_id_venue_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."venue_level"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_level" ADD CONSTRAINT "venue_level_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_element_level_id_idx" ON "venue_element" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "venue_level_venue_id_idx" ON "venue_level" USING btree ("venue_id");--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_level_id_venue_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."venue_level"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sector_level_id_idx" ON "sector" USING btree ("level_id");--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_plan_rect_valid" CHECK (("sector"."x" IS NULL AND "sector"."y" IS NULL AND "sector"."w" IS NULL AND "sector"."h" IS NULL)
      OR ("sector"."x" IS NOT NULL AND "sector"."y" IS NOT NULL AND "sector"."w" > 0 AND "sector"."h" > 0
          AND "sector"."x" >= 0 AND "sector"."y" >= 0));--> statement-breakpoint
-- Datos: cada local existente recibe su nivel "Planta baja" y sus sectores actuales se asignan a él.
-- Los sectores quedan sin posición (x, y, w, h en NULL): aparecen "sin ubicar" hasta que se coloquen en el plano.
INSERT INTO "venue_level" ("venue_id", "name", "position") SELECT "id", 'Planta baja', 0 FROM "venue";--> statement-breakpoint
UPDATE "sector" SET "level_id" = "venue_level"."id" FROM "venue_level" WHERE "venue_level"."venue_id" = "sector"."venue_id" AND "venue_level"."name" = 'Planta baja';
