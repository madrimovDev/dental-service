import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { kekCheck, labs } from '../db/schema';
import { type Key, openKekCanary, sealKekCanary, unwrapDek } from './crypto';

export const KEK_MISMATCH =
  'LAB_HUB_KEK does not match the key this database was encrypted with — refusing to boot ' +
  '(new labs would get DEKs wrapped under the wrong key). Restore the original LAB_HUB_KEK.';

/**
 * Boot'da KEK'ni tekshiradi (Bun.serve'dan OLDIN chaqiriladi):
 *  1. `kek_check` kanareykasi bo'lsa — ochib ko'radi;
 *  2. kamida bitta lab bo'lsa — uning `dek_wrapped`ini ochib ko'radi
 *     (kanareykadan oldingi bazalar uchun ham ishlaydi);
 *  3. kanareyka yo'q bo'lsa — yozadi (parallel boot'da `ON CONFLICT DO NOTHING`,
 *     keyin qayta o'qib tekshiradi — boshqa KEK bilan yozilgan bo'lsa ham ushlanadi).
 * Mos kelmasa `KEK_MISMATCH` bilan throw.
 */
export const verifyKek = async (db: Database, kek: Key): Promise<'created' | 'verified'> => {
  const check = (fn: () => void) => {
    try {
      fn();
    } catch {
      throw new Error(KEK_MISMATCH);
    }
  };

  const [lab] = await db.select({ id: labs.id, dekWrapped: labs.dekWrapped }).from(labs).limit(1);
  if (lab) check(() => unwrapDek(kek, lab.dekWrapped, lab.id));

  const [existing] = await db.select().from(kekCheck).where(eq(kekCheck.id, 1));
  if (existing) {
    check(() => openKekCanary(kek, existing.canary));
    return 'verified';
  }
  const inserted = await db
    .insert(kekCheck)
    .values({ id: 1, canary: sealKekCanary(kek) })
    .onConflictDoNothing()
    .returning({ id: kekCheck.id });
  if (inserted.length > 0) return 'created';
  const [raced] = await db.select().from(kekCheck).where(eq(kekCheck.id, 1));
  check(() => openKekCanary(kek, raced!.canary));
  return 'verified';
};
