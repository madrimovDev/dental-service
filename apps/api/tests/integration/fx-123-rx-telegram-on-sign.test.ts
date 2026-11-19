/**
 * FX-123 (LC-01) — vizitga bog'langan retsept xabari (Telegram) vizit IMZOLANGANDA ketadi (REAL DB).
 * Avval: retsept yaratilishi bilan (qoralama vizitda ham) bemorga xabar ketardi — shifokor
 * keyin tuzatsa ham chaqirib bo'lmasdi. Endi: visitNoteId bor va vizit imzolanmagan bo'lsa
 * xabar kutiladi; `visitNotes.sign` commit'dan keyin shu vizitning retseptlarini yuboradi.
 * Vizitsiz retsept (PrescriptionsTab) — avvalgidek darhol.
 *
 *   cd apps/api && bun test tests/integration/fx-123-rx-telegram-on-sign.test.ts --env-file=../../.env --timeout 30000
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { patients, tenants, users, visitNotes } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import type { PatientMessenger } from '../../src/lib/telegram/notify.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';
import { createPrescriptionsService } from '../../src/modules/prescriptions/prescriptions.service.ts';

const audit = { record: async () => {} } as unknown as AuditLogger;
const sent: Array<{ patientId: string; names: string[] }> = [];
const messenger = {
  sendPrescription: async (a: { patientId: string; items: Array<{ medicationName: string }> }) => {
    sent.push({ patientId: a.patientId, names: a.items.map((i) => i.medicationName) });
  },
} as unknown as PatientMessenger;
const rxService = createPrescriptionsService({ audit, messenger });
const noteService = createVisitNotesService({ audit, messenger });

let tenantId: string;
let doctorId: string;
let patientId: string;
let noteId: string;

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
              ? { perms: ['prescription.manage', 'visit_note.manage'] }
              : undefined,
    req: { header: () => undefined },
  }) as unknown as Context;

const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

const item = (name: string) => [{ medicationName: name, dosage: '1', frequency: '1x' }];

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [d] = await db
    .insert(users)
    .values({ phone: '+998900012301', passwordHash: 'x', fullName: 'Doctor123' })
    .returning({ id: users.id });
  doctorId = d!.id;
  const [t] = await db
    .insert(tenants)
    .values({ name: 'FX123', slug: 'fx123', ownerUserId: doctorId })
    .returning({ id: tenants.id });
  tenantId = t!.id;
  await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 123' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const [n] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId, subjective: 'x' })
      .returning({ id: visitNotes.id });
    noteId = n!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('FX-123 — retsept xabari vizit imzosigacha kutiladi', () => {
  test('qoralama vizitga retsept → xabar KETMAYDI', async () => {
    const rx = await inTenant((tx) =>
      rxService.create(ctx(tx), {
        patientId,
        doctorId,
        visitNoteId: noteId,
        items: item('Draft-dori'),
      } as never),
    );
    expect(rx?.visitNoteId).toBe(noteId);
    expect(sent).toHaveLength(0);
  });

  test('vizitsiz retsept → xabar darhol ketadi (avvalgidek)', async () => {
    await inTenant((tx) =>
      rxService.create(ctx(tx), { patientId, doctorId, items: item('Vizitsiz-dori') } as never),
    );
    expect(sent.map((s) => s.names)).toEqual([['Vizitsiz-dori']]);
  });

  test('vizit imzolanganda — bog‘langan retseptlar xabari bir marta ketadi', async () => {
    sent.length = 0;
    await inTenant((tx) =>
      rxService.create(ctx(tx), {
        patientId,
        doctorId,
        visitNoteId: noteId,
        items: item('Ikkinchi-dori'),
      } as never),
    );
    expect(sent).toHaveLength(0);
    await inTenant((tx) => noteService.sign(ctx(tx), noteId));
    expect(sent.map((s) => s.names).sort()).toEqual([['Draft-dori'], ['Ikkinchi-dori']]);
    expect(sent.every((s) => s.patientId === patientId)).toBe(true);
  });

  test('retseptsiz vizit imzosi — xabar yo‘q', async () => {
    sent.length = 0;
    const n = await inTenant(async (tx) => {
      const [x] = await tx
        .insert(visitNotes)
        .values({ tenantId, patientId, doctorId, subjective: 'y' })
        .returning({ id: visitNotes.id });
      return x!.id;
    });
    await inTenant((tx) => noteService.sign(ctx(tx), n));
    expect(sent).toHaveLength(0);
  });
});
