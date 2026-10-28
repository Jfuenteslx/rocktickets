import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from './client.js';
import { user, venue, sector, organizer } from './index.js';
import { eq } from 'drizzle-orm';

async function seed() {
  const email = 'admin@rocktickets.local';
  const [existingUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (existingUser) {
    console.log('ℹ️  Admin ya existía, se omite creación');
  } else {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const [created] = await db
      .insert(user)
      .values({ email, passwordHash, name: 'Admin Rocktickets', role: 'SUPERADMIN' })
      .returning();
    console.log(`✅ Admin creado: ${email} / admin123 (id: ${created.id})`);
  }

  // Organizador por defecto (la migración 0004 ya lo crea en bases existentes)
  await db.insert(organizer).values({ name: 'Equinoccio' }).onConflictDoNothing();

  let [venueRow] = await db.select().from(venue).where(eq(venue.name, 'Equinoccio')).limit(1);

  if (venueRow) {
    console.log('ℹ️  Venue ya existía, se omite creación');
  } else {
    [venueRow] = await db.insert(venue).values({ name: 'Equinoccio' }).returning();
    console.log(`✅ Venue creado: Equinoccio (id: ${venueRow.id})`);
  }

  // Equinoccio tiene un solo sector por ahora; su capacidad ES el aforo del venue.
  const [existingSector] = await db
    .select()
    .from(sector)
    .where(eq(sector.venueId, venueRow.id))
    .limit(1);

  if (existingSector) {
    console.log('ℹ️  Sector ya existía, se omite creación');
  } else {
    await db.insert(sector).values({ venueId: venueRow.id, name: 'General', capacity: 200 });
    console.log('✅ Sector creado: General (capacidad 200)');
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
