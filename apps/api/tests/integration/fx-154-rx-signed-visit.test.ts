/**
 * FX-154 (LC-32) — imzolangan vizitga bog'langan retsept serverda o'zgarmaydi (REAL DB).
 * Avval: prescriptions create/update/remove visitNoteId'ga bog'langan vizit imzolangan bo'lsa ham
 * ishlardi (imzolangan yozuv «o'zgarmas» degan kafolat teshik edi). Endi VisitNoteSignedError
 * (route → 409 `visit_note.signed`).
 *
 *   cd apps/api && bun test tests/integration/fx-154-rx-signed-visit.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, prescriptions, tenants, users, visitNotes } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { VisitNoteSignedError } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const audit = { record: async () => {} } as unknown as AuditLogger;
const service = createPrescriptionsService({ audit });

let tenantId: string;
let doctorId: string;
let patientId: string;
let draftNoteId: string;
let signedNoteId: string;
let signedRxId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: doctorId }
            : k === 'accessClaims'
              ? { perms: ['prescription.manage'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const items = [{ medicationName: 'Ibuprofen', dosage: '200mg', frequency: '2x/kun' }];
const rxCountFor = (noteId: string) =>
  inTenant(
    async (tx) =>
      (await tx.select().from(prescriptions).where(eq(prescriptions.visitNoteId, noteId))).length,
  );

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [d] = await db
    .insert(users)
    .values({ phone: '+998900015401', passwordHash: 'x', fullName: 'Doctor154' })
    .returning({ id: users.id });
  doctorId = d!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX154', slug: 'fx154', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 154' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const mk = async (signed: boolean) => {
      const [n] = await tx
        .insert(visitNotes)
        .values({
          tenantId,
          patientId,
          doctorId,
          subjective: 'x',
          signedAt: signed ? new Date() : null,
          signedBy: signed ? doctorId : null,
        })
        .returning({ id: visitNotes.id });
      return n!.id;
    };
    draftNoteId = await mk(false);
    signedNoteId = await mk(true);
    const [rx] = await tx
      .insert(prescriptions)
      .values({ tenantId, patientId, doctorId, visitNoteId: signedNoteId, items })
      .returning({ id: prescriptions.id });
    signedRxId = rx!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-154 — retsept ↔ imzolangan vizit', () => {
  test('create: imzolangan vizitga retsept → VisitNoteSignedError, yozuv yaratilmaydi', async () => {
    const before = await rxCountFor(signedNoteId);
    await expect(
      inTenant((tx) =>
        service.create(ctx(tx), { patientId, doctorId, visitNoteId: signedNoteId, items } as never),
      ),
    ).rejects.toBeInstanceOf(VisitNoteSignedError);
    expect(await rxCountFor(signedNoteId)).toBe(before);
  });

  test('update: imzolangan vizitning retsepti → rad, o‘zgarmaydi', async () => {
    await expect(
      inTenant((tx) => service.update(ctx(tx), signedRxId, { notes: 'o‘zgardi' } as never)),
    ).rejects.toBeInstanceOf(VisitNoteSignedError);
    const [row] = await inTenant((tx) =>
      tx.select().from(prescriptions).where(eq(prescriptions.id, signedRxId)),
    );
    expect(row?.notes).toBeNull();
  });

  test('update: retseptni imzolangan vizitga ko‘chirish → rad', async () => {
    const rx = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId, visitNoteId: draftNoteId, items } as never),
    );
    await expect(
      inTenant((tx) => service.update(ctx(tx), rx!.id, { visitNoteId: signedNoteId } as never)),
    ).rejects.toBeInstanceOf(VisitNoteSignedError);
  });

  test('remove: imzolangan vizitning retsepti → rad, o‘chmaydi', async () => {
    await expect(inTenant((tx) => service.remove(ctx(tx), signedRxId))).rejects.toBeInstanceOf(
      VisitNoteSignedError,
    );
    expect(await rxCountFor(signedNoteId)).toBe(1);
  });

  test('qoralama vizit va vizitsiz retsept — avvalgidek ishlaydi', async () => {
    const a = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId, visitNoteId: draftNoteId, items } as never),
    );
    expect(a?.visitNoteId).toBe(draftNoteId);
    const upd = await inTenant((tx) => service.update(ctx(tx), a!.id, { notes: 'ok' } as never));
    expect(upd?.notes).toBe('ok');
    const b = await inTenant((tx) =>
      service.create(ctx(tx), { patientId, doctorId, items } as never),
    );
    expect(b?.visitNoteId).toBeNull();
    expect(await inTenant((tx) => service.remove(ctx(tx), b!.id))).not.toBeNull();
    expect(await inTenant((tx) => service.remove(ctx(tx), a!.id))).not.toBeNull();
  });
});
