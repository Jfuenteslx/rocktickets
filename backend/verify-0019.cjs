// Verifica (y completa si falta) la migración 0019: pago manual con verificación del superadmin.
require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const enumHas = async (v) =>
    (await c.query("select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'payment_status' and e.enumlabel = $1", [v])).rowCount > 0;
  for (const v of ['EN_REVISION', 'RECHAZADO']) {
    if (!(await enumHas(v))) {
      await c.query(`ALTER TYPE "public"."payment_status" ADD VALUE '${v}'`);
      console.log(`agregado estado ${v}`);
    }
  }
  const cols = {
    payer_name: 'text', payer_email: 'text', payer_phone: 'text', declared_at: 'timestamp with time zone',
    reviewed_by: 'uuid', reviewed_at: 'timestamp with time zone', review_note: 'text',
  };
  const have = new Set((await c.query("select column_name from information_schema.columns where table_name = 'payment'")).rows.map((r) => r.column_name));
  for (const [name, type] of Object.entries(cols)) {
    if (!have.has(name)) {
      await c.query(`ALTER TABLE "payment" ADD COLUMN "${name}" ${type}`);
      console.log(`agregada columna payment.${name}`);
    }
  }
  const fk = (await c.query("select 1 from information_schema.table_constraints where table_name = 'payment' and constraint_name = 'payment_reviewed_by_user_id_fk'")).rowCount > 0;
  if (!fk) {
    await c.query(`ALTER TABLE "payment" ADD CONSTRAINT "payment_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id")`);
    console.log('agregada FK payment.reviewed_by');
  }
  const ok = (await enumHas('EN_REVISION')) && (await enumHas('RECHAZADO'));
  console.log(ok ? 'OK: migración 0019 completa' : 'FALTA algo');
  await c.end();
  process.exit(ok ? 0 : 1);
})();
