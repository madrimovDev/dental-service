import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { adminUsers } from './schema';

// Bootstraps the first Supervisor admin account from env vars, so a fresh VPS
// deploy has a way to log into the admin panel without a manual SQL insert.
// Called once by migrate.ts after migrations run (see Task 1 wiring). No-ops
// if either env var is absent, and is idempotent — safe to run on every deploy.
export async function seedAdminUser(): Promise<void> {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) return;

  const existing = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(adminUsers).values({ email, passwordHash });
  console.log(`[seed] Admin user yaratildi: ${email}`);
}
