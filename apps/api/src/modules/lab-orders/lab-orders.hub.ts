import {
  expenses,
  labHubOutbox,
  labOrderFiles,
  labOrderMessages,
  labOrders,
  users,
} from '@dental/db-schema';
import { and, asc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { onAfterCommit } from '../../db/after-commit.ts';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { isLabHubConfigured, LabHubError, labHubClient } from '../../lib/lab-hub/client.ts';
import { hubKeyOf, readLabHubState } from '../../lib/lab-hub/state.ts';
import { kickLabHubOutbox } from '../../lib/lab-hub/sync.ts';
import { assertLabOrderTransition, type LabOrderStatus } from './lab-orders.transitions.ts';

/** Service qaytaradigan biznes xatosi — routes `fail(code)` + status'ga aylantiradi (4xx → commit). */
export class LabHubOrderError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 502,
    readonly code: string,
    readonly details?: Record<string, unknown>,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LabHubOrderError';
  }
}

/** Pul satri `numeric(14,2)` shakliga (`"300000.00"`); yaroqsiz bo'lsa `null`. */
export const normalizeMoney = (v: string | number): string | null => {
  if (typeof v === 'string' && !/^\d{1,12}(\.\d{1,2})?$/.test(v.trim())) return null;
  const n = typeof v === 'number' ? v : Number(v.trim());
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return null;
  return n.toFixed(2);
};

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
   * L4: lab taklif qilgan narxni tasdiqlash SO'ROVI. Qaror: tasdiqlanmagan xarajat yozilmaydi —
   * bu yerda faqat «kutilmoqda» holati (`price_approval_requested_*`) + outbox `approve_price`.
   * Xarajat Hub tasdiqlaganda (`bookHubConfirmedPrice`: push 2xx yoki poll `price_approved`).
   *
   * `shownPrice` — foydalanuvchi ekranda ko'rgan narx (TOCTOU): qulflangan qatordagi
   * `proposedPrice`dan farq qilsa 409 `price.changed`, hech narsa yozilmaydi.
   */
  async function approvePrice(c: Context, id: string, shownPrice: string) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId') as string;
    const shown = normalizeMoney(shownPrice);
    if (shown == null) throw new LabHubOrderError(400, 'price.invalid');
    const order = await lockOrder(db, id);
    if (!order) throw new LabHubOrderError(404, 'lab_order.not_found');
    if (!order.labHubCaseRef) throw new LabHubOrderError(409, 'lab_hub.not_sent');

    if (order.approvedPrice != null) {
      if (order.approvedPrice !== shown) {
        throw new LabHubOrderError(409, 'price.already_approved', {
          approvedPrice: order.approvedPrice,
        });
      }
      const [exp] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.labOrderId, id));
      return {
        status: 'approved' as const,
        approvedPrice: order.approvedPrice,
        approvedAt: order.approvedAt?.toISOString() ?? null,
        requestedPrice: null,
        alreadyApproved: true,
        expenseId: exp?.id ?? null,
      };
    }
    if (order.proposedPrice == null) throw new LabHubOrderError(409, 'price.not_proposed');
    if (order.proposedPrice !== shown) {
      throw new LabHubOrderError(409, 'price.changed', { proposedPrice: order.proposedPrice });
    }
    if (order.priceApprovalRequestedAt != null) {
      // Takroriy bosish — o'sha narx uchun so'rov allaqachon navbatda (idempotent).
      if (order.priceApprovalRequestedPrice === shown) {
        return {
          status: 'pending' as const,
          approvedPrice: null,
          approvedAt: null,
          requestedPrice: shown,
          alreadyApproved: false,
          expenseId: null,
        };
      }
      // Boshqa narx uchun so'rov hali Hub javobini kutmoqda — u hal bo'lgach qayta.
      throw new LabHubOrderError(409, 'price.approval_pending', {
        requestedPrice: order.priceApprovalRequestedPrice,
      });
    }

    const now = new Date();
    const userId = c.get('user')?.id ?? null;
    await db
      .update(labOrders)
      .set({
        priceApprovalRequestedAt: now,
        priceApprovalRequestedPrice: shown,
        priceApprovalRequestedBy: userId,
        updatedAt: now,
      })
      .where(eq(labOrders.id, id));
    await enqueueLabHub(c, db, tenantId, id, [
      {
        op: 'approve_price',
        payload: {
          price: Number(shown),
          requestedBy: userId,
          branchId: c.get('activeBranchId') ?? null,
        },
      },
    ]);
    await deps.audit.record(c, {
      action: 'price_approval_requested',
      resourceType: 'lab_order',
      resourceId: id,
      before: { proposedPrice: shown, approvedPrice: null },
      after: { requestedPrice: shown },
    });
    return {
      status: 'pending' as const,
      approvedPrice: null,
      approvedAt: null,
      requestedPrice: shown,
      alreadyApproved: false,
      expenseId: null,
    };
  }

  /**
   * Lab yuborgan faylni Hub'dan (deshifrlangan) oqim sifatida klinikaga beradi. Faqat shu
   * buyurtmaga sinxron orqali kelgan fayl (`lab_order_messages.hub_ref = file:<id>`) — boshqa
   * ish/klinika fayli id'si bilan so'rab bo'lmaydi (Hub ham ish/klinika bo'yicha tekshiradi).
   */
  async function downloadHubFile(c: Context, id: string, fileId: string): Promise<Response> {
    const db = getDb(c);
    const [order] = await db
      .select({ id: labOrders.id, ref: labOrders.labHubCaseRef })
      .from(labOrders)
      .where(eq(labOrders.id, id));
    if (!order) throw new LabHubOrderError(404, 'lab_order.not_found');
    if (!order.ref) throw new LabHubOrderError(409, 'lab_hub.not_sent');
    const [msg] = await db
      .select({ id: labOrderMessages.id })
      .from(labOrderMessages)
      .where(
        and(eq(labOrderMessages.labOrderId, id), eq(labOrderMessages.hubRef, `file:${fileId}`)),
      );
    if (!msg) throw new LabHubOrderError(404, 'lab_hub.file_not_found');
    if (!isLabHubConfigured()) throw new LabHubOrderError(409, 'lab_hub.not_configured');
    const key = hubKeyOf(await readLabHubState(db));
    if (!key) throw new LabHubOrderError(409, 'lab_hub.not_connected');
    let res: Response;
    try {
      res = await labHubClient().downloadFile(key, order.ref, fileId);
    } catch (err) {
      if (err instanceof LabHubError && err.status === 404) {
        throw new LabHubOrderError(404, 'lab_hub.file_not_found');
      }
      throw new LabHubOrderError(502, 'lab_hub.unreachable', {
        hubError: err instanceof LabHubError ? err.code : 'error',
      });
    }
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: id,
      after: { hubFileId: fileId },
    });
    const headers = new Headers({
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const len = res.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    return new Response(res.body, { status: 200, headers });
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

  return { sendToHub, approvePrice, downloadHubFile, listMessages, postMessage };
};
