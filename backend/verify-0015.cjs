// Verifica (y aplica si falta) la migración 0015: cuentas de comprador (inicio de sesión con Google).
// Uso: node verify-0015.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function state(sql) {
  const [t] = await sql`select to_regclass('buyer_account') as t`;
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'order' and column_name = 'buyer_id'`;
  return { buyer_account: !!t.t, order_buyer_id: cols.length === 1 };
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    console.log('Antes:', await state(sql));
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS "buyer_account" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "google_sub" text NOT NULL,
      "email" text NOT NULL,
      "name" text NOT NULL,
      "picture_url" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "buyer_account_google_sub_unique" UNIQUE("google_sub")
    )`);
    await sql.unsafe(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "buyer_id" uuid`);
    const fk = await sql`select 1 from pg_constraint where conname = 'order_buyer_id_buyer_account_id_fk'`;
    if (fk.length === 0) {
      await sql.unsafe(`ALTER TABLE "order" ADD CONSTRAINT "order_buyer_id_buyer_account_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyer_account"("id") ON DELETE no action ON UPDATE no action`);
    }
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS "order_buyer_id_idx" ON "order" USING btree ("buyer_id")`);
    console.log('Después:', await state(sql));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
