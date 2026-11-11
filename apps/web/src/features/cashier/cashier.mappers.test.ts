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
    categoryId: null,
    categoryNameRu: null,
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
    cardProvider: null,
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
      {
        stageId: 'st1',
        serviceName: 'A',
        cost: 40000,
        paid: 40000,
        remaining: 0,
        excludedFromDebt: false,
      },
      {
        stageId: 'st2',
        serviceName: 'B',
        cost: 30000,
        paid: 10000,
        remaining: 20000,
        excludedFromDebt: false,
      },
      {
        stageId: 'st3',
        serviceName: 'C',
        cost: 30000,
        paid: 0,
        remaining: 30000,
        excludedFromDebt: false,
      },
    ],
  };

  it('stage state: paid / partial / unpaid', () => {
    const vm = toPlanBalanceVM(balance);
    expect(vm.stages.map((s) => s.state)).toEqual(['paid', 'partial', 'unpaid']);
    expect(vm.totalCost).toBe(100000);
    expect(vm.balance).toBe(70000);
  });
});

describe('netCashTotal (P13)', () => {
  it('refund ayiriladi, payment qo‘shiladi', async () => {
    const { netCashTotal } = await import('./cashier.mappers');
    expect(
      netCashTotal([
        { type: 'payment', total: '500000' },
        { type: 'refund', total: '300000' },
      ]),
    ).toBe(200000);
  });
});

describe('computeTender (UI-R5 qaytim)', () => {
  it('naqd: bemor ortiq bersa qaytim, paid = net', async () => {
    const { computeTender } = await import('./cashier.mappers');
    expect(computeTender('cash', 650000, 700000)).toEqual({ paid: 650000, change: 50000, debt: 0 });
  });

  it('naqd: kam bersa qarz qoladi, qaytim 0', async () => {
    const { computeTender } = await import('./cashier.mappers');
    expect(computeTender('cash', 650000, 400000)).toEqual({
      paid: 400000,
      change: 0,
      debt: 250000,
    });
  });

  it('kiritilmagan summa = to‘liq to‘lov; karta/o‘tkazmada qaytim hech qachon yo‘q', async () => {
    const { computeTender } = await import('./cashier.mappers');
    expect(computeTender('cash', 650000, null)).toEqual({ paid: 650000, change: 0, debt: 0 });
    expect(computeTender('card', 650000, 700000)).toEqual({ paid: 650000, change: 0, debt: 0 });
    expect(computeTender('transfer', 650000, 100000)).toEqual({
      paid: 100000,
      change: 0,
      debt: 550000,
    });
  });
});

describe('summarizeBreakdown (UI-R5 xulosa)', () => {
  it('karta sub-turlar bo‘yicha bo‘linadi, refund har satrda ayiriladi, sof = P13 formulasi', async () => {
    const { summarizeBreakdown, netCashTotal } = await import('./cashier.mappers');
    const rows = [
      { paymentMethod: 'cash', cardProvider: null, type: 'payment', total: '2450000' },
      { paymentMethod: 'card', cardProvider: 'terminal', type: 'payment', total: '1600000' },
      { paymentMethod: 'card', cardProvider: 'click', type: 'payment', total: '1400000' },
      { paymentMethod: 'card', cardProvider: 'click', type: 'refund', total: '600000' },
      { paymentMethod: 'card', cardProvider: null, type: 'payment', total: '100000' },
    ];
    const s = summarizeBreakdown(rows);
    expect(s.cash).toBe(2450000);
    expect(s.card).toBe(2500000); // 1600000 + 1400000 - 600000 + 100000
    expect(s.cardByProvider).toEqual({
      terminal: 1600000,
      click: 800000,
      unspecified: 100000,
    });
    expect(s.refunded).toBe(600000);
    expect(s.net).toBe(netCashTotal(rows));
    expect(s.net).toBe(4950000);
  });
});

describe('toTransactionVM (UI-R5)', () => {
  it('cardProvider va fiskal holat VMga o‘tadi', async () => {
    const { toTransactionVM } = await import('./cashier.mappers');
    const vm = toTransactionVM({
      id: 't1',
      receiptNumber: 'R-1',
      totalAmount: '100',
      paidAmount: '100',
      discount: '0',
      paymentMethod: 'card',
      cardProvider: 'payme',
      type: 'payment',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00Z',
      treatmentPlanId: null,
      fiscalReceiptId: null,
    } as never);
    expect(vm.cardProvider).toBe('payme');
    expect(vm.fiscalSent).toBe(false);
  });
});
