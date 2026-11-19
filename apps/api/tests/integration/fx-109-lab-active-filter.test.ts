/**
 * FX-109 (LB-18) — dashboard faol lab buyurtmalarni serverda filtrlaydi: eng yangi 20 tadan
 * tashqaridagi eski faol buyurtma Texnik navbatidan yo'qolmaydi. REAL DB + real route,
 * cheklangan rol (Technician).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/fx-109-lab-active-filter.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { fx, labCall, permsOf, setup, teardown } from './fx-j3-fixture.ts';

beforeAll(() => setup('fx109', '+99890000911'));
afterAll(teardown);

type Page = { data: { data: { notes: string; status: string }[]; meta: { total: number } } };

describe('FX-109 — faol buyurtmalar serverda filtrlanadi (Technician)', () => {
  test('sanity: Technician @owner emas', () => {
    expect(permsOf('technician')).not.toContain('@owner');
  });

  test("oddiy ro'yxat (pageSize=20) eski faol buyurtmani KESADI — nuqson dalili", async () => {
    const res = await labCall(fx.techToken, 'GET', '/');
    const body = (await res.json()) as Page;
    expect(body.data.data.some((o) => o.notes === 'OLDEST-ACTIVE')).toBe(false);
  });

  test('activeOnly=true — eski faol buyurtma ro`yxatda, yetkazilganlar yo`q', async () => {
    const res = await labCall(fx.techToken, 'GET', '/?activeOnly=true&pageSize=100');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Page;
    expect(body.data.data.map((o) => o.notes)).toEqual(['OLDEST-ACTIVE']);
    expect(body.data.meta.total).toBe(1);
  });
});
