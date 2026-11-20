// Verifica (y aplica si falta) lo de la migración 0012: pagos PagosYa simulado.
// Uso: node verify-0012.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function state(sql) {
  const [t] = await sql`select to_regclass('payment_event') as t`;
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'payment' and column_name in ('qr_payload','checkout_expires_at')`;
  const [e] = await sql`
    select count(*)::int as n from pg_enum en
    join pg_type ty on ty.oid = en.enumtypid
    where ty.typname = 'payment_status' and en.enumlabel = 'NO_CONCILIADO'`;
  return { payment_event: !!t.t, columnas: cols.map((c) => c.column_name).sort(), enumNoConciliado: e.n === 1 };
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    console.log('Antes:', await state(sql));

    // Todo idempotente: solo crea lo que falte.
    await sql.unsafe(`ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'NO_CONCILIADO'`);
    await sql.unsafe(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "qr_payload" text`);
    await sql.unsafe(`ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "checkout_expires_at" timestamp with time zone`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS "payment_event" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "payment_id" uuid REFERENCES "public"."payment"("id"),
      "reference" text NOT NULL,
      "provider_tx_id" text NOT NULL,
      "kind" text NOT NULL,
      "amount" numeric(10, 2) NOT NULL,
      "raw" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`);
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "payment_event_provider_tx_unique" ON "payment_event" USING btree ("provider_tx_id")`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "payment_event_payment_id_idx" ON "payment_event" USING btree ("payment_id")`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "payment_event_kind_idx" ON "payment_event" USING btree ("kind")`);

    console.log('Después:', await state(sql));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
