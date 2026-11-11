import {
  expenseCategories,
  expenses,
  labHubOutbox,
  labOrderFiles,
  labOrderMessages,
  labOrders,
  users,
} from '@dental/db-schema';
import { asc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { onAfterCommit } from '../../db/after-commit.ts';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { isLabHubConfigured } from '../../lib/lab-hub/client.ts';
import { clinicCaseCode } from '../../lib/lab-hub/mapper.ts';
import { readLabHubState } from '../../lib/lab-hub/state.ts';
import { kickLabHubOutbox } from '../../lib/lab-hub/sync.ts';
import { assertLabOrderTransition, type LabOrderStatus } from './lab-orders.transitions.ts';

/** Service qaytaradigan biznes xatosi — routes `fail(code)` + status'ga aylantiradi (4xx → commit). */
export class LabHubOrderError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
  ) {
    super(code);
    this.name = 'LabHubOrderError';
  }
}

const LAB_EXPENSE_CATEGORY = { name: 'Laboratoriya', nameRu: 'Лаборатория' } as const;

/** Klinika kalendar kuni (xarajat sanasi) — O'zbekiston vaqti. */
const todayTashkent = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export type LabOrderHubOp = 'upsert_case' | 'file' | 'message' | 'approve_price' | 'delivered';

/** Outbox'ga qator (biznes tranzaksiyasi ichida) + commit'dan keyin bir marta push urinishi. */
export const enqueueLabHub = async (
  c: Context,
  db: DbOrTx,
  tenantId: string,
  labOrderId: string,
  ops: { op: LabOrderHubOp; payload?: Record<string, unknown> }[],
) => {
  if (ops.length === 0) return;
  // Har op alohida INSERT — `seq` (clock_timestamp µs) har biri uchun alohida o'qiladi → FIFO.
  for (const o of ops) {
    await db
      .insert(labHubOutbox)
      .values({ tenantId, labOrderId, op: o.op, payload: o.payload ?? {} });
  }
  await onAfterCommit(c, () => kickLabHubOutbox(tenantId));
};

const lockOrder = async (db: DbOrTx, id: string) => {
  const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id)).for('update');
  return row;
};

export const createLabOrdersHubService = (deps: { audit: AuditLogger }) => {
  /** «Laboratoriyaga yuborish»: katalogdagi (ulangan) lab tanlanadi, ish navbatga tushadi. */
  async function sendToHub(c: Context, id: string, labId: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId') as string;
    if (!isLabHubConfigured()) throw new LabHubOrderError(409, 'lab_hub.not_configured');
    const state = await readLabHubState(db);
    if (!state?.hubKeyEnc) throw new LabHubOrderError(409, 'lab_hub.not_connected');
    const lab = state.labsCache?.find((l) => l.id === labId);
    if (!lab) throw new LabHubOrderError(400, 'lab_hub.unknown_lab');
    if (lab.linkStatus !== 'active') throw new LabHubOrderError(409, 'lab_hub.link_not_active');

    const order = await lockOrder(db, id);
    if (!order) throw new LabHubOrderError(404, 'lab_order.not_found');
    if (order.labHubCaseRef) throw new LabHubOrderError(409, 'lab_hub.already_sent');
    if (order.status !== 'draft' && order.status !== 'sent') {
      throw new LabHubOrderError(409, 'lab_hub.bad_status');
    }
    if (order.status === 'draft') {
      assertLabOrderTransition(order.status as LabOrderStatus, 'sent');
    }

    const now = new Date();
    const [row] = await db
      .update(labOrders)
      .set({
        labHubLabId: lab.id,
        labHubCaseRef: order.id,
        hubSyncStatus: 'pending',
        hubStatus: null,
        labName: lab.name,
        status: 'sent',
        sentDate: order.sentDate ?? now,
        updatedAt: now,
      })
      .where(eq(labOrders.id, id))
      .returning();

    const files = await db
      .select({ id: labOrderFiles.id })
      .from(labOrderFiles)
      .where(eq(labOrderFiles.labOrderId, id))
      .orderBy(asc(labOrderFiles.createdAt));
    await enqueueLabHub(c, db, tenantId, id, [
      { op: 'upsert_case' },
      ...files.map((f) => ({ op: 'file' as const, payload: { fileId: f.id } })),
    ]);

    await deps.audit.record(c, {
      action: 'sent_to_lab_hub',
      resourceType: 'lab_order',
      resourceId: id,
      before: { status: order.status, labName: order.labName },
      after: { status: 'sent', labHubLabId: lab.id, labName: lab.name, files: files.length },
    });
    return row;
  }

  /**
   * L4: lab taklif qilgan narxni tasdiqlash → `expenses` («Laboratoriya»). Buyurtma qatori
   * `FOR UPDATE` bilan qulflanadi (parallel ikki bosish ketma-ket bo'ladi) + `expenses.lab_order_id`
   * UNIQUE — ikkinchi tasdiq yangi xarajat yaratmaydi (`alreadyApproved: true`).
   */
  async function approvePrice(c: Context, id: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId') as string;
    const order = await lockOrder(db, id);
    if (!order) throw new LabHubOrderError(404, 'lab_order.not_found');
    if (!order.labHubCaseRef) throw new LabHubOrderError(409, 'lab_hub.not_sent');

    if (order.approvedPrice != null) {
      const [exp] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.labOrderId, id));
      return {
        approvedPrice: order.approvedPrice,
        approvedAt: order.approvedAt?.toISOString() ?? null,
        alreadyApproved: true,
        expenseId: exp?.id ?? null,
      };
    }
    if (order.proposedPrice == null) throw new LabHubOrderError(409, 'price.not_proposed');
    const price = order.proposedPrice;

    let [category] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(eq(expenseCategories.name, LAB_EXPENSE_CATEGORY.name))
      .limit(1);
    if (!category) {
      [category] = await db
        .insert(expenseCategories)
        .values({ tenantId, ...LAB_EXPENSE_CATEGORY })
        .returning({ id: expenseCategories.id });
    }

    const [expense] = await db
      .insert(expenses)
      .values({
        tenantId,
        branchId: c.get('activeBranchId') ?? null,
        categoryId: category?.id ?? null,
        amount: price,
        date: todayTashkent(),
        note: `${order.labName} · ${clinicCaseCode(order)}`,
        createdBy: c.get('user')?.id ?? null,
        labOrderId: id,
      })
      .onConflictDoNothing()
      .returning();

    const now = new Date();
    await db
      .update(labOrders)
      .set({ approvedPrice: price, approvedAt: now, cost: price, updatedAt: now })
      .where(eq(labOrders.id, id));
    await enqueueLabHub(c, db, tenantId, id, [
      { op: 'approve_price', payload: { price: Number(price) } },
    ]);

    await deps.audit.record(c, {
      action: 'price_approved',
      resourceType: 'lab_order',
      resourceId: id,
      before: { proposedPrice: price, approvedPrice: null },
      after: { approvedPrice: price, expenseId: expense?.id ?? null },
    });
    if (expense) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'expense',
        resourceId: expense.id,
        after: { amount: price, labOrderId: id, category: LAB_EXPENSE_CATEGORY.name },
      });
    }
    return {
      approvedPrice: price,
      approvedAt: now.toISOString(),
      alreadyApproved: false,
      expenseId: expense?.id ?? null,
    };
  }

  async function listMessages(c: Context, id: string) {
    const db = getDb(c);
    const [order] = await db
      .select({ id: labOrders.id })
      .from(labOrders)
      .where(eq(labOrders.id, id));
    if (!order) return null;
    const rows = await db
      .select()
      .from(labOrderMessages)
      .where(eq(labOrderMessages.labOrderId, id))
      .orderBy(asc(labOrderMessages.createdAt));
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: id,
      after: { hubMessages: rows.length },
    });
    return rows;
  }

  async function postMessage(c: Context, id: string, body: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId') as string;
    const userId = c.get('user')?.id ?? null;
    const [order] = await db
      .select({ id: labOrders.id, ref: labOrders.labHubCaseRef })
      .from(labOrders)
      .where(eq(labOrders.id, id));
    if (!order) throw new LabHubOrderError(404, 'lab_order.not_found');
    if (!order.ref) throw new LabHubOrderError(409, 'lab_hub.not_sent');
    const [author] = userId
      ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId))
      : [];
    const [row] = await db
      .insert(labOrderMessages)
      .values({
        tenantId,
        labOrderId: id,
        author: 'clinic',
        authorName: author?.fullName ?? null,
        kind: 'message',
        body,
        createdByUserId: userId,
      })
      .returning();
    if (!row) throw new Error('lab_order_message insert failed');
    await enqueueLabHub(c, db, tenantId, id, [{ op: 'message', payload: { messageId: row.id } }]);
    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'lab_order_message',
      resourceId: row.id,
      after: { labOrderId: id, length: body.length },
    });
    return row;
  }

  return { sendToHub, approvePrice, listMessages, postMessage };
};
