import type {
  CashierTransaction,
  PaymentMethod,
  PlanBalance,
  ServicePrice,
} from '@dental/api-client';
import type {
  CardProvider,
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

/** Kunlik kassa SOF jami: Σ payment − Σ refund (DailySummaryCard va AccountantDashboard umumiy). */
export function netCashTotal(breakdown: Array<{ type: string; total: string | number }>): number {
  return breakdown.reduce(
    (s, b) => (b.type === 'refund' ? s - Number(b.total) : s + Number(b.total)),
    0,
  );
}

export type Tender = { paid: number; change: number; debt: number };

/**
 * Naqd qaytimi (sof). `received` — bemor bergan summa (null = to'liq to'lov).
 * paid ≤ net (server `paidAmount` ni net'dan oshirmaymiz); qaytim FAQAT naqdda.
 * Karta/o'tkazmada ortiqcha kiritilgan summa net'ga qirqiladi.
 */
export function computeTender(method: PaymentMethod, net: number, received: number | null): Tender {
  if (received === null) return { paid: net, change: 0, debt: 0 };
  const paid = Math.min(received, net);
  const change = method === 'cash' ? Math.max(0, received - net) : 0;
  return { paid, change, debt: Math.max(0, net - received) };
}

export type BreakdownRowLike = {
  paymentMethod: string;
  /** UI-R5: backend `cardProvider` (generated tip regeneratsiyagacha ixtiyoriy). */
  cardProvider?: string | null;
  type: string;
  total: string | number;
};

export type DaySummary = {
  cash: number;
  card: number;
  transfer: number;
  other: number;
  /** Karta sub-turlari bo'yicha SOF (payment − refund). `unspecified` = sub-tursiz karta. */
  cardByProvider: Partial<Record<CardProvider | 'unspecified', number>>;
  /** Jami qaytarilgan (musbat son). */
  refunded: number;
  /** Σ payment − Σ refund (`netCashTotal` bilan bir xil). */
  net: number;
};

/** Kunlik breakdown → usullar bo'yicha SOF jamlar (refund har satrda ayiriladi). */
export function summarizeBreakdown(rows: BreakdownRowLike[]): DaySummary {
  const out: DaySummary = {
    cash: 0,
    card: 0,
    transfer: 0,
    other: 0,
    cardByProvider: {},
    refunded: 0,
    net: netCashTotal(rows),
  };
  for (const r of rows) {
    if (r.type !== 'payment' && r.type !== 'refund') continue;
    const signed = r.type === 'refund' ? -Number(r.total) : Number(r.total);
    if (r.type === 'refund') out.refunded += Number(r.total);
    if (r.paymentMethod === 'cash') out.cash += signed;
    else if (r.paymentMethod === 'transfer') out.transfer += signed;
    else if (r.paymentMethod === 'card') {
      out.card += signed;
      const key = (r.cardProvider ?? 'unspecified') as CardProvider | 'unspecified';
      out.cardByProvider[key] = (out.cardByProvider[key] ?? 0) + signed;
    } else out.other += signed;
  }
  return out;
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
  /** Faqat `card` uchun (backend boshqa usulda 400 qaytaradi). */
  cardProvider?: CardProvider;
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
  cardProvider?: CardProvider | null;
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
    cardProvider: input.paymentMethod === 'card' ? (input.cardProvider ?? undefined) : undefined,
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
  // `cardProvider` generated tipda regeneratsiyagacha yo'q — kengaytirilgan o'qish.
  const ext = tx as CashierTransaction & { cardProvider?: CardProvider | null };
  return {
    id: tx.id,
    receiptNumber: tx.receiptNumber,
    totalAmount: Number(tx.totalAmount),
    paidAmount: Number(tx.paidAmount),
    discount: Number(tx.discount),
    paymentMethod: tx.paymentMethod,
    cardProvider: ext.cardProvider ?? null,
    type: tx.type,
    status: tx.status,
    createdAt: tx.createdAt,
    fiscalSent: tx.fiscalReceiptId != null,
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
