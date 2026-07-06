import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { adminUsers } from './schema';
import { seedAdminUser } from './seed';

// Real DB integration test (same `supervisor` dev DB as db.test.ts) — seeding
// the bootstrap admin account is auth-critical, so this is TDD'd against a
// real database rather than mocked.
describe('seedAdminUser', () => {
  const testEmail = `seed-test-${crypto.randomUUID()}@example.test`;
  const testPassword = 'correct horse battery staple';

  let originalEmail: string | undefined;
  let originalPassword: string | undefined;

  beforeEach(() => {
    originalEmail = process.env.ADMIN_SEED_EMAIL;
    originalPassword = process.env.ADMIN_SEED_PASSWORD;
  });

  afterEach(async () => {
    if (originalEmail === undefined) delete process.env.ADMIN_SEED_EMAIL;
    else process.env.ADMIN_SEED_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.ADMIN_SEED_PASSWORD;
    else process.env.ADMIN_SEED_PASSWORD = originalPassword;

    await db.delete(adminUsers).where(eq(adminUsers.email, testEmail));
  });

  test('no-ops when ADMIN_SEED_PASSWORD is missing (even if email is set)', async () => {
    process.env.ADMIN_SEED_EMAIL = testEmail;
    delete process.env.ADMIN_SEED_PASSWORD;

    await seedAdminUser();

    const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, testEmail) });
    expect(row).toBeUndefined();
  });

  test('no-ops when ADMIN_SEED_EMAIL is missing (even if password is set)', async () => {
    delete process.env.ADMIN_SEED_EMAIL;
    process.env.ADMIN_SEED_PASSWORD = testPassword;

    await seedAdminUser();

    const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, testEmail) });
    expect(row).toBeUndefined();
  });

  test('creates an admin user with a bcrypt-hashed password when none exists yet', async () => {
    process.env.ADMIN_SEED_EMAIL = testEmail;
    process.env.ADMIN_SEED_PASSWORD = testPassword;

    await seedAdminUser();

    const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, testEmail) });
    expect(row).toBeDefined();
    expect(row?.email).toBe(testEmail);
    expect(row?.passwordHash).not.toBe(testPassword);
    expect(await bcrypt.compare(testPassword, row?.passwordHash ?? '')).toBe(true);
  });

  test('does not create a duplicate on a second call', async () => {
    process.env.ADMIN_SEED_EMAIL = testEmail;
    process.env.ADMIN_SEED_PASSWORD = testPassword;

    await seedAdminUser();
    await seedAdminUser();

    const rows = await db.query.adminUsers.findMany({ where: eq(adminUsers.email, testEmail) });
    expect(rows).toHaveLength(1);
  });
});
