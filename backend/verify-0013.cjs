// Verifica (y aplica si falta) la migración 0013: ficha del local (dirección, mapa, horarios, fotos).
// Uso: node verify-0013.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function state(sql) {
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'venue' and column_name in ('address','maps_url','opening_hours')`;
  const [t] = await sql`select to_regclass('venue_photo') as t`;
  return { columnasVenue: cols.map((c) => c.column_name).sort(), venue_photo: !!t.t };
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    console.log('Antes:', await state(sql));
    await sql.unsafe(`ALTER TABLE "venue" ADD COLUMN IF NOT EXISTS "address" text`);
    await sql.unsafe(`ALTER TABLE "venue" ADD COLUMN IF NOT EXISTS "maps_url" text`);
    await sql.unsafe(`ALTER TABLE "venue" ADD COLUMN IF NOT EXISTS "opening_hours" jsonb`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS "venue_photo" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "venue_id" uuid NOT NULL REFERENCES "public"."venue"("id"),
      "path" text NOT NULL,
      "position" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "venue_photo_venue_id_idx" ON "venue_photo" USING btree ("venue_id")`);
    console.log('Después:', await state(sql));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
