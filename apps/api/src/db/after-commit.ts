import type { Context } from 'hono';
import { logger } from '../lib/logger.ts';
import type { DbOrTx } from './client.ts';

/** Commit'dan keyin bajariladigan side-effect (Redis/BullMQ, tashqi API). */
export type AfterCommitFn = () => Promise<void>;

declare module 'hono' {
  interface ContextVariableMap {
    /** `rlsMiddleware` tenant yo'lida o'rnatadi; yo'q bo'lsa side-effect darhol ishlaydi. */
    afterCommit?: AfterCommitFn[];
  }
}

/**
 * Side-effect javobni bloklay oladigan yuqori chegara. Redis/Valkey'ga ulanib
 * bo'lmasa BullMQ `getJob()`/`add()` reject qilmaydi, cheksiz osilib qoladi —
 * commit bo'lgan so'rov klientga 200 o'rniga timeout bo'lib qaytmasligi kerak.
 */
export const AFTER_COMMIT_TIMEOUT_MS = 2500;

const runOne = async (
  fn: AfterCommitFn,
  requestId?: string,
  timeoutMs: number = AFTER_COMMIT_TIMEOUT_MS,
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = fn();
    // Timeout g'olib bo'lsa `work` fonda davom etadi — keyingi rejection'ni yutamiz.
    work.catch(() => {});
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`afterCommit side-effect timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err) {
    logger.warn({ err, requestId }, 'afterCommit side-effect failed');
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Ketma-ket, har biri o'z try/catch'ida — xato javobni o'zgartirmaydi. */
export const runAfterCommit = async (fns: AfterCommitFn[], requestId?: string): Promise<void> => {
  for (const fn of fns) await runOne(fn, requestId);
};

/**
 * Side-effect'ni commit'dan keyinga qoldiradi. Ro'yxat yo'q kontekstda
 * (tenant'siz so'rov, fake-context, worker) fn darhol bajariladi.
 */
export const onAfterCommit = async (c: Context, fn: AfterCommitFn): Promise<void> => {
  const list = c.get('afterCommit');
  if (list) {
    list.push(fn);
    return;
  }
  await runOne(fn, c.get('requestId'));
};

/**
 * FX-75: HTTP'siz (bot/worker) yo'lda `rlsMiddleware` yo'q — ro'yxatni `withTenant`
 * boshqaradi. Ro'yxat tx obyektiga bog'lanadi: `createBotContext(tx)` uni
 * `afterCommit` sifatida store'ga qo'yadi, `withTenant` esa commit'dan keyin
 * `drainTxAfterCommit` bilan bajaradi (rollback'da — `dropTxAfterCommit`).
 */
const txAfterCommit = new WeakMap<object, AfterCommitFn[]>();

export const getTxAfterCommit = (tx: object): AfterCommitFn[] => {
  let list = txAfterCommit.get(tx);
  if (!list) {
    list = [];
    txAfterCommit.set(tx, list);
  }
  return list;
};

export const drainTxAfterCommit = async (tx: object): Promise<void> => {
  const list = txAfterCommit.get(tx);
  txAfterCommit.delete(tx);
  if (list?.length) await runAfterCommit(list);
};

export const dropTxAfterCommit = (tx: object): void => {
  txAfterCommit.delete(tx);
};

/**
 * FX-82 seam: postgres-js savepoint (`tx.transaction(sp => …)`) yangi tx obyekti beradi —
 * `createBotContext(sp)` uchun `getTxAfterCommit(sp)` alohida ro'yxat bo'lib, `withTenant`
 * faqat tashqi tx ro'yxatini drenaj qiladi → savepoint ichida ro'yxatdan o'tgan effekt
 * yo'qolardi. Savepoint muvaffaqiyatli tugasa uning ro'yxati ota tx ro'yxatiga ko'chiriladi
 * (ota commit'dan keyin ishlaydi); savepoint rollback'da tashlanadi.
 */
export const promoteTxAfterCommit = (child: object, parent: object): void => {
  const list = txAfterCommit.get(child);
  txAfterCommit.delete(child);
  if (list?.length) getTxAfterCommit(parent).push(...list);
};

/** `tx.transaction(fn)` (savepoint) + afterCommit ro'yxatini otaga ko'chirish. */
export const runInSavepoint = async <T>(tx: DbOrTx, fn: (sp: DbOrTx) => Promise<T>): Promise<T> => {
  let spRef: DbOrTx | undefined;
  try {
    const result = await tx.transaction(async (sp) => {
      spRef = sp;
      return fn(sp);
    });
    if (spRef) promoteTxAfterCommit(spRef, tx);
    return result;
  } catch (err) {
    if (spRef) dropTxAfterCommit(spRef);
    throw err;
  }
};
