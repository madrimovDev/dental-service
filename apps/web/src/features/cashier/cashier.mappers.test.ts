import type { CashierTransaction, PlanBalance, Service, ServicePrice } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  buildAllocationPayload,
  buildCreatePayload,
  computeNetTotal,
  findActivePrice,
  toPlanBalanceVM,
  toTransactionVM,
} from './cashier.mappers';
import type { CartItem } from './cashier.types';

function price(over: Partial<ServicePrice> = {}): ServicePrice {
  return {
    id: 'pr1',
    serviceId: 's1',
    branchId: 'b1',
    price: '50000',
    currency: 'UZS',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function svc(over: Partial<Service> = {}): Service {
  return {
    id: 's1',
    tenantId: 't',
    code: 'PL-001',
    nameUz: 'Plomba',
    nameRu: 'Пломба',
    category: null,
    durationMinutes: 30,
    requiredRole: null,
    descriptionUz: null,
    descriptionRu: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    ...over,
  };
}

function cartItem(over: Partial<CartItem> = {}): CartItem {
  return { service: svc(), quantity: 1, unitPrice: 50000, ...over };
}

function tx(over: Partial<CashierTransaction> = {}): CashierTransaction {
  return {
    id: 'tx1',
    tenantId: 't',
    branchId: 'b1',
    patientId: null,
    treatmentPlanId: null,
    receiptNumber: 'R-001',
    totalAmount: '120000',
    paidAmount: '120000',
    discount: '0',
    currency: 'UZS',
    paymentMethod: 'cash',
    type: 'payment',
    parentTransactionId: null,
    status: 'completed',
    notes: null,
    fiscalProvider: 'noop',
    fiscalReceiptId: null,
    createdAt: '2026-06-11T05:00:00Z',
    updatedAt: '2026-06-11T05:00:00Z',
    ...over,
  };
}

describe('findActivePrice', () => {
  it('filial mos + validTo===null → Number(price)', () => {
    expect(findActivePrice([price({ branchId: 'b1', price: '50000' })], 'b1')).toBe(50000);
  });

  it('filial mos emas → null', () => {
    expect(findActivePrice([price({ branchId: 'b2' })], 'b1')).toBeNull();
  });

  it('faqat tugagan narx (validTo bor) → null', () => {
    expect(findActivePrice([price({ validTo: '2026-05-01T00:00:00Z' })], 'b1')).toBeNull();
  });

  it('bir nechta active → eng oxirgi validFrom', () => {
    const list = [
      price({ id: 'a', price: '40000', validFrom: '2026-01-01T00:00:00Z' }),
      price({ id: 'b', price: '60000', validFrom: '2026-03-01T00:00:00Z' }),
    ];
    expect(findActivePrice(list, 'b1')).toBe(60000);
  });

  it("bo'sh ro'yxat → null", () => {
    expect(findActivePrice([], 'b1')).toBeNull();
  });
});

describe('computeNetTotal', () => {
  it('Σ unitPrice*qty − discount', () => {
    const cart = [cartItem({ unitPrice: 50000, quantity: 2 }), cartItem({ unitPrice: 30000 })];
    expect(computeNetTotal(cart, 10000)).toBe(120000);
  });

  it('discount=0', () => {
    expect(computeNetTotal([cartItem({ unitPrice: 50000 })], 0)).toBe(50000);
  });

  it("manfiy bo'lmaydi (floor 0)", () => {
    expect(computeNetTotal([cartItem({ unitPrice: 10000 })], 99999)).toBe(0);
  });
});

describe('buildCreatePayload', () => {
  it("savat → create body, paidAmount bo'sh → netTotal", () => {
    const payload = buildCreatePayload({
      branchId: 'b1',
      patientId: 'pat1',
      cart: [cartItem({ unitPrice: 50000, quantity: 2 })],
      discount: 10000,
      paidAmount: null,
      paymentMethod: 'cash',
      notes: 'izoh',
    });
    expect(payload).toEqual({
      branchId: 'b1',
      patientId: 'pat1',
      items: [{ serviceId: 's1', serviceName: 'Plomba', quantity: 2, unitPrice: 50000 }],
      discount: 10000,
      paidAmount: 90000,
      paymentMethod: 'cash',
      notes: 'izoh',
    });
  });

  it("patientId yo'q + notes yo'q → undefined (key tushadi)", () => {
    const payload = buildCreatePayload({
      branchId: 'b1',
      patientId: null,
      cart: [cartItem({ unitPrice: 50000 })],
      discount: 0,
      paidAmount: 50000,
      paymentMethod: 'card',
      notes: '',
    });
    expect(payload.patientId).toBeUndefined();
    expect(payload.notes).toBeUndefined();
    expect(payload.paidAmount).toBe(50000);
  });
});

describe('buildAllocationPayload', () => {
  it('bosqich tanlovlardan allocation + paidAmount=Σamounts', () => {
    const payload = buildAllocationPayload({
      branchId: 'b1',
      treatmentPlanId: 'plan1',
      patientId: 'pat1',
      selections: [
        { stageId: 'st1', amount: 30000 },
        { stageId: 'st2', amount: 20000 },
      ],
      paymentMethod: 'cash',
    });
    expect(payload).toEqual({
      branchId: 'b1',
      patientId: 'pat1',
      treatmentPlanId: 'plan1',
      allocations: [
        { stageId: 'st1', amount: 30000 },
        { stageId: 'st2', amount: 20000 },
      ],
      items: [],
      discount: 0,
      paidAmount: 50000,
      paymentMethod: 'cash',
    });
  });
});

describe('toTransactionVM', () => {
  it('string pul → number; refundable = completed && payment', () => {
    const vm = toTransactionVM(
      tx({ totalAmount: '120000', paidAmount: '100000', discount: '5000' }),
    );
    expect(vm.totalAmount).toBe(120000);
    expect(vm.paidAmount).toBe(100000);
    expect(vm.discount).toBe(5000);
    expect(vm.refundable).toBe(true);
  });

  it('refund tipi → refundable=false', () => {
    expect(toTransactionVM(tx({ type: 'refund' })).refundable).toBe(false);
  });

  it('voided → refundable=false', () => {
    expect(toTransactionVM(tx({ status: 'voided' })).refundable).toBe(false);
  });
});

describe('toPlanBalanceVM', () => {
  const balance: PlanBalance = {
    totalCost: 100000,
    totalPaid: 30000,
    balance: 70000,
    stages: [
      { stageId: 'st1', serviceName: 'A', cost: 40000, paid: 40000, remaining: 0 },
      { stageId: 'st2', serviceName: 'B', cost: 30000, paid: 10000, remaining: 20000 },
      { stageId: 'st3', serviceName: 'C', cost: 30000, paid: 0, remaining: 30000 },
    ],
  };

  it('stage state: paid / partial / unpaid', () => {
    const vm = toPlanBalanceVM(balance);
    expect(vm.stages.map((s) => s.state)).toEqual(['paid', 'partial', 'unpaid']);
    expect(vm.totalCost).toBe(100000);
    expect(vm.balance).toBe(70000);
  });
});
