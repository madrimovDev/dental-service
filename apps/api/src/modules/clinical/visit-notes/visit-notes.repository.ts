import { visitNotes } from '@dental/db-schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createVisitNotesRepository = () => {
  async function list(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(visitNotes.patientId, patientId));
    return db
      .select()
      .from(visitNotes)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(visitNotes.visitDate));
  }

  async function find(c: Context, id: string) {
    const db = getDb(c);
    const [note] = await db.select().from(visitNotes).where(eq(visitNotes.id, id));
    return note ?? null;
  }

  async function insert(c: Context, values: typeof visitNotes.$inferInsert) {
    const db = getDb(c);
    const [note] = await db.insert(visitNotes).values(values).returning();
    return note ?? null;
  }

  async function update(c: Context, id: string, patch: Partial<typeof visitNotes.$inferInsert>) {
    const db = getDb(c);
    const [updated] = await db
      .update(visitNotes)
      .set(patch)
      // UI-D4: imzolangan yozuv o'zgarmaydi (poyga: find → update orasida imzolansa ham).
      .where(and(eq(visitNotes.id, id), isNull(visitNotes.signedAt)))
      .returning();
    return updated ?? null;
  }

  /** Atomik imzolash: faqat hali imzolanmagan yozuv. Imzolangan/yo'q → null. */
  async function sign(c: Context, id: string, userId: string | null) {
    const db = getDb(c);
    const now = new Date();
    const [signed] = await db
      .update(visitNotes)
      .set({ signedAt: now, signedBy: userId, updatedAt: now })
      .where(and(eq(visitNotes.id, id), isNull(visitNotes.signedAt)))
      .returning();
    return signed ?? null;
  }

  return { list, find, insert, update, sign };
};
