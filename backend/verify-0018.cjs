// Verifica (y completa si falta) la migración 0018: mesas flexibles.
require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const has = async (t) => (await c.query("select 1 from information_schema.tables where table_name=$1", [t])).rowCount > 0;
  if (!(await has('event_table_block'))) {
    await c.query(`CREATE TABLE "event_table_block" ("event_id" uuid NOT NULL, "table_id" uuid NOT NULL, CONSTRAINT "event_table_block_event_id_table_id_pk" PRIMARY KEY("event_id","table_id"))`);
    await c.query(`ALTER TABLE "event_table_block" ADD CONSTRAINT "event_table_block_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade`);
    await c.query(`ALTER TABLE "event_table_block" ADD CONSTRAINT "event_table_block_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade`);
    console.log('creada event_table_block');
  }
  if (!(await has('table_hold'))) {
    await c.query(`CREATE TABLE "table_hold" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "event_id" uuid NOT NULL, "table_id" uuid NOT NULL, "order_id" uuid NOT NULL, "people" integer NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT "table_hold_order_table_unique" UNIQUE("order_id","table_id"), CONSTRAINT "table_hold_people_positive" CHECK ("people" > 0))`);
    await c.query(`ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade`);
    await c.query(`ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_table_id_sector_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade`);
    await c.query(`ALTER TABLE "table_hold" ADD CONSTRAINT "table_hold_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id")`);
    await c.query(`CREATE INDEX "table_hold_event_table_idx" ON "table_hold" USING btree ("event_id","table_id")`);
    console.log('creada table_hold');
  }
  const ok = (await has('event_table_block')) && (await has('table_hold'));
  console.log(ok ? 'OK: migración 0018 completa' : 'FALTA algo');
  await c.end();
  process.exit(ok ? 0 : 1);
})();
