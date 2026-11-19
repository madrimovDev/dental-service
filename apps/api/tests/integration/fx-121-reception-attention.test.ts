/**
 * FX-121 (LB-30) — Registrator (`lab_order.view`siz) `GET /dashboard/reception-attention`
 * orqali muddati o'tgan lab sonini oladi (20 tadan tashqaridagi ham). REAL DB + real route,
 * cheklangan rollar.
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-121-reception-attention.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dashCall, fx, labCall, permsOf, setup, teardown } from './fx-j3-fixture.ts';

beforeAll(() => setup('fx121', '+99890000913'));
afterAll(teardown);

describe('FX-121 — Registrator muddati o`tgan lab soni', () => {
  test('sanity: Receptionist lab_order.view ga ega emas, appointment.view bor', () => {
    expect(permsOf('receptionist')).not.toContain('lab_order.view');
    expect(permsOf('receptionist')).not.toContain('@owner');
    expect(permsOf('receptionist')).toContain('appointment.view');
  });

  test('GET /lab-orders — Registratorga 403 (eski yo`l ishlamasdi)', async () => {
    expect((await labCall(fx.recepToken, 'GET', '/')).status).toBe(403);
  });

  test('GET /dashboard/reception-attention → overdueLabs=1', async () => {
    const res = await dashCall(fx.recepToken, 'GET', '/reception-attention');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { overdueLabs: number } };
    expect(body.data.overdueLabs).toBe(1);
  });

  test('appointment.view yo`q rol (Technician) → 403', async () => {
    expect((await dashCall(fx.techToken, 'GET', '/reception-attention')).status).toBe(403);
  });
});
