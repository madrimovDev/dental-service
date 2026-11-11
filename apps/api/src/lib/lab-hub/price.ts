import {
  auditLog,
  expenseCategories,
  expenses,
  labHubOutbox,
  labOrders,
  notifications,
} from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { clinicCaseCode } from './mapper.ts';

/**
 * L4 narx tasdig'i — klinika tomoni (pul). Qaror (controller): TASDIQLANMAGAN xarajat
 * HECH QACHON yozilmaydi. Oqim:
 *
 *  1. `POST /api/lab-orders/{id}/approve-price` faqat «kutilmoqda» holatini qo'yadi
 *     (`price_approval_requested_*`) va outbox'ga `approve_price` op yozadi.
 *  2. Xarajat («Laboratoriya», `expenses.lab_order_id` UNIQUE) faqat Hub tasdiqlaganda —
 *     outbox push 2xx YOKI poll `price_approved` hodisasi (qaysi biri birinchi). Ikkalasi
 *     ham `bookHubConfirmedPrice`ni chaqiradi: buyurtma `FOR UPDATE` + `approvedPrice`
 *     tekshiruvi + UNIQUE → aynan bitta xarajat.
 *  3. Hub `price.mismatch`/`price.not_proposed`/`price.already_approved` → kutish holati
 *     tozalanadi, Hub'dagi yangi taklif ko'rsatiladi, so'ragan foydalanuvchi va shifokorga xabar.
 */

export const LAB_EXPENSE_CATEGORY = { name: 'Laboratoriya', nameRu: 'Лаборатория' } as const;

/** Klinika kalendar kuni (xarajat sanasi) — O'zbekiston vaqti. */
export const todayTashkent = (now: Date = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export const formatSum = (price: string) =>
  `${Math.round(Number(price)).toLocaleString('ru-RU').replace(/\s/g, ' ')} so'm`;

const lockOrder = async (tx: DbOrTx, id: string) => {
  const [row] = await tx.select().from(labOrders).where(eq(labOrders.id, id)).for('update');
  return row;
};

/** So'rov vaqtidagi filial — oxirgi `approve_price` op payload'idan (poll yo'li uchun ham). */
const requestBranchOf = async (tx: DbOrTx, labOrderId: string): Promise<string | null> => {
  const [op] = await tx
    .select({ payload: labHubOutbox.payload })
    .from(labHubOutbox)
    .where(and(eq(labHubOutbox.labOrderId, labOrderId), eq(labHubOutbox.op, 'approve_price')))
    .orderBy(desc(labHubOutbox.seq))
    .limit(1);
  const b = op?.payload?.branchId;
  return typeof b === 'string' ? b : null;
};

/**
 * Hub tasdiqlagan narx → `approvedPrice` + «Laboratoriya» xarajati (idempotent).
 * Tranzaksiya ichida (RLS-bound `tx`) chaqiriladi. `booked: false` — allaqachon yozilgan.
 */
export const bookHubConfirmedPrice = async (
  tx: DbOrTx,
  tenantId: string,
  labOrderId: string,
  hubPrice: string,
  approvedAt: Date,
  now: Date = new Date(),
): Promise<{ booked: boolean; expenseId: string | null }> => {
  const order = await lockOrder(tx, labOrderId);
  if (!order || order.approvedPrice != null) return { booked: false, expenseId: null };
  const price = Number(hubPrice).toFixed(2);
  const requestedBy = order.priceApprovalRequestedBy ?? null;

  let [category] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, LAB_EXPENSE_CATEGORY.name))
    .limit(1);
  if (!category) {
    [category] = await tx
      .insert(expenseCategories)
      .values({ tenantId, ...LAB_EXPENSE_CATEGORY })
      .returning({ id: expenseCategories.id });
  }

  const [expense] = await tx
    .insert(expenses)
    .values({
      tenantId,
      branchId: await requestBranchOf(tx, labOrderId),
      categoryId: category?.id ?? null,
      amount: price,
      date: todayTashkent(now),
      note: `${order.labName} · ${clinicCaseCode(order)}`,
      createdBy: requestedBy,
      labOrderId,
    })
    .onConflictDoNothing()
    .returning({ id: expenses.id });

  await tx
    .update(labOrders)
    .set({
      approvedPrice: price,
      approvedAt,
      proposedPrice: price,
      cost: price,
      priceApprovalRequestedAt: null,
      priceApprovalRequestedPrice: null,
      priceApprovalRequestedBy: null,
      updatedAt: now,
    })
    .where(eq(labOrders.id, labOrderId));

  await tx.insert(auditLog).values({
    tenantId,
    userId: requestedBy,
    action: 'price_approved',
    resourceType: 'lab_order',
    resourceId: labOrderId,
    before: {
      proposedPrice: order.proposedPrice,
      requestedPrice: order.priceApprovalRequestedPrice,
      approvedPrice: null,
    },
    after: { approvedPrice: price, expenseId: expense?.id ?? null, source: 'lab_hub' },
  });
  if (expense) {
    await tx.insert(auditLog).values({
      tenantId,
      userId: requestedBy,
      action: 'created',
      resourceType: 'expense',
      resourceId: expense.id,
      after: { amount: price, labOrderId, category: LAB_EXPENSE_CATEGORY.name },
    });
  }
  return { booked: true, expenseId: expense?.id ?? null };
};

/**
 * Hub kutilayotgan tasdiqni rad etdi. Xarajat yozilmagan — faqat kutish holati tozalanadi,
 * Hub'dagi joriy taklif (`details.proposedPrice`) ko'rsatiladi, xabar + audit (tizim nomidan).
 * `sentPrice` — rad etilgan op narxi: kutish boshqa narx uchun bo'lsa tegilmaydi.
 */
export const rejectPendingPriceApproval = async (
  tx: DbOrTx,
  tenantId: string,
  labOrderId: string,
  sentPrice: string,
  hubCode: string,
  hubProposed: string | null,
  now: Date = new Date(),
) => {
  const order = await lockOrder(tx, labOrderId);
  if (!order || order.approvedPrice != null) return;
  if (order.priceApprovalRequestedPrice !== sentPrice) return;
  const nextProposed =
    hubProposed ?? (hubCode === 'price.not_proposed' ? null : order.proposedPrice);
  await tx
    .update(labOrders)
    .set({
      priceApprovalRequestedAt: null,
      priceApprovalRequestedPrice: null,
      priceApprovalRequestedBy: null,
      proposedPrice: nextProposed,
      updatedAt: now,
    })
    .where(eq(labOrders.id, labOrderId));
  await tx.insert(auditLog).values({
    tenantId,
    userId: null,
    action: 'price_approval_rejected',
    resourceType: 'lab_order',
    resourceId: labOrderId,
    before: { requestedPrice: sentPrice, proposedPrice: order.proposedPrice },
    after: { proposedPrice: nextProposed, hubError: hubCode },
  });
  const recipients = new Set<string>([order.doctorId]);
  if (order.priceApprovalRequestedBy) recipients.add(order.priceApprovalRequestedBy);
  const ref = order.orderNumber != null ? `#${order.orderNumber}` : '';
  const title =
    hubCode === 'price.already_approved'
      ? 'Narx tasdig‘i qabul qilinmadi: ish boshqa narx bilan tasdiqlangan'
      : nextProposed
        ? `Narx tasdiqlanmadi: laboratoriya narxni o'zgartirdi — ${formatSum(nextProposed)}`
        : 'Narx tasdiqlanmadi: laboratoriya taklifni qaytarib oldi';
  for (const userId of recipients) {
    await tx.insert(notifications).values({
      tenantId,
      userId,
      type: 'lab_hub.price',
      title,
      body: [order.labName, ref].filter(Boolean).join(' · ') || null,
    });
  }
};
