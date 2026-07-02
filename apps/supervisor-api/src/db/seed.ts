// STUB — real implementation lands in Task 6 (admin user seeding: reads
// ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD, bcrypt-hashes, upserts into
// admin_users). migrate.ts must call this from day 1 — the original
// supervisor-service attempt wrote seed.ts but never wired it into the
// migration step, so seeding silently never happened. This no-op keeps
// that wiring in place while Task 6 fills in the real logic.
export async function seedAdminUser(): Promise<void> {
  // no-op (Task 6)
}
