import {
  auditLog,
  expenses,
  labHubAppliedEvents,
  labHubOutbox,
  labHubState,
  labOrderFiles,
  labOrderMessages,
  labOrders,
  notifications,
  patients,
  users,
} from '@dental/db-schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Database, DbOrTx } from '../../db/client.ts';
import { withTenant } from '../../db/scoped.ts';
import { logger } from '../logger.ts';
import { createLocalStorageAdapter } from '../storage.ts';
import { type HubChangeEvent, isLabHubConfigured, LabHubError, labHubClient } from './client.ts';
import { toHubCase } from './mapper.ts';
import { hubKeyOf, readLabHubState } from './state.ts';

/**
 * Lab Hub sinxroni (D1) — klinika tomoni.
 *
 *  - **Outbox (push):** `lab_hub_outbox` qatorlari biznes tranzaksiyasi ichida yoziladi,
 *    commit'dan keyin (`onAfterCommit` + 60 s sikl) shu yerda yuboriladi. Tarmoq so'rovi
 *    hech qachon tranzaksiya ichida emas. Qatorlar ijara (lease) bilan olinadi — ikki
 *    jarayon (API + worker) bir qatorni ikki marta yubormaydi; buyurtma ichida FIFO
 *    (`seq`) — oldingi op kutayotgan bo'lsa keyingisi olinmaydi. Xatolik: tarmoq/5xx/
 *    «keyinroq o'zgaradi» → backoff bilan qayta; boshqa 4xx → `failed`.
 *  - **Poll (pull):** `GET /v1/clinic/changes?since=<cursor>` — Hub kursori commit-xavfsiz
 *    (README), overlap kerak emas; baribir har hodisa `seq` bo'yicha bir marta qo'llanadi
 *    (`lab_hub_applied_events`) — javob yo'qolib sahifa qayta kelsa ham holat/bildirishnoma
 *    ikkilanmaydi. Kursor compare-and-set bilan suriladi (eski sahifa uni orqaga qaytarmaydi).
 */

type FetchFn = typeof fetch;
export type LabHubSyncOpts = { fetchImpl?: FetchFn; now?: () => Date };

const CLAIM_BATCH = 50;
const MAX_ROUNDS = 10;
const LEASE_MS = 2 * 60_000;
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;

/** 30 s, 1, 2, 4 … daqiqa, ko'pi bilan 1 soat. */
export const outboxBackoffMs = (attempts: number) =>
  Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);

type ClaimedRow = {
  id: string;
  lab_order_id: string;
  op: string;
  payload: Record<string, unknown>;
  attempts: number;
};

const errorCode = (err: unknown) =>
  err instanceof LabHubError
    ? err.code
    : err instanceof Error
      ? err.message.slice(0, 200)
      : 'error';

// ─── Push ────────────────────────────────────────────────────────────────────

/** Bitta outbox op'ini Hub'ga yuboradi (tranzaksiyasiz o'qish + tarmoq + qisqa yozish). */
const executeOp = async (
  tenantId: string,
  key: string,
  row: ClaimedRow,
  client: ReturnType<typeof labHubClient>,
  now: Date,
): Promise<void> => {
  const order = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(labOrders).where(eq(labOrders.id, row.lab_order_id));
    return r;
  });
  if (!order?.labHubCaseRef || !order.labHubLabId) return; // buyurtma yo'q / Hub'dan uzilgan
  const caseRef = order.labHubCaseRef;

  switch (row.op) {
    case 'upsert_case': {
      // PHI faqat shu yerda, push paytida va faqat L3 ustunlari o'qiladi (PII ustunlari emas).
      const data = await withTenant(tenantId, async (tx) => {
        const [p] = await tx
          .select({
            fullName: patients.fullName,
            gender: patients.gender,
            dateOfBirth: patients.dateOfBirth,
          })
          .from(patients)
          .where(eq(patients.id, order.patientId));
        const [d] = await tx
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, order.doctorId));
        return { p, doctorName: d?.fullName ?? null };
      });
      if (!data.p) throw new LabHubError(404, 'patient.not_found', false);
      const res = await client.putCase(
        key,
        caseRef,
        toHubCase({
          labId: order.labHubLabId,
          order,
          patient: data.p,
          doctorName: data.doctorName,
          now,
        }),
      );
      await withTenant(tenantId, (tx) =>
        tx
          .update(labOrders)
          .set({
            hubSyncStatus: 'synced',
            ...(res.created || !order.hubStatus ? { hubStatus: res.status } : {}),
          })
          .where(eq(labOrders.id, order.id)),
      );
      return;
    }
    case 'file': {
      const fileId = String(row.payload.fileId ?? '');
      const f = await withTenant(tenantId, async (tx) => {
        const [r] = await tx.select().from(labOrderFiles).where(eq(labOrderFiles.id, fileId));
        return r;
      });
      if (!f) return; // fayl o'chirilgan — yuboriladigan narsa yo'q
      const resolved = createLocalStorageAdapter().resolve(f.objectKey);
      if (!resolved) throw new LabHubError(400, 'file.invalid_key', false);
      const bytes = await Bun.file(resolved.path).arrayBuffer();
      await client.uploadFile(
        key,
        caseRef,
        new File([bytes], f.originalFilename, { type: f.contentType }),
      );
      return;
    }
    case 'message': {
      const messageId = String(row.payload.messageId ?? '');
      const m = await withTenant(tenantId, async (tx) => {
        const [r] = await tx
          .select()
          .from(labOrderMessages)
          .where(eq(labOrderMessages.id, messageId));
        return r;
      });
      if (!m?.body) return;
      const res = await client.postMessage(key, caseRef, m.body, m.authorName);
      await withTenant(tenantId, (tx) =>
        tx
          .update(labOrderMessages)
          .set({ syncedAt: now, hubRef: res.message.id })
          .where(eq(labOrderMessages.id, m.id)),
      );
      return;
    }
    case 'approve_price': {
      await client.approvePrice(key, caseRef, Number(row.payload.price));
      return;
    }
    case 'delivered': {
      await client.delivered(key, caseRef);
      return;
    }
    default:
      throw new LabHubError(400, `outbox.unknown_op:${row.op}`, false);
  }
};

/** Hub narx tasdig'ini rad etgan kodlar — lokal tasdiq Hub bilan mos emas. */
const PRICE_REJECTED = new Set(['price.mismatch', 'price.not_proposed']);

/**
 * Hub `approve-price`ni `price.mismatch`/`price.not_proposed` bilan rad etdi: klinika eski
 * (keshlangan) taklifni tasdiqlagan, lab esa poll'dan keyin narxni o'zgartirgan. Lokal
 * tasdiq (approvedPrice + avtomatik «Laboratoriya» xarajati) BITTA tranzaksiyada qaytariladi,
 * `proposedPrice` Hub'dagi joriy taklifga o'rnatiladi, tasdiqlovchi va shifokorga xabar,
 * audit (tizim nomidan). Outbox qatori `rejected` — `failedOutbox`ga kirmaydi (yo'qolgan
 * ma'lumot yo'q, foydalanuvchi yangi narxni qayta tasdiqlaydi).
 */
const revertLocalPriceApproval = async (
  tenantId: string,
  row: ClaimedRow,
  err: LabHubError,
  now: Date,
) => {
  const sentPrice = Number(row.payload.price).toFixed(2);
  const details = (err.details ?? {}) as { proposedPrice?: unknown };
  const hubProposed =
    typeof details.proposedPrice === 'string' && details.proposedPrice
      ? details.proposedPrice
      : null;
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(labHubOutbox)
      .set({ attempts: row.attempts + 1, lastError: err.code, status: 'rejected', doneAt: now })
      .where(eq(labHubOutbox.id, row.id));
    const [order] = await tx
      .select()
      .from(labOrders)
      .where(eq(labOrders.id, row.lab_order_id))
      .for('update');
    // Faqat shu op tasdiqlagan narx hali turgan bo'lsa (boshqa yo'l bilan o'zgarmagan).
    if (!order || order.approvedPrice !== sentPrice) return;
    const removed = await tx
      .delete(expenses)
      .where(eq(expenses.labOrderId, order.id))
      .returning({ id: expenses.id, amount: expenses.amount });
    const prevCost = row.payload.prevCost;
    await tx
      .update(labOrders)
      .set({
        approvedPrice: null,
        approvedAt: null,
        cost: typeof prevCost === 'string' ? prevCost : null,
        ...(hubProposed ? { proposedPrice: hubProposed } : {}),
        ...(err.code === 'price.not_proposed' && !hubProposed ? { proposedPrice: null } : {}),
        updatedAt: now,
      })
      .where(eq(labOrders.id, order.id));
    await tx.insert(auditLog).values({
      tenantId,
      userId: null,
      action: 'price_approval_reverted',
      resourceType: 'lab_order',
      resourceId: order.id,
      before: { approvedPrice: order.approvedPrice, proposedPrice: order.proposedPrice },
      after: {
        approvedPrice: null,
        proposedPrice: hubProposed ?? order.proposedPrice,
        hubError: err.code,
        removedExpenseIds: removed.map((e) => e.id),
      },
    });
    for (const e of removed) {
      await tx.insert(auditLog).values({
        tenantId,
        userId: null,
        action: 'deleted',
        resourceType: 'expense',
        resourceId: e.id,
        before: { amount: e.amount, labOrderId: order.id },
        after: { reason: `lab_hub.${err.code}` },
      });
    }
    const recipients = new Set<string>([order.doctorId]);
    if (typeof row.payload.approvedBy === 'string') recipients.add(row.payload.approvedBy);
    const ref = order.orderNumber != null ? `#${order.orderNumber}` : '';
    const title = hubProposed
      ? `Narx tasdiqlanmadi: laboratoriya narxni o'zgartirdi — ${formatSum(hubProposed)}`
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
  });
  logger.warn(
    { tenantId, labOrderId: row.lab_order_id, code: err.code },
    'lab-hub price approval rejected by Hub — local approval reverted',
  );
};

export type FlushResult = { sent: number; retry: number; failed: number };

export const flushLabHubOutbox = async (
  tenantId: string,
  opts: LabHubSyncOpts = {},
): Promise<FlushResult> => {
  const result: FlushResult = { sent: 0, retry: 0, failed: 0 };
  if (!isLabHubConfigured()) return result;
  const key = hubKeyOf(await withTenant(tenantId, readLabHubState));
  if (!key) return result;
  const client = labHubClient(opts.fetchImpl);
  const now = () => opts.now?.() ?? new Date();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const t = now();
    // Ijara: qator `next_attempt_at`i oldinga suriladi — boshqa jarayon uni olmaydi.
    const claimed = (await withTenant(tenantId, (tx) =>
      tx.execute(sql`
        UPDATE lab_hub_outbox o
           SET next_attempt_at = ${new Date(t.getTime() + LEASE_MS).toISOString()}::timestamptz
         WHERE o.id IN (
           SELECT o1.id FROM lab_hub_outbox o1
            WHERE o1.status = 'pending'
              AND o1.next_attempt_at <= ${t.toISOString()}::timestamptz
              AND NOT EXISTS (
                SELECT 1 FROM lab_hub_outbox o2
                 WHERE o2.lab_order_id = o1.lab_order_id
                   AND o2.status = 'pending'
                   AND (o2.seq, o2.id) < (o1.seq, o1.id))
            ORDER BY o1.seq, o1.id
            LIMIT ${CLAIM_BATCH}
            FOR UPDATE SKIP LOCKED)
        RETURNING o.id, o.lab_order_id, o.op, o.payload, o.attempts`),
    )) as unknown as ClaimedRow[];
    if (claimed.length === 0) break;

    let unreachable = false;
    for (const row of claimed) {
      if (unreachable) {
        // Hub javob bermayapti — qolganlarini ijarasiz darhol keyingi siklga qaytaramiz.
        await withTenant(tenantId, (tx) =>
          tx.update(labHubOutbox).set({ nextAttemptAt: t }).where(eq(labHubOutbox.id, row.id)),
        );
        continue;
      }
      try {
        await executeOp(tenantId, key, row, client, t);
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(labHubOutbox)
            .set({ status: 'done', doneAt: now(), lastError: null, attempts: row.attempts + 1 })
            .where(eq(labHubOutbox.id, row.id));
          await tx.update(labHubState).set({ lastPushAt: now(), lastError: null });
        });
        result.sent++;
      } catch (err) {
        if (
          row.op === 'approve_price' &&
          err instanceof LabHubError &&
          PRICE_REJECTED.has(err.code)
        ) {
          // Hub boshqa narxni kutyapti — lokal tasdiq (xarajat) qaytariladi, ish qayta tasdiqqa.
          await revertLocalPriceApproval(tenantId, row, err, now());
          result.failed++;
          continue;
        }
        const retryable = !(err instanceof LabHubError) || err.retryable;
        const attempts = row.attempts + 1;
        const code = errorCode(err);
        if (!(err instanceof LabHubError)) {
          logger.warn({ err, tenantId, op: row.op }, 'lab-hub outbox op crashed — will retry');
        }
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(labHubOutbox)
            .set(
              retryable
                ? {
                    attempts,
                    lastError: code,
                    nextAttemptAt: new Date(now().getTime() + outboxBackoffMs(attempts)),
                  }
                : { attempts, lastError: code, status: 'failed', doneAt: now() },
            )
            .where(eq(labHubOutbox.id, row.id));
          if (!retryable) {
            await tx
              .update(labOrders)
              .set({ hubSyncStatus: 'failed' })
              .where(eq(labOrders.id, row.lab_order_id));
          }
          await tx.update(labHubState).set({ lastError: code });
        });
        if (retryable) result.retry++;
        else result.failed++;
        if (err instanceof LabHubError && err.code === 'lab_hub.unreachable') unreachable = true;
      }
    }
    if (unreachable) break;
  }
  return result;
};

// ─── Pull ────────────────────────────────────────────────────────────────────

const CLINIC_RANK: Record<string, number> = {
  draft: 0,
  sent: 1,
  in_progress: 2,
  ready: 3,
  delivered: 4,
};
/** Hub holati → klinika `lab_order_status` (faqat oldinga; `rejected`/`remake` faqat `hub_status`da). */
const HUB_TO_CLINIC: Record<string, string> = {
  accepted: 'sent',
  in_progress: 'in_progress',
  ready: 'ready',
  delivered: 'delivered',
};

const STATUS_TITLE: Record<string, string> = {
  accepted: 'Laboratoriya ishni qabul qildi',
  rejected: 'Laboratoriya ishni rad etdi',
  ready: 'Laboratoriya ishi tayyor',
};

const formatSum = (price: string) =>
  `${Math.round(Number(price)).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;

const applyEvent = async (tx: DbOrTx, tenantId: string, ev: HubChangeEvent, now: Date) => {
  const [order] = await tx
    .select({
      id: labOrders.id,
      status: labOrders.status,
      doctorId: labOrders.doctorId,
      labName: labOrders.labName,
      orderNumber: labOrders.orderNumber,
      approvedPrice: labOrders.approvedPrice,
      sentDate: labOrders.sentDate,
      deliveredDate: labOrders.deliveredDate,
    })
    .from(labOrders)
    .where(eq(labOrders.labHubCaseRef, ev.caseRef));
  if (!order) return;

  const ref = order.orderNumber != null ? `#${order.orderNumber}` : '';
  const notify = (type: string, title: string, body?: string | null) =>
    tx.insert(notifications).values({
      tenantId,
      userId: order.doctorId,
      type,
      title,
      body: [order.labName, ref, body].filter(Boolean).join(' · ').slice(0, 500) || null,
    });

  switch (ev.type) {
    case 'status': {
      const to = String(ev.payload.to ?? '');
      if (!to) return;
      const patch: Partial<typeof labOrders.$inferInsert> = { hubStatus: to, updatedAt: now };
      if (to === 'rejected') patch.hubRejectReason = String(ev.payload.reason ?? '') || null;
      const target = HUB_TO_CLINIC[to];
      if (
        target &&
        order.status !== 'cancelled' &&
        (CLINIC_RANK[target] ?? -1) > (CLINIC_RANK[order.status] ?? 99)
      ) {
        patch.status = target as typeof order.status;
        if (!order.sentDate) patch.sentDate = now;
        if (target === 'delivered' && !order.deliveredDate) patch.deliveredDate = now;
      }
      await tx.update(labOrders).set(patch).where(eq(labOrders.id, order.id));
      const title = ev.actor === 'lab' ? STATUS_TITLE[to] : undefined;
      if (title) {
        await notify(
          'lab_hub.status',
          title,
          to === 'rejected' ? String(ev.payload.reason ?? '') : null,
        );
      }
      return;
    }
    case 'price_proposed': {
      const price = String(ev.payload.price ?? '');
      if (!price) return;
      // Hub tasdiqlangan ishga yangi taklif bermaydi (lab `price.already_approved`), shuning
      // uchun har `price_proposed` — Hub'dagi joriy taklif: lokal tasdiq bo'lsa ham TASHLANMAYDI.
      // Lokal tasdiq Hub'da hali qabul qilinmagan bo'lishi mumkin (outbox navbatda) — Hub
      // `price.mismatch` qaytarsa tasdiq qaytariladi va foydalanuvchi shu yangi narxni ko'radi.
      await tx
        .update(labOrders)
        .set({ proposedPrice: price, updatedAt: now })
        .where(eq(labOrders.id, order.id));
      if (order.approvedPrice == null || order.approvedPrice !== price) {
        await notify('lab_hub.price', `Laboratoriya narx taklif qildi: ${formatSum(price)}`);
      }
      return;
    }
    case 'price_approved': {
      const price = String(ev.payload.price ?? '');
      if (!price || order.approvedPrice != null) return;
      await tx
        .update(labOrders)
        .set({ approvedPrice: price, approvedAt: new Date(ev.createdAt), updatedAt: now })
        .where(eq(labOrders.id, order.id));
      return;
    }
    case 'message': {
      // Klinika yozgan xabar lokal bazada allaqachon bor (yuborishda yozilgan).
      if (ev.actor !== 'lab' || !ev.message) return;
      const [ins] = await tx
        .insert(labOrderMessages)
        .values({
          tenantId,
          labOrderId: order.id,
          author: 'lab',
          authorName: ev.message.authorName,
          kind: 'message',
          body: ev.message.body,
          hubRef: ev.message.id,
          syncedAt: now,
          createdAt: new Date(ev.createdAt),
        })
        .onConflictDoNothing()
        .returning({ id: labOrderMessages.id });
      if (ins) await notify('lab_hub.message', 'Laboratoriyadan xabar', ev.message.body);
      return;
    }
    case 'file': {
      if (ev.actor !== 'lab' || !ev.file) return;
      const [ins] = await tx
        .insert(labOrderMessages)
        .values({
          tenantId,
          labOrderId: order.id,
          author: 'lab',
          kind: 'file',
          body: ev.file.fileName,
          hubFile: ev.file,
          hubRef: `file:${ev.file.id}`,
          syncedAt: now,
          createdAt: new Date(ev.createdAt),
        })
        .onConflictDoNothing()
        .returning({ id: labOrderMessages.id });
      if (ins) await notify('lab_hub.file', 'Laboratoriya fayl yubordi', ev.file.fileName);
      return;
    }
    default:
      return; // created/updated/assigned/purged — klinika tomonida o'zgarish yo'q
  }
};

export type PollResult = { applied: number; pages: number };

export const pollLabHubChanges = async (
  tenantId: string,
  opts: LabHubSyncOpts = {},
): Promise<PollResult> => {
  const result: PollResult = { applied: 0, pages: 0 };
  if (!isLabHubConfigured()) return result;
  const state = await withTenant(tenantId, readLabHubState);
  const key = hubKeyOf(state);
  if (!state || !key) return result;
  const client = labHubClient(opts.fetchImpl);
  const now = () => opts.now?.() ?? new Date();

  let cursor = state.cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Awaited<ReturnType<typeof client.changes>>;
    try {
      // Tarmoq so'rovi tranzaksiyadan TASHQARIDA (Hub kursori klaster xmin'iga qaraydi).
      res = await client.changes(key, cursor, PAGE_LIMIT);
    } catch (err) {
      await withTenant(tenantId, (tx) =>
        tx.update(labHubState).set({ lastError: errorCode(err), updatedAt: now() }),
      );
      throw err;
    }
    const since = cursor;
    const applied = await withTenant(tenantId, async (tx) => {
      let n = 0;
      for (const ev of res.events) {
        const [fresh] = await tx
          .insert(labHubAppliedEvents)
          .values({ tenantId, seq: ev.seq })
          .onConflictDoNothing()
          .returning({ seq: labHubAppliedEvents.seq });
        if (!fresh) continue; // allaqachon qo'llangan (sahifa qayta keldi)
        await applyEvent(tx, tenantId, ev, now());
        n++;
      }
      // Compare-and-set: parallel poller kursorni allaqachon surgan bo'lsa orqaga qaytarmaymiz.
      await tx
        .update(labHubState)
        .set({ cursor: res.nextCursor, lastPollAt: now(), lastError: null, updatedAt: now() })
        .where(eq(labHubState.cursor, since));
      return n;
    });
    result.applied += applied;
    result.pages++;
    cursor = res.nextCursor;
    if (res.events.length < PAGE_LIMIT) break;
  }
  return result;
};

// ─── Sikl ────────────────────────────────────────────────────────────────────

/** Commit'dan keyin (`onAfterCommit`) — best-effort, xatolik yutiladi (sikl qayta uradi). */
export const kickLabHubOutbox = async (tenantId: string): Promise<void> => {
  await flushLabHubOutbox(tenantId).catch((err) =>
    logger.warn({ err, tenantId }, 'lab-hub outbox kick failed — scheduler will retry'),
  );
};

/** Barcha ulangan tenantlar: avval push, keyin poll. Har tenant o'z try/catch'ida. */
export const runLabHubCycle = async (deps: { adminDb: Database }) => {
  const out = { tenants: 0, sent: 0, applied: 0, failed: 0 };
  if (!isLabHubConfigured()) return out;
  const rows = await deps.adminDb
    .select({ tenantId: labHubState.tenantId })
    .from(labHubState)
    .where(and(isNotNull(labHubState.hubKeyEnc)));
  for (const { tenantId } of rows) {
    out.tenants++;
    try {
      out.sent += (await flushLabHubOutbox(tenantId)).sent;
      out.applied += (await pollLabHubChanges(tenantId)).applied;
    } catch (err) {
      out.failed++;
      logger.warn({ err: errorCode(err), tenantId }, 'lab-hub sync failed — will retry');
    }
  }
  return out;
};

const INTERVAL_MS = 60_000;

/** 60 s sikl (in-process, BullMQ'siz — `supervisor-saas` naqshi). `LAB_HUB_URL` yo'q → no-op. */
export const startLabHubScheduler = (deps: {
  adminDb: Database;
  intervalMs?: number;
}): (() => void) => {
  if (!isLabHubConfigured()) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runLabHubCycle({ adminDb: deps.adminDb });
      if (r.sent || r.applied || r.failed) logger.info(r, 'lab-hub sync cycle');
    } catch (err) {
      logger.warn({ err }, 'lab-hub sync cycle crashed');
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, 15_000);
  const timer = setInterval(run, deps.intervalMs ?? INTERVAL_MS);
  logger.info('🔁 Lab Hub sync scheduler started');
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
