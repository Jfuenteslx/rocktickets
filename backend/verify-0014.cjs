// Verifica (y aplica si falta) la migración 0014: constancia de aceptación de términos en la orden.
// Uso: node verify-0014.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function state(sql) {
  const cols = await sql`
    select column_name from information_schema.columns
    where table_name = 'order' and column_name in ('terms_accepted_at','terms_version')`;
  return cols.map((c) => c.column_name).sort();
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    console.log('Antes:', await state(sql));
    await sql.unsafe(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp with time zone`);
    await sql.unsafe(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "terms_version" text`);
    console.log('Después:', await state(sql));
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
