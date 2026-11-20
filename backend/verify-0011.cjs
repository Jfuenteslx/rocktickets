// Verifica (y aplica si falta) la columna event.category de la migración 0011.
// Uso: node verify-0011.cjs   (desde la carpeta backend)
require('dotenv/config');
const postgres = require('postgres');

async function hasColumn(sql) {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_name = 'event' and column_name = 'category'`;
  return rows.length > 0;
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const db = await sql`select current_database() as db`;
    console.log('Base de datos:', db[0].db);

    const before = await hasColumn(sql);
    console.log('event.category existe antes:', before);
    if (!before) {
      await sql.unsafe(
        `ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'CONCIERTO' NOT NULL`,
      );
      console.log('Columna creada. Existe ahora:', await hasColumn(sql));
    }

    try {
      const rows = await sql`
        select id, created_at from drizzle.__drizzle_migrations
        order by created_at desc limit 3`;
      console.log('Últimas migraciones registradas por drizzle:', rows);
    } catch (e) {
      console.log('No hay tabla de control de drizzle:', e.message);
    }
  } finally {
    await sql.end();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
