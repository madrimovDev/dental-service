import type { Context } from 'hono';
import { logger } from '../lib/logger.ts';

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
