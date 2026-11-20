// Limpieza de la base de datos de DESARROLLO: borra todo menos los usuarios (y los organizadores,
// que los usuarios de rol ORGANIZADOR necesitan: la tabla "user" lo exige con un CHECK).
//
//   node limpiar-bd.cjs                  -> solo MUESTRA qué se borraría (no cambia nada)
//   node limpiar-bd.cjs --confirmar      -> hace un respaldo en JSON y luego borra
//
// Por seguridad se niega a correr contra una base que no sea local (localhost / 127.0.0.1),
// salvo que agregues --permitir-remota. Se puede borrar este archivo después.
require('dotenv/config');
const fs = require('fs');
const { Client } = require('pg');

const CONSERVAR = ['user', 'organizer'];
const BORRAR = [
  'audit_log', 'access', 'staff_event', 'payment', 'order_item', 'order',
  'courtesy', 'ticket', 'tier', 'event', 'venue_element', 'sector', 'venue_level', 'venue',
];
const q = (t) => `"${t}"`;

(async () => {
  const url = new URL(process.env.DATABASE_URL);
  const destino = `${url.hostname}:${url.port || 5432}${url.pathname}`;
  const confirmar = process.argv.includes('--confirmar');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  console.log(`Base de datos: ${destino}`);
  if (!local && !process.argv.includes('--permitir-remota')) {
    console.error('Esta base NO es local. No toco nada. (Si de verdad quieres, agrega --permitir-remota)');
    process.exit(1);
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const existentes = (
    await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
  ).rows.map((r) => r.table_name);
  const aBorrar = BORRAR.filter((t) => existentes.includes(t));
  const aConservar = CONSERVAR.filter((t) => existentes.includes(t));

  const contar = async (t) => (await c.query(`SELECT count(*)::int AS n FROM ${q(t)}`)).rows[0].n;
  console.log('\nSe CONSERVAN:');
  for (const t of aConservar) console.log(`  ${t}: ${await contar(t)} filas`);
  console.log('\nSe BORRAN:');
  for (const t of aBorrar) console.log(`  ${t}: ${await contar(t)} filas`);

  if (!confirmar) {
    console.log('\nNo se cambió nada. Para borrar de verdad: node limpiar-bd.cjs --confirmar');
    await c.end();
    return;
  }

  // 1) Respaldo en JSON (por si hay que recuperar algo a mano)
  const respaldo = {};
  for (const t of [...aConservar, ...aBorrar]) respaldo[t] = (await c.query(`SELECT * FROM ${q(t)}`)).rows;
  const archivo = `respaldo-limpieza-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
  console.log(`\nRespaldo guardado: ${archivo}`);

  // 2) Borrado en una sola transacción: o se borra todo o no se borra nada
  const usuariosAntes = await contar('user');
  try {
    await c.query('BEGIN');
    await c.query(`TRUNCATE TABLE ${aBorrar.map(q).join(', ')} RESTART IDENTITY CASCADE`);
    const usuariosDespues = await contar('user');
    if (usuariosDespues !== usuariosAntes) {
      throw new Error(`Los usuarios cambiaron (${usuariosAntes} -> ${usuariosDespues}). Se cancela.`);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Error, no se borró nada:', e.message);
    process.exit(1);
  }

  console.log('\nListo. Estado final:');
  for (const t of [...aConservar, ...aBorrar]) console.log(`  ${t}: ${await contar(t)} filas`);
  await c.end();
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
