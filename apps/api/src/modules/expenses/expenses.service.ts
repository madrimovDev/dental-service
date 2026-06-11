import { expenseCategories, expenses } from '@dental/db-schema';
import { and, between, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type {
  CreateCategoryInput,
  CreateExpenseInput,
  ListExpensesQuery,
  SummaryQuery,
  UpdateCategoryInput,
  UpdateExpenseInput,
} from './expenses.schema.ts';

/**
 * Xarajatlar moduli — kategoriya CRUD + xarajat CRUD + kategoriya bo'yicha svod.
 *
 * Eslatma: `expenses.date` — naive `date` (kalendar kun, instant emas). Shuning uchun
 * Tashkent kun chegarasi `T..+05:00` arifmetikasi KERAK EMAS (cashier `dailySummary`
 * dan farqli — u `timestamptz` `created_at` ustida ishlaydi). ISO date string'ni
 * to'g'ridan-to'g'ri `between`/`gte`/`lte` ga uzatamiz — bu klinika kalendar kunini
 * avtomatik beradi.
 */
export const createExpensesService = (deps: { audit: AuditLogger }) => {
  // ===== Kategoriya =====

  async function listCategories(c: Context) {
    const db = getDb(c);
    return db.select().from(expenseCategories).orderBy(desc(expenseCategories.createdAt));
  }

  async function createCategory(c: Context, input: CreateCategoryInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [row] = await tx
        .insert(expenseCategories)
        .values({
          tenantId,
          name: input.name,
          nameRu: input.nameRu ?? null,
        })
        .returning();

      if (!row) throw new Error('Expense category insert failed');

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'expense_category',
        resourceId: row.id,
        after: row,
      });

      return row;
    });
  }

  async function updateCategory(c: Context, id: string, input: UpdateCategoryInput) {
    const db = getDb(c);
    const [before] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id));
    if (!before) return null;

    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.nameRu !== undefined ? { nameRu: input.nameRu } : {}),
    };
    // Bo'sh PATCH → Drizzle "No values to set" throw qiladi; before'ni qaytaramiz.
    if (Object.keys(patch).length === 0) return before;

    const [updated] = await db
      .update(expenseCategories)
      .set(patch)
      .where(eq(expenseCategories.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'expense_category',
        resourceId: id,
        before,
        after: updated,
      });
    }

    return updated;
  }

  async function deleteCategory(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id));
    if (!before) return null;

    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'expense_category',
      resourceId: id,
      before,
    });

    return before;
  }

  // ===== Xarajat =====

  async function list(c: Context, query: ListExpensesQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.categoryId) filters.push(eq(expenses.categoryId, query.categoryId));
    if (query.branchId) filters.push(eq(expenses.branchId, query.branchId));
    // `date` — kalendar kun; ISO date string'ni to'g'ridan uzatamiz (instant arifmetikasi yo'q).
    if (query.from && query.to) filters.push(between(expenses.date, query.from, query.to));
    else if (query.from) filters.push(gte(expenses.date, query.from));
    else if (query.to) filters.push(lte(expenses.date, query.to));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(expenses)
        .where(where)
        .orderBy(desc(expenses.date), desc(expenses.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(expenses).where(where),
    ]);

    const total = totalRows[0]?.total ?? 0;
    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    return row ?? null;
  }

  async function create(c: Context, input: CreateExpenseInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [row] = await tx
        .insert(expenses)
        .values({
          tenantId,
          categoryId: input.categoryId ?? null,
          branchId: input.branchId ?? null,
          amount: String(input.amount),
          date: input.date,
          note: input.note ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();

      if (!row) throw new Error('Expense insert failed');

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'expense',
        resourceId: row.id,
        after: row,
      });

      return row;
    });
  }

  async function update(c: Context, id: string, input: UpdateExpenseInput) {
    const db = getDb(c);
    const [before] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!before) return null;

    const patch = {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.amount !== undefined ? { amount: String(input.amount) } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };
    // Bo'sh PATCH → Drizzle "No values to set" throw qiladi; before'ni qaytaramiz.
    if (Object.keys(patch).length === 0) return before;

    const [updated] = await db.update(expenses).set(patch).where(eq(expenses.id, id)).returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'expense',
        resourceId: id,
        before,
        after: updated,
      });
    }

    return updated;
  }

  async function remove(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!before) return null;

    await db.delete(expenses).where(eq(expenses.id, id));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'expense',
      resourceId: id,
      before,
    });

    return before;
  }

  /**
   * Kategoriya bo'yicha svod — `GROUP BY category_id`.
   * `categoryId` nullable (FK `onDelete: set null`) — kategoriyasiz xarajatlar `null` guruhga tushadi.
   * `total` — `SUM(amount)` string sifatida qaytadi (numeric).
   */
  async function summary(c: Context, query: SummaryQuery) {
    const db = getDb(c);

    const filters = [];
    if (query.branchId) filters.push(eq(expenses.branchId, query.branchId));
    if (query.from && query.to) filters.push(between(expenses.date, query.from, query.to));
    else if (query.from) filters.push(gte(expenses.date, query.from));
    else if (query.to) filters.push(lte(expenses.date, query.to));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await db
      .select({
        categoryId: expenses.categoryId,
        total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        count: count(),
      })
      .from(expenses)
      .where(where)
      .groupBy(expenses.categoryId);

    const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);

    return { byCategory: rows, grandTotal };
  }

  return {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    list,
    getById,
    create,
    update,
    remove,
    summary,
  };
};

export type ExpensesService = ReturnType<typeof createExpensesService>;
