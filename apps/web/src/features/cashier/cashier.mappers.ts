import type {
  CashierTransaction,
  PaymentMethod,
  PlanBalance,
  ServicePrice,
} from '@dental/api-client';
import type {
  CartItem,
  PlanBalanceVM,
  StageSelection,
  StageState,
  StageVM,
  TransactionVM,
} from './cashier.types';

/**
 * Tanlangan filial uchun amaldagi narxni topadi (sof).
 * `validTo === null` (joriy amaldagi) + `branchId` mos qator.
 * Bir nechta active bo'lsa eng oxirgi `validFrom`. Topilmasa null.
 */
export function findActivePrice(prices: ServicePrice[], branchId: string): number | null {
  const active = prices
    .filter((p) => p.branchId === branchId && p.validTo === null)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const top = active[0];
  return top ? Number(top.price) : null;
}

/** Savat jami − chegirma (manfiy bo'lmaydi). */
export function computeNetTotal(cart: CartItem[], discount: number): number {
  const gross = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  return Math.max(0, gross - discount);
}

export type CreatePayload = {
  branchId: string;
  patientId?: string;
  items: Array<{ serviceId: string; serviceName: string; quantity: number; unitPrice: number }>;
  discount: number;
  paidAmount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
};

/** Savatdan erkin POS create body (sof). `paidAmount` null → netTotal. */
export function buildCreatePayload(input: {
  branchId: string;
  patientId: string | null;
  cart: CartItem[];
  discount: number;
  paidAmount: number | null;
  paymentMethod: PaymentMethod;
  notes: string;
}): CreatePayload {
  const netTotal = computeNetTotal(input.cart, input.discount);
  return {
    branchId: input.branchId,
    patientId: input.patientId ?? undefined,
    items: input.cart.map((i) => ({
      serviceId: i.service.id,
      serviceName: i.service.nameUz,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    discount: input.discount,
    paidAmount: input.paidAmount ?? netTotal,
    paymentMethod: input.paymentMethod,
    notes: input.notes || undefined,
  };
}

export type AllocationPayload = {
  branchId: string;
  patientId?: string;
  treatmentPlanId: string;
  allocations: StageSelection[];
  items: [];
  discount: 0;
  paidAmount: number;
  paymentMethod: PaymentMethod;
};

/** Plan billing allocation body (sof). `paidAmount = Σ amounts`. */
export function buildAllocationPayload(input: {
  branchId: string;
  patientId: string | null;
  treatmentPlanId: string;
  selections: StageSelection[];
  paymentMethod: PaymentMethod;
}): AllocationPayload {
  const paidAmount = input.selections.reduce((sum, s) => sum + s.amount, 0);
  return {
    branchId: input.branchId,
    patientId: input.patientId ?? undefined,
    treatmentPlanId: input.treatmentPlanId,
    allocations: input.selections.map((s) => ({ stageId: s.stageId, amount: s.amount })),
    items: [],
    discount: 0,
    paidAmount,
    paymentMethod: input.paymentMethod,
  };
}

/** Tranzaksiya → VM (string pul → number). */
export function toTransactionVM(tx: CashierTransaction): TransactionVM {
  return {
    id: tx.id,
    receiptNumber: tx.receiptNumber,
    totalAmount: Number(tx.totalAmount),
    paidAmount: Number(tx.paidAmount),
    discount: Number(tx.discount),
    paymentMethod: tx.paymentMethod,
    type: tx.type,
    status: tx.status,
    createdAt: tx.createdAt,
    refundable: tx.status === 'completed' && tx.type === 'payment',
    planLinked: tx.treatmentPlanId != null,
  };
}

function stageStateOf(remaining: number, paid: number): StageState {
  if (remaining <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

/** PlanBalance → VM (bosqich holatini hisoblaydi). */
export function toPlanBalanceVM(b: PlanBalance): PlanBalanceVM {
  return {
    totalCost: b.totalCost,
    totalPaid: b.totalPaid,
    balance: b.balance,
    stages: b.stages.map(
      (s): StageVM => ({
        stageId: s.stageId,
        serviceName: s.serviceName,
        cost: s.cost,
        paid: s.paid,
        remaining: s.remaining,
        state: stageStateOf(s.remaining, s.paid),
      }),
    ),
  };
}
