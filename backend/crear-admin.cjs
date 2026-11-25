// Crea el PRIMER superadmin de producción, con una contraseña que eliges tú (sin contraseñas conocidas).
//
//   node crear-admin.cjs --email tu@correo.com --nombre "Tu Nombre"
//
// Te pide la contraseña en la terminal (no se ve al escribir ni queda en el historial).
// Si el correo ya existe NO lo toca: para cambiar una contraseña usa --cambiar-clave.
// Requiere DATABASE_URL en el entorno o en .env.
require('dotenv/config');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);

function readHidden(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Sin terminal (p. ej. pruebas): lee una línea de la entrada estándar
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', () => resolve(data.split('\n')[0].trim()));
      return;
    }
    process.stdout.write(prompt);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(130); // Ctrl+C
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

(async () => {
  const email = (arg('email') ?? '').trim().toLowerCase();
  const nombre = (arg('nombre') ?? '').trim();
  const cambiar = flag('cambiar-clave');
  if (!/^\S+@\S+\.\S+$/.test(email) || (!cambiar && nombre.length < 2)) {
    console.error('Uso: node crear-admin.cjs --email tu@correo.com --nombre "Tu Nombre"   (o --email ... --cambiar-clave)');
    process.exit(1);
  }
  if (/@rocktickets\.local$/.test(email) && process.env.NODE_ENV === 'production') {
    console.error('Usa tu correo real, no @rocktickets.local.');
    process.exit(1);
  }

  const pass1 = await readHidden('Contraseña (mín. 12 caracteres): ');
  if (pass1.length < 12) {
    console.error('La contraseña debe tener al menos 12 caracteres.');
    process.exit(1);
  }
  if (process.stdin.isTTY) {
    const pass2 = await readHidden('Repite la contraseña: ');
    if (pass1 !== pass2) {
      console.error('Las contraseñas no coinciden.');
      process.exit(1);
    }
  }
  if (/^(admin123|password|contraseña|123456789012)$/i.test(pass1)) {
    console.error('Esa contraseña es demasiado común.');
    process.exit(1);
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const hash = await bcrypt.hash(pass1, 12);
    const found = await c.query('select id, role from "user" where email = $1', [email]);
    if (cambiar) {
      if (found.rowCount === 0) throw new Error('Ese correo no existe.');
      await c.query('update "user" set password_hash = $1 where id = $2', [hash, found.rows[0].id]);
      console.log(`✅ Contraseña cambiada para ${email}`);
    } else {
      if (found.rowCount > 0) throw new Error('Ese correo ya existe: no se modificó. Para cambiar su contraseña usa --cambiar-clave.');
      const r = await c.query(
        `insert into "user" (email, password_hash, name, role) values ($1, $2, $3, 'SUPERADMIN') returning id`,
        [email, hash, nombre],
      );
      console.log(`✅ Superadmin creado: ${email} (id: ${r.rows[0].id})`);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
  await c.end();
})();
