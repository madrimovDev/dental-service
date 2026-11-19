import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';

/**
 * Hub davri (FX-98). Kursor `<tx_id>.<seq>` klaster xid hisoblagichiga bog'liq; xid
 * `pg_dump`ga tushmaydi. Baza boshqa klasterga tiklansa (`hub_meta.system_identifier`
 * joriy klasternikiga teng emas) — davr yangilanadi va eski davr kursorlari boshidan
 * boshlanadi. Birinchi chaqiruvda qator yaratiladi. Parallel chaqiruvlar bitta davrga
 * keladi (`ON CONFLICT ... WHERE`: almashtirish faqat identifikator farq qilsa).
 *
 * Qaytaradi: joriy davr va `xmax` (birinchi hali berilmagan xid) — shu klasterda yozilgan
 * har yakunlangan hodisaning `tx_id`si undan kichik.
 */
export const currentHubEpoch = async (db: DbOrTx): Promise<{ epoch: string; xmax: bigint }> => {
  const rows = (await db.execute(sql`
    SELECT m.epoch::text AS epoch,
           m.system_identifier AS stored,
           s.system_identifier::text AS current,
           pg_snapshot_xmax(pg_current_snapshot())::text AS xmax
      FROM pg_control_system() s
      LEFT JOIN hub_meta m ON m.id = 1`)) as unknown as {
    epoch: string | null;
    stored: string | null;
    current: string;
    xmax: string;
  }[];
  const row = rows[0]!;
  const xmax = BigInt(row.xmax);
  if (row.epoch && row.stored === row.current) return { epoch: row.epoch, xmax };

  const up = (await db.execute(sql`
    INSERT INTO hub_meta (id, epoch, system_identifier)
    VALUES (1, gen_random_uuid(), ${row.current})
    ON CONFLICT (id) DO UPDATE
      SET epoch = gen_random_uuid(),
          system_identifier = EXCLUDED.system_identifier,
          rotated_at = now()
      WHERE hub_meta.system_identifier <> EXCLUDED.system_identifier
    RETURNING epoch::text AS epoch`)) as unknown as { epoch: string }[];
  if (up[0]) return { epoch: up[0].epoch, xmax };
  // Parallel chaqiruv bizdan oldin yozdi.
  const again = (await db.execute(
    sql`SELECT epoch::text AS epoch FROM hub_meta WHERE id = 1`,
  )) as unknown as { epoch: string }[];
  return { epoch: again[0]!.epoch, xmax };
};

/** Kursor: `[<epoch>:]<tx_id>.<seq>` (davrsiz — FX-98 dan oldingi klinikalar). */
export const CURSOR_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:)?\d{1,19}\.\d{1,19}$/;

/**
 * Kursorni joriy davrga nisbatan tahlil qiladi. Boshidan (`0.0`) boshlanadi, agar:
 *  - kursor davri joriy davr emas (boshqa klasterdan tiklangan baza yoki qo'lda almashtirish);
 *  - kursor `tx_id`si `xmax`dan kichik emas — shu klasterda bunday yakunlangan tranzaksiya
 *    bo'lishi mumkin emas (davrsiz eski kursor yangi klasterga keldi).
 */
export const resolveCursor = (
  since: string,
  current: { epoch: string; xmax: bigint },
): { tx: string; seq: string; reset: boolean } => {
  const colon = since.indexOf(':');
  const epoch = colon >= 0 ? since.slice(0, colon) : null;
  const [tx, seq] = since.slice(colon + 1).split('.') as [string, string];
  const reset = (epoch !== null && epoch !== current.epoch) || BigInt(tx) >= current.xmax;
  return reset ? { tx: '0', seq: '0', reset } : { tx, seq, reset };
};
