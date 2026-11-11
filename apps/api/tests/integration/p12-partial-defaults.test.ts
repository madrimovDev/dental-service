/**
 * P12 — update (PATCH) schema'lar default qiymatlarni ustiga yozmasin.
 * Zod 4 `.partial()` ZodDefault'ni saqlaydi → `{}`/bitta maydon PATCH default'larni qo'llardi.
 * Visit-notes REAL DB orqali (route validatsiyasi ssxemasi + service.update), qolganlari sxema darajasida.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env p12-partial-defaults`
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users, visitNotes } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { updateVisitNoteTemplateSchema } from '../../src/modules/clinical/visit-notes/visit-note-templates.schema.ts';
import { updateVisitNoteSchema } from '../../src/modules/clinical/visit-notes/visit-notes.schema.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';
import { updateTemplateSchema } from '../../src/modules/consent/consent.schema.ts';
import { updateServiceSchema } from '../../src/modules/services/services.schema.ts';
import { updateItemSchema } from '../../src/modules/stock/stock.schema.ts';

const service = createVisitNotesService({ audit: createAuditLogger({ db }) });
const DIAG = '11111111-1111-4111-8111-111111111111';
const SVC = '22222222-2222-4222-8222-222222222222';

let tenantId: string;
let userId: string;
let noteId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: userId }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900000112', passwordHash: 'x', fullName: 'Doctor' })
    .returning({ id: users.id });
  userId = u!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'P12', slug: 'p12-clinic', ownerUserId: userId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'B' })
      .returning({ id: patients.id });
    const [n] = await tx
      .insert(visitNotes)
      .values({
        tenantId,
        patientId: p!.id,
        doctorId: userId,
        assessmentDiagnoses: [DIAG],
        performedServices: [],
      })
      .returning({ id: visitNotes.id });
    noteId = n!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('P12 — PATCH default bilan ustiga yozmaydi', () => {
  test('visit-note PATCH { subjective } (real DB) assessmentDiagnoses/performedServices ni bo‘shatmaydi', async () => {
    const input = updateVisitNoteSchema.parse({ subjective: 'yangi' });
    expect(input.assessmentDiagnoses).toBeUndefined();
    expect(input.performedServices).toBeUndefined();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await service.update(ctx(tx), noteId, input);
    });
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const [r] = await tx.select().from(visitNotes).where(eq(visitNotes.id, noteId));
      return r!;
    });
    expect(row.subjective).toBe('yangi');
    expect(row.assessmentDiagnoses).toEqual([DIAG]);
  });

  test('visit-note: aniq yuborilgan bo‘sh massiv hali ham qabul qilinadi', () => {
    expect(updateVisitNoteSchema.parse({ performedServices: [] }).performedServices).toEqual([]);
    expect(updateVisitNoteSchema.parse({ performedServices: [SVC] }).performedServices).toEqual([
      SVC,
    ]);
  });

  test('services / consent / templates / stock: bitta maydon PATCH default qo‘shmaydi', () => {
    const s = updateServiceSchema.parse({ nameUz: 'Yangi' });
    expect(s.durationMinutes).toBeUndefined();
    expect(s.isActive).toBeUndefined();
    expect(updateTemplateSchema.parse({ title: 'Sarlavha' }).isActive).toBeUndefined();
    const vt = updateVisitNoteTemplateSchema.parse({ name: 'N' });
    expect(vt.isShared).toBeUndefined();
    expect(vt.template).toBeUndefined();
    expect(updateItemSchema.parse({ name: 'N' }).minThreshold).toBeUndefined();
  });
});
