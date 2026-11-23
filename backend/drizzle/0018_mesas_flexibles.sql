CREATE TABLE "event_table_block" (
	"event_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	CONSTRAINT "event_table_block_event_id_table_id_pk" PRIMARY KEY("event_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "table_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"people" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_hold_order_table_unique" UNIQUE("order_id","table_id"),
	CONSTRAINT "table_hold_people_positive" CHECK ("table_hold"."people" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_table_block" ADD CONSTRAINT "event_table_block_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table_block" ADD CONSTRAINT "event_table_block_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_hold_event_table_idx" ON "table_hold" USING btree ("event_id","table_id");