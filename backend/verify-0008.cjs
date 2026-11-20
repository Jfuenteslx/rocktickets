// Comprobación de la migración 0008 (solo lectura). Se puede borrar después.
require('dotenv/config');
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const tablas = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('venue_level','venue_element') ORDER BY 1",
  );
  console.log('Tablas nuevas:', tablas.rows.map((r) => r.table_name).join(', ') || 'NINGUNA');
  const r = await c.query(
    `SELECT v.name AS local, l.name AS nivel, s.name AS sector, s.capacity, s.sellable, s.x
       FROM venue v
       JOIN venue_level l ON l.venue_id = v.id
       LEFT JOIN sector s ON s.level_id = l.id
      ORDER BY v.name, l.position, s.name`,
  );
  console.table(r.rows);
  const sin = await c.query('SELECT count(*)::int AS n FROM sector WHERE level_id IS NULL');
  console.log('Sectores sin nivel:', sin.rows[0].n);
  await c.end();
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
