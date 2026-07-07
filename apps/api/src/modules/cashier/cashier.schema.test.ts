import { describe, expect, it } from 'bun:test';
import { createTransactionSchema } from './cashier.schema.ts';

const branchId = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
const stageId = '33333333-3333-4333-8333-333333333333';

describe('createTransactionSchema', () => {
  it("erkin POS: items bilan o'tadi", () => {
    const r = createTransactionSchema.safeParse({
      branchId,
      items: [{ serviceId, quantity: 1, unitPrice: 50000, serviceName: 'Konsultatsiya' }],
      paidAmount: 50000,
      paymentMethod: 'cash',
    });
    expect(r.success).toBe(true);
  });

  it("plan-billing: items YO'Q, faqat allocations bilan o'tadi (regressiya — 400 bug)", () => {
    const r = createTransactionSchema.safeParse({
      branchId,
      treatmentPlanId: '44444444-4444-4444-8444-444444444444',
      allocations: [{ stageId, amount: 120000 }],
      paidAmount: 120000,
      paymentMethod: 'card',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items).toEqual([]);
  });

  it('na items na allocations — RAD etiladi', () => {
    const r = createTransactionSchema.safeParse({
      branchId,
      paidAmount: 0,
      paymentMethod: 'cash',
    });
    expect(r.success).toBe(false);
  });

  it("items VA allocations ikkalasi ham to'ldirilgan — RAD etiladi (CLI-453 #3)", () => {
    const r = createTransactionSchema.safeParse({
      branchId,
      treatmentPlanId: '44444444-4444-4444-8444-444444444444',
      items: [{ serviceId, quantity: 1, unitPrice: 50000, serviceName: 'Konsultatsiya' }],
      allocations: [{ stageId, amount: 50000 }],
      paidAmount: 50000,
      paymentMethod: 'cash',
    });
    expect(r.success).toBe(false);
  });
});
