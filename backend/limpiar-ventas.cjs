// Borra las VENTAS de prueba y deja todo lo demás: eventos, tiers, venues, usuarios, cuentas de comprador.
//
//   node limpiar-ventas.cjs               -> solo muestra qué borraría (no toca nada)
//   node limpiar-ventas.cjs --confirmar   -> lo borra, todo en una transacción (o nada)
//
// Se borra: órdenes (con sus líneas, pagos, avisos de pago, mesas apartadas y vouchers), cortesías
// y escaneos de puerta. Los tickets ya generados NO se borran: vuelven a DISPONIBLE, así que el
// stock de cada tier queda como antes de vender.
require('dotenv/config');
const { Client } = require('pg');

const confirmar = process.argv.includes('--confirmar');

// Por seguridad solo corre contra una base local, salvo que agregues --permitir-remota
const host = new URL(process.env.DATABASE_URL).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && !process.argv.includes('--permitir-remota')) {
  console.error(`La base de datos es remota (${host}). Este script borra ventas: si de verdad es lo que quieres, agrega --permitir-remota.`);
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const n = async (sql) => Number((await c.query(sql)).rows[0].n);

  const resumen = {
    'órdenes': await n('select count(*) n from "order"'),
    'líneas de orden': await n('select count(*) n from order_item'),
    'pagos': await n('select count(*) n from payment'),
    'avisos de pago': await n('select count(*) n from payment_event'),
    'vouchers de mesa': await n('select count(*) n from order_table'),
    'mesas apartadas (flexibles)': await n('select count(*) n from table_hold'),
    'cortesías': await n('select count(*) n from courtesy'),
    'escaneos de puerta': await n('select count(*) n from access'),
    'tickets vendidos/reservados/cortesía/anulados (vuelven a DISPONIBLE)': await n("select count(*) n from ticket where status <> 'DISPONIBLE' or order_item_id is not null or courtesy_id is not null"),
  };
  console.log(confirmar ? 'Se va a borrar:' : 'Se borraría (modo simulación):');
  for (const [k, v] of Object.entries(resumen)) console.log(`  ${String(v).padStart(6)}  ${k}`);

  if (!confirmar) {
    console.log('\nNo se tocó nada. Para borrar de verdad: node limpiar-ventas.cjs --confirmar');
    await c.end();
    return;
  }

  try {
    await c.query('begin');
    await c.query('delete from access');
    await c.query('delete from table_hold');
    await c.query('delete from order_table');
    await c.query('delete from payment_event');
    await c.query('delete from payment');
    await c.query(`update ticket set status = 'DISPONIBLE', order_item_id = null, courtesy_id = null
                   where status <> 'DISPONIBLE' or order_item_id is not null or courtesy_id is not null`);
    await c.query('delete from order_item');
    await c.query('delete from "order"');
    await c.query('delete from courtesy');
    await c.query('commit');
    console.log('\nListo: ventas de prueba eliminadas.');
    console.log('Tickets DISPONIBLES ahora:', await n("select count(*) n from ticket where status = 'DISPONIBLE'"));
  } catch (e) {
    await c.query('rollback');
    console.error('\nError, no se borró nada:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})();
