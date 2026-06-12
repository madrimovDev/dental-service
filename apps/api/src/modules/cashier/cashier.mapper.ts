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
export const toCashierTransactionDto = (row: CashierTransaction): CashierTransactionDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  patientId: row.patientId ?? null,
  treatmentPlanId: row.treatmentPlanId ?? null,
  receiptNumber: row.receiptNumber ?? null,
  totalAmount: row.totalAmount,
  paidAmount: row.paidAmount,
  discount: row.discount,
  currency: row.currency,
  paymentMethod: row.paymentMethod,
  type: row.type,
  parentTransactionId: row.parentTransactionId ?? null,
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
  row: CashierTransaction,
  items: CashierTransactionItem[] = [],
): CashierTransactionWithItemsDto => ({
  ...toCashierTransactionDto(row),
  items: items.map(toCashierTransactionItemDto),
});
