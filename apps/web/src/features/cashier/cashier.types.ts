import type {
  PaymentMethod,
  Service,
  TransactionStatus,
  TransactionType,
} from '@dental/api-client';

/**
 * Karta sub-turi (UI-R5). Backend `card_provider` — generated api-client qayta
 * generatsiya qilingach (`generate:contract`) shu tip generated modeldan ham keladi.
 */
export type CardProvider = 'terminal' | 'click' | 'payme' | 'other';
export const CARD_PROVIDERS: readonly CardProvider[] = ['terminal', 'click', 'payme', 'other'];

/** POS savat satri. `unitPrice` filial narxidan avto-to'ldiriladi, qo'lda override mumkin. */
export type CartItem = {
  service: Service;
  quantity: number;
  unitPrice: number;
};

/** Tranzaksiya view-model'i (pul string'lardan number'ga aylantirilgan). */
export type TransactionVM = {
  id: string;
  receiptNumber: string | null;
  totalAmount: number;
  paidAmount: number;
  discount: number;
  paymentMethod: PaymentMethod;
  /** Faqat `card` uchun; boshqa usullarda null. */
  cardProvider: CardProvider | null;
  type: TransactionType;
  status: TransactionStatus;
  createdAt: string;
  refundable: boolean;
  /** Fiskal chek yuborilganmi (NoOp provider → false → «Yuborilmagan»). */
  fiscalSent: boolean;
  /** Plan-linked bo'lsa qisman refund ruxsat (V2-4). */
  planLinked: boolean;
};

/** Bosqich to'lov holati. */
export type StageState = 'paid' | 'partial' | 'unpaid';

/** Plan bosqichi balans view-model'i. */
export type StageVM = {
  stageId: string;
  serviceName: string;
  cost: number;
  paid: number;
  remaining: number;
  state: StageState;
};

/** Plan balans view-model'i. */
export type PlanBalanceVM = {
  totalCost: number;
  totalPaid: number;
  balance: number;
  stages: StageVM[];
};

/** Kassa rejimi: erkin POS (savat) yoki plan billing (allocation). */
export type CashierMode = 'payment' | 'plan';

/** PlanBillingPanel'da tanlangan bosqich + to'lanadigan summa. */
export type StageSelection = {
  stageId: string;
  amount: number;
};
