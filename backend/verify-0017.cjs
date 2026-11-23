// Verifica (y completa si falta) la migración 0017: mesas fijas.
// Es idempotente: se puede correr las veces que haga falta.
//   node verify-0017.cjs
require('dotenv/config');
const { Client } = require('pg');

const STEPS = [
  [`ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "table_valid_until" text DEFAULT '23:00' NOT NULL`],
  [`CREATE TABLE IF NOT EXISTS "table_package" (
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
)`],
  [`CREATE TABLE IF NOT EXISTS "event_table" (
	"event_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	CONSTRAINT "event_table_event_id_table_id_pk" PRIMARY KEY("event_id","table_id")
)`],
  [`CREATE TABLE IF NOT EXISTS "order_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"package_name" text NOT NULL,
	"people" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"bottle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_table_order_table_unique" UNIQUE("order_id","table_id")
)`],
];

const FKS = [
  ['event_table', 'event_table_event_id_event_id_fk', 'FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action'],
  ['event_table', 'event_table_table_id_sector_table_id_fk', 'FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE cascade ON UPDATE no action'],
  ['event_table', 'event_table_package_id_table_package_id_fk', 'FOREIGN KEY ("package_id") REFERENCES "public"."table_package"("id") ON DELETE no action ON UPDATE no action'],
  ['event_table', 'event_table_tier_id_tier_id_fk', 'FOREIGN KEY ("tier_id") REFERENCES "public"."tier"("id") ON DELETE no action ON UPDATE no action'],
  ['order_table', 'order_table_order_id_order_id_fk', 'FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action'],
  ['order_table', 'order_table_table_id_sector_table_id_fk', 'FOREIGN KEY ("table_id") REFERENCES "public"."sector_table"("id") ON DELETE no action ON UPDATE no action'],
  ['table_package', 'table_package_event_id_event_id_fk', 'FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action'],
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "event_table_package_id_idx" ON "event_table" USING btree ("package_id")`,
  `CREATE INDEX IF NOT EXISTS "order_table_order_id_idx" ON "order_table" USING btree ("order_id")`,
  `CREATE INDEX IF NOT EXISTS "table_package_event_id_idx" ON "table_package" USING btree ("event_id")`,
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  for (const [sql] of STEPS) await c.query(sql);
  for (const [table, name, def] of FKS) {
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${def};
      END IF; END $$;`);
  }
  for (const sql of INDEXES) await c.query(sql);

  const has = async (q) => (await c.query(q)).rowCount > 0;
  const flags = {
    event_table_valid_until: await has(`SELECT 1 FROM information_schema.columns WHERE table_name='event' AND column_name='table_valid_until'`),
    table_package: await has(`SELECT 1 FROM information_schema.tables WHERE table_name='table_package'`),
    event_table: await has(`SELECT 1 FROM information_schema.tables WHERE table_name='event_table'`),
    order_table: await has(`SELECT 1 FROM information_schema.tables WHERE table_name='order_table'`),
    fks: (await c.query(`SELECT count(*)::int n FROM pg_constraint WHERE conname = ANY($1)`, [FKS.map((f) => f[1])])).rows[0].n === FKS.length,
  };
  console.log(flags);
  console.log(Object.values(flags).every(Boolean) ? 'OK: migración 0017 completa' : 'FALTA algo: revisa arriba');
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
