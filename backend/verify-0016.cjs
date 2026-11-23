// Verifica (y aplica si falta) la migración 0016: modo de ubicación del evento y asiento en el ticket.
// Uso: node verify-0016.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function state(sql) {
  const [e] = await sql`select 1 as ok from pg_type where typname = 'seating_mode'`;
  const ev = await sql`select 1 from information_schema.columns where table_name = 'event' and column_name = 'seating_mode'`;
  const tk = await sql`select 1 from information_schema.columns where table_name = 'ticket' and column_name = 'seat_id'`;
  const ix = await sql`select 1 from pg_indexes where indexname = 'ticket_event_seat_unique'`;
  return {
    enum_seating_mode: !!e,
    event_seating_mode: ev.length === 1,
    ticket_seat_id: tk.length === 1,
    ticket_event_seat_unique: ix.length === 1,
  };
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    console.log('Antes:', await state(sql));
    await sql.unsafe(`DO $$ BEGIN
      CREATE TYPE "public"."seating_mode" AS ENUM('NINGUNO', 'BUTACAS', 'MESAS_FIJAS', 'MESAS_FLEXIBLES');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await sql.unsafe(`ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "seating_mode" "seating_mode" DEFAULT 'NINGUNO' NOT NULL`);
    await sql.unsafe(`ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "seat_id" uuid`);
    const fk = await sql`select 1 from pg_constraint where conname = 'ticket_seat_id_seat_id_fk'`;
    if (fk.length === 0) {
      await sql.unsafe(`ALTER TABLE "ticket" ADD CONSTRAINT "ticket_seat_id_seat_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seat"("id") ON DELETE no action ON UPDATE no action`);
    }
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ticket_event_seat_unique" ON "ticket" USING btree ("event_id","seat_id") WHERE "ticket"."seat_id" IS NOT NULL`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "ticket_seat_id_idx" ON "ticket" USING btree ("seat_id")`);
    console.log('Después:', await state(sql));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
