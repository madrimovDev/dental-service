import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { caseFiles, caseMessages, cases, labs } from '../db/schema';
import { withLab } from '../db/scoped';
import type { Deps } from '../deps';
import { recordEvent } from '../modules/cases/case-core';

/**
 * Saqlash muddati (L9): `delivered`dan 12 oy keyin (rad etilgan ishlar — oxirgi
 * o'zgarishdan 12 oy keyin) bemor ismi, izoh, rang, xabarlar va fayl nomlari
 * NULL, fayl bloblari diskdan o'chiriladi. Narx/akt (approved_price, settlements)
 * qoladi. `case_events`ga `purged`. Idempotent (`purged_at`).
 */
export const RETENTION_MONTHS = 12;

export const retentionCutoff = (now: Date) => {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d;
};

export const runRetention = async (deps: Pick<Deps, 'db' | 'storage' | 'now'>) => {
  const cutoff = retentionCutoff(deps.now());
  const labRows = await deps.db.select({ id: labs.id }).from(labs);
  let purged = 0;
  let filesRemoved = 0;
  for (const { id: labId } of labRows) {
    const keys = await withLab(deps.db, labId, async (tx) => {
      const due = await tx
        .select()
        .from(cases)
        .where(
          and(
            isNull(cases.purgedAt),
            or(
              lt(cases.deliveredAt, cutoff),
              and(eq(cases.status, 'rejected'), lt(cases.updatedAt, cutoff)),
            ),
          ),
        );
      if (due.length === 0) return [] as string[];
      const ids = due.map((c) => c.id);
      const files = await tx
        .select({ id: caseFiles.id, storageKey: caseFiles.storageKey })
        .from(caseFiles)
        .where(and(inArray(caseFiles.caseId, ids), isNull(caseFiles.deletedAt)));
      const now = deps.now();
      await tx
        .update(caseFiles)
        .set({ fileNameEnc: null, deletedAt: now })
        .where(inArray(caseFiles.caseId, ids));
      await tx.update(caseMessages).set({ bodyEnc: null }).where(inArray(caseMessages.caseId, ids));
      await tx
        .update(cases)
        .set({ patientNameEnc: null, noteEnc: null, shadeEnc: null, purgedAt: now })
        .where(inArray(cases.id, ids));
      for (const c of due) {
        await recordEvent(tx, {
          caseRow: c,
          type: 'purged',
          actor: 'system',
          payload: { filesRemoved: files.length },
        });
      }
      purged += due.length;
      return files.map((f) => f.storageKey);
    });
    // Disk — commit'dan KEYIN (rollback bo'lsa fayl yo'qolmasligi uchun).
    for (const key of keys) {
      await deps.storage.remove(key);
      filesRemoved++;
    }
  }
  return { purged, filesRemoved };
};

/** Kunlik ishga tushirish (index.ts). */
export const scheduleRetention = (
  deps: Pick<Deps, 'db' | 'storage' | 'now'>,
  everyMs = 86_400_000,
) => {
  const tick = () =>
    runRetention(deps)
      .then(
        (r) => r.purged && console.log(`[retention] purged=${r.purged} files=${r.filesRemoved}`),
      )
      .catch((err) => console.error('[retention] failed', err));
  const first = setTimeout(tick, 60_000);
  const timer = setInterval(tick, everyMs);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
};
