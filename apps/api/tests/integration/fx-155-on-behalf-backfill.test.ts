/**
 * FX-155 (review) — `medical_record.on_behalf` / `prescription.on_behalf` mavjud
 * tenantlarning tizim Tenant Admin rollariga migratsiya 0067 bilan backfill qilinadi
 * (REAL DB, migratsiya SQL fayli superuser ulanishida bevosita bajariladi).
 * Branch Manager'ga QO'SHILMAYDI (konservativ qaror). Idempotent (ikki marta yurgizish xavfsiz).
 *
 *   cd apps/api && bun test tests/integration/fx-155-on-behalf-backfill.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PERMISSIONS } from '@dental/core';
import { permissions as permissionsTable } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import { createAdminDb, db } from '../../src/db/client.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const ON_BEHALF = ['medical_record.on_behalf', 'prescription.on_behalf'];
const admin = createAdminDb();
const tenantIds: string[] = [];

const migrationStatements = (): string[] =>
  readFileSync(new URL('../../drizzle/0067_fx155_on_behalf_backfill.sql', import.meta.url), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

const runMigration = async () => {
  for (const stmt of migrationStatements()) await admin.db.execute(sql.raw(stmt));
};

/** (tenant_id, template_key) → on_behalf permission kodlari */
const onBehalfByRole = async () => {
  const rows = (await admin.db.execute(sql`
    SELECT r.tenant_id, r.template_key, r.is_system, p.code
    FROM roles r
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code IN ('medical_record.on_behalf', 'prescription.on_behalf')
    ORDER BY r.template_key, p.code
  `)) as unknown as { tenant_id: string; template_key: string | null; code: string }[];
  return rows;
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }
  for (const [name, phone] of [
    ['FX155 A', '+998900155001'],
    ['FX155 B', '+998900155002'],
  ] as const) {
    const res = await db.transaction((tx) =>
      provisionTenantInTx(tx, {
        tenantName: name,
        ownerPhone: phone,
        ownerFullName: `Owner ${name}`,
        ownerPassword: 'Passw0rd!x',
        defaultLanguage: 'uz',
      }),
    );
    tenantIds.push(res.tenantId);
  }
  // Migratsiyadan oldingi holat: permission qatorlari ham, rol bog'lanishlari ham yo'q.
  await admin.db.execute(sql`
    DELETE FROM role_permissions WHERE permission_id IN
      (SELECT id FROM permissions WHERE code IN ('medical_record.on_behalf', 'prescription.on_behalf'))
  `);
  await admin.db.execute(
    sql`DELETE FROM permissions WHERE code IN ('medical_record.on_behalf', 'prescription.on_behalf')`,
  );
  // Tenant A'da custom (shablonsiz) rol — backfill unga tegmasligi kerak.
  await admin.db.execute(
    sql`INSERT INTO roles (tenant_id, name, is_system) VALUES (${tenantIds[0]}, 'Custom', false)`,
  );
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await admin.client.end();
});

describe('FX-155 — on_behalf backfill migratsiyasi (0067)', () => {
  test("oldingi holat: hech bir rolda on_behalf yo'q", async () => {
    expect(await onBehalfByRole()).toHaveLength(0);
  });

  test("har tenantning tizim Tenant Admin roliga ikkala permission qo'shiladi, boshqa rollarga emas; idempotent", async () => {
    await runMigration();
    await runMigration(); // idempotent — xato yo'q, dublikat yo'q

    const perms = (await admin.db.execute(
      sql`SELECT code FROM permissions WHERE code IN ('medical_record.on_behalf', 'prescription.on_behalf') ORDER BY code`,
    )) as unknown as { code: string }[];
    expect(perms.map((p) => p.code)).toEqual([...ON_BEHALF].sort());

    const rows = await onBehalfByRole();
    expect(rows.every((r) => r.template_key === 'tenant_admin')).toBe(true);
    for (const tid of tenantIds) {
      const codes = rows.filter((r) => r.tenant_id === tid).map((r) => r.code);
      expect(codes.sort()).toEqual([...ON_BEHALF].sort());
    }
    // Branch Manager — konservativ: qo'shilmaydi.
    expect(rows.some((r) => r.template_key === 'branch_manager')).toBe(false);
  });
});
