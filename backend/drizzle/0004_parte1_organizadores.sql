CREATE TYPE "public"."approval_status" AS ENUM('PENDIENTE', 'APROBADO', 'RECHAZADO');--> statement-breakpoint
CREATE TABLE "organizer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"default_commission_pct" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizer_name_unique" UNIQUE("name"),
	CONSTRAINT "organizer_commission_range" CHECK ("organizer"."default_commission_pct" IS NULL OR ("organizer"."default_commission_pct" >= 0 AND "organizer"."default_commission_pct" <= 100))
);
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPERADMIN', 'ORGANIZADOR', 'STAFF_PUERTA');--> statement-breakpoint
-- ADMIN pasa a llamarse SUPERADMIN (se conserva el usuario y su acceso)
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING (CASE "role" WHEN 'ADMIN' THEN 'SUPERADMIN' ELSE "role" END)::"public"."user_role";--> statement-breakpoint
-- Los eventos ya existentes pasan a un organizador por defecto ("Equinoccio"), y luego la columna se vuelve obligatoria
INSERT INTO "organizer" ("name") VALUES ('Equinoccio') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "organizer_id" uuid;--> statement-breakpoint
UPDATE "event" SET "organizer_id" = (SELECT "id" FROM "organizer" WHERE "name" = 'Equinoccio') WHERE "organizer_id" IS NULL;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "organizer_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "commission_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "organizer_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "approval_status" "approval_status" DEFAULT 'APROBADO' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_organizer_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organizer_id_organizer_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_organizer_id_idx" ON "event" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "user_organizer_id_idx" ON "user" USING btree ("organizer_id");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_commission_range" CHECK ("event"."commission_pct" IS NULL OR ("event"."commission_pct" >= 0 AND "event"."commission_pct" <= 100));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_organizer_coherence" CHECK (("user"."role" = 'SUPERADMIN' AND "user"."organizer_id" IS NULL)
        OR ("user"."role" = 'ORGANIZADOR' AND "user"."organizer_id" IS NOT NULL)
        OR "user"."role" = 'STAFF_PUERTA');