/**
 * FX-112 (LB-21) — lab buyurtma shifokori amaliyotchi (`roles.is_practitioner`) bo'lishi shart;
 * Texnik `GET /lab-orders/doctors` orqali shifokorlar ro'yxatini oladi (`appointment.view`siz).
 * REAL DB + real route, cheklangan rollar.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-112-lab-order-doctor.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { labOrders } from '@dental/db-schema';
import { createLab, fx, labCall, permsOf, setup, teardown, withTenant } from './fx-j3-fixture.ts';

beforeAll(() => setup('fx112', '+99890000912'));
afterAll(teardown);

describe('FX-112 — buyurtma shifokori amaliyotchi bo`lishi shart', () => {
  test('sanity: Technician lab_order.manage bor, appointment.view yo`q', () => {
    expect(permsOf('technician')).toContain('lab_order.manage');
    expect(permsOf('technician')).not.toContain('appointment.view');
  });

  test('hamshira (is_practitioner=false) doctorId → 400, yozuv yaratilmaydi', async () => {
    const before = await withTenant(fx.tenantId, (tx) => tx.select().from(labOrders));
    const res = await createLab(fx.techToken, fx.nurseId);
    expect(res.status).toBe(400);
    const after = await withTenant(fx.tenantId, (tx) => tx.select().from(labOrders));
    expect(after.length).toBe(before.length);
  });

  test('tenantda assignment`siz user → 400', async () => {
    expect((await createLab(fx.techToken, fx.outsiderId)).status).toBe(400);
  });

  test('shifokor (is_practitioner=true) → 201', async () => {
    expect((await createLab(fx.techToken, fx.doctorId)).status).toBe(201);
  });

  test('tenant egasi (implicit superuser) doctorId → 201', async () => {
    expect((await createLab(fx.techToken, fx.ownerId)).status).toBe(201);
  });

  test('GET /lab-orders/doctors — Technician faqat shifokorlarni oladi', async () => {
    const res = await labCall(fx.techToken, 'GET', '/doctors');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((d) => d.id)).toEqual([fx.doctorId]);
  });

  test('GET /lab-orders/doctors — lab_order.manage siz rol (Receptionist) → 403', async () => {
    expect((await labCall(fx.recepToken, 'GET', '/doctors')).status).toBe(403);
  });
});
