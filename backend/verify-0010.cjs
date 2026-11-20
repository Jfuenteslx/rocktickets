// Comprueba que la migración 0010 (mesas y asientos) quedó aplicada. Se puede borrar después.
require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const t = await c.query("select to_regclass('public.seat') as seat, to_regclass('public.sector_table') as sector_table");
  const m = await c.query('select count(*)::int as n from drizzle.__drizzle_migrations');
  console.log('Tablas:', t.rows[0]);
  console.log('Migraciones aplicadas:', m.rows[0].n);
  await c.end();
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
