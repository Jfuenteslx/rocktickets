CREATE TABLE "event_table" (
	"event_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	CONSTRAINT "event_table_event_id_table_id_pk" PRIMARY KEY("event_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "order_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"people" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"bottle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_table_order_table_unique" UNIQUE("order_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "table_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"people" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"bottle_options" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_package_event_name_unique" UNIQUE("event_id","name"),
	CONSTRAINT "table_package_people_positive" CHECK ("table_package"."people" > 0),
	CONSTRAINT "table_package_price_positive" CHECK ("table_package"."price" > 0),
	CONSTRAINT "table_package_price_splits" CHECK (mod("table_package"."price" * 100, "table_package"."people") = 0)
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "table_valid_until" text DEFAULT '23:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_package_id_table_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."table_package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_tier_id_tier_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_table" ADD CONSTRAINT "order_table_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_table" ADD CONSTRAINT "order_table_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_package" ADD CONSTRAINT "table_package_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_table_package_id_idx" ON "event_table" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "order_table_order_id_idx" ON "order_table" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "table_package_event_id_idx" ON "table_package" USING btree ("event_id");