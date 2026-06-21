import { visitNoteTemplates } from '@dental/db-schema';
import { and, desc, eq, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

/**
 * Visit-note template repository — RLS-bound (getDb(c)) tenant izolyatsiyasi.
 * Visibility/ownership BIZNES filtri bu yerda explicit (RLS tenant_id'ni alohida filtrlaydi):
 *   - list: isShared = true YOKI createdBy = me
 *   - find (mutation uchun): createdBy = me (qat'iy egalik — boshqa doktor o'zgartira olmaydi)
 */
export const createVisitNoteTemplatesRepository = () => {
  async function list(c: Context, userId: string, category?: string) {
    const db = getDb(c);
    const visibility = or(
      eq(visitNoteTemplates.isShared, true),
      eq(visitNoteTemplates.createdBy, userId),
    );
    const filters = category
      ? and(visibility, eq(visitNoteTemplates.category, category))
      : visibility;
    return db
      .select()
      .from(visitNoteTemplates)
      .where(filters)
      .orderBy(desc(visitNoteTemplates.createdAt));
  }

  /** Owner-scoped fetch — mutation (patch/delete) avtorizatsiyasi + audit before-image. */
  async function findOwned(c: Context, id: string, userId: string) {
    const db = getDb(c);
    const [row] = await db
      .select()
      .from(visitNoteTemplates)
      .where(and(eq(visitNoteTemplates.id, id), eq(visitNoteTemplates.createdBy, userId)));
    return row ?? null;
  }

  async function insert(c: Context, values: typeof visitNoteTemplates.$inferInsert) {
    const db = getDb(c);
    const [row] = await db.insert(visitNoteTemplates).values(values).returning();
    return row ?? null;
  }

  async function update(
    c: Context,
    id: string,
    userId: string,
    patch: Partial<typeof visitNoteTemplates.$inferInsert>,
  ) {
    const db = getDb(c);
    const [row] = await db
      .update(visitNoteTemplates)
      .set(patch)
      .where(and(eq(visitNoteTemplates.id, id), eq(visitNoteTemplates.createdBy, userId)))
      .returning();
    return row ?? null;
  }

  async function remove(c: Context, id: string, userId: string) {
    const db = getDb(c);
    const [row] = await db
      .delete(visitNoteTemplates)
      .where(and(eq(visitNoteTemplates.id, id), eq(visitNoteTemplates.createdBy, userId)))
      .returning();
    return row ?? null;
  }

  return { list, findOwned, insert, update, remove };
};
