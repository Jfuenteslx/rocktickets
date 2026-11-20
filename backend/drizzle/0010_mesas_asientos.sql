CREATE TABLE "seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"table_id" uuid,
	"row_label" text,
	"label" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "seat_owner_valid" CHECK ("seat"."table_id" IS NOT NULL OR "seat"."row_label" IS NOT NULL),
	CONSTRAINT "seat_pos_valid" CHECK ("seat"."x" >= 0 AND "seat"."y" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sector_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"label" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	CONSTRAINT "sector_table_sector_label_unique" UNIQUE("sector_id","label"),
	CONSTRAINT "sector_table_pos_valid" CHECK ("sector_table"."x" >= 0 AND "sector_table"."y" >= 0)
);
--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_sector_id_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat" ADD CONSTRAINT "seat_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector_table" ADD CONSTRAINT "sector_table_sector_id_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seat_sector_id_idx" ON "seat" USING btree ("sector_id");--> statement-breakpoint
CREATE INDEX "seat_table_id_idx" ON "seat" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_table_label_unique" ON "seat" USING btree ("table_id","label") WHERE "seat"."table_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "seat_row_label_unique" ON "seat" USING btree ("sector_id","row_label","label") WHERE "seat"."table_id" IS NULL;--> statement-breakpoint
CREATE INDEX "sector_table_sector_id_idx" ON "sector_table" USING btree ("sector_id");