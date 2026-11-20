import type { CashierTransaction, CashierTransactionItem } from '@dental/db-schema';
import type {
  CashierTransactionDto,
  CashierTransactionItemDto,
  CashierTransactionWithItemsDto,
} from './cashier.schema.ts';

/**
 * DB row → wire DTO.
 * - Date timestamps → ISO strings (`createdAt`, `updatedAt`).
 * - Money `numeric` ustunlar → STRING (Drizzle allaqachon string qaytaradi — wire shape string).
 * - `createdBy` va `fiscalResponse` DROP qilinadi (types-m3 wire shaklida YO'Q).
 */
export const toCashierTransactionDto = (
  row: CashierTransaction & {
    refundedAmount?: string;
    patientName?: string | null;
    photoStatus?: 'photo' | 'skipped' | null;
  },
): CashierTransactionDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  patientId: row.patientId ?? null,
  patientName: row.patientName ?? null,
  photoStatus: row.photoStatus ?? null,
  treatmentPlanId: row.treatmentPlanId ?? null,
  receiptNumber: row.receiptNumber ?? null,
  totalAmount: row.totalAmount,
  paidAmount: row.paidAmount,
  refundedAmount: row.refundedAmount ?? '0',
  discount: row.discount,
  discountPercent: row.discountPercent ?? null,
  discountReason: row.discountReason ?? null,
  discountGrantedBy: row.discountGrantedBy ?? null,
  currency: row.currency,
  paymentMethod: row.paymentMethod,
  cardProvider: row.cardProvider ?? null,
  type: row.type,
  parentTransactionId: row.parentTransactionId ?? null,
  visitNoteId: row.visitNoteId ?? null,
  status: row.status,
  notes: row.notes ?? null,
  fiscalProvider: row.fiscalProvider,
  fiscalReceiptId: row.fiscalReceiptId ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toCashierTransactionItemDto = (
  row: CashierTransactionItem,
): CashierTransactionItemDto => ({
  id: row.id,
  transactionId: row.transactionId,
  serviceId: row.serviceId ?? null,
  serviceName: row.serviceName,
  quantity: row.quantity,
  unitPrice: row.unitPrice,
  subtotal: row.subtotal,
});

/**
 * Transaction + items → WithItems DTO.
 * `refund` items'siz row qaytaradi — default `[]` (wire shaklida `items` MAJBURIY).
 */
export const toCashierTransactionWithItemsDto = (
  row: CashierTransaction & { refundedAmount?: string },
  items: CashierTransactionItem[] = [],
): CashierTransactionWithItemsDto => ({
  ...toCashierTransactionDto(row),
  items: items.map(toCashierTransactionItemDto),
});
