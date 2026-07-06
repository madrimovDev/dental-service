import { serviceMaterials, stockBatches, stockItems, stockMovements } from '@dental/db-schema';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { findRecipientsWithPermission } from '../../lib/notify-recipients.ts';
import { adjustmentDelta, applyMovement, isLowStock } from './stock.calc.ts';
import type {
  CreateBatchInput,
  CreateBomInput,
  CreateItemInput,
  CreateMovementInput,
  ListItemsQuery,
  UpdateItemInput,
} from './stock.schema.ts';

/** Qo'lda 'out' harakat manfiy qoldiqqa olib kelganda (negative-stock guard). */
export class InsufficientStockError extends Error {
  constructor(
    public itemId: string,
    public available: number,
    public requested: number,
  ) {
    super(`Insufficient stock: have ${available}, requested ${requested}`);
    this.name = 'InsufficientStockError';
  }
}

/** Low-stock alert recipient — `stock.manage` permission egasi (+ owner). */
type NotificationsDep = {
  notifyInTx: (
    tx: DbOrTx,
    tenantId: string,
    payload: { userId: string; type: string; title: string; body?: string },
  ) => Promise<unknown>;
};

export const createStockService = (deps: {
  audit: AuditLogger;
  notifications?: NotificationsDep;
}) => {
  /**
   * Low-stock alert — qoldiq chegaradan O'TGANDA (transition), har harakatda EMAS.
   * `stock.manage` egalariga (+ owner) in-app bildirishnoma (smsTo YO'Q → faqat insert,
   * deduction tx hot-path'ida tashqi gateway latency yo'q). Advisor qarori.
   */
  async function maybeAlertLowStock(
    c: Context,
    tx: DbOrTx,
    item: { id: string; name: string; branchId: string | null; minThreshold: string },
    oldQty: number,
    newQty: number,
  ) {
    if (!deps.notifications) return;
    const threshold = Number(item.minThreshold);
    // Faqat chegaradan PASTGA o'tganda (oldin >=, hozir <).
    if (!(oldQty >= threshold && newQty < threshold)) return;
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const recipients = await findRecipientsWithPermission(c, 'stock.manage', item.branchId);
    for (const userId of recipients) {
      await deps.notifications.notifyInTx(tx, tenantId, {
        userId,
        type: 'stock.low_threshold',
        title: `Kam qoldiq: ${item.name}`,
        body: `Qoldiq: ${newQty} (min: ${threshold})`,
      });
    }
  }

  // ===== Stock Items =====
  async function listItems(c: Context, query: ListItemsQuery) {
    const db = getDb(c);
    const filters = [];
    if (query.branchId) filters.push(eq(stockItems.branchId, query.branchId));

    const rows = await db
      .select()
      .from(stockItems)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(stockItems.name));

    // numeric(14,2) → string; Number() bilan solishtiramiz (leksik solishtiruvdan saqlanish).
    return rows.map((item) => ({
      ...item,
      lowStock: isLowStock(Number(item.quantity), Number(item.minThreshold)),
    }));
  }

  async function getItem(c: Context, id: string) {
    const db = getDb(c);
    const [item] = await db.select().from(stockItems).where(eq(stockItems.id, id));
    if (!item) return null;
    return { ...item, lowStock: isLowStock(Number(item.quantity), Number(item.minThreshold)) };
  }

  async function createItem(c: Context, input: CreateItemInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [item] = await db
      .insert(stockItems)
      .values({
        tenantId,
        branchId: input.branchId ?? null,
        name: input.name,
        unit: input.unit,
        category: input.category ?? null,
        price: input.price != null ? String(input.price) : null,
        quantity: String(input.quantity),
        minThreshold: String(input.minThreshold),
      })
      .returning();

    if (item) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'stock_item',
        resourceId: item.id,
        after: { name: input.name, quantity: input.quantity },
      });
    }
    return item;
  }

  async function updateItem(c: Context, id: string, input: UpdateItemInput) {
    const db = getDb(c);
    const [before] = await db.select().from(stockItems).where(eq(stockItems.id, id));
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.category !== undefined) patch.category = input.category;
    if (input.price !== undefined) patch.price = input.price != null ? String(input.price) : null;
    if (input.quantity !== undefined) patch.quantity = String(input.quantity);
    if (input.minThreshold !== undefined) patch.minThreshold = String(input.minThreshold);

    const [updated] = await db
      .update(stockItems)
      .set(patch)
      .where(eq(stockItems.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'stock_item',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  // ===== Stock Movements =====
  async function listMovements(c: Context, itemId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.itemId, itemId))
      .orderBy(desc(stockMovements.createdAt));
  }

  /** Movement insert + stock_items.quantity yangilash — bir tx (RLS tx-bound, set_config qayta). */
  async function createMovement(c: Context, input: CreateMovementInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [item] = await tx
        .select({
          id: stockItems.id,
          name: stockItems.name,
          branchId: stockItems.branchId,
          quantity: stockItems.quantity,
          minThreshold: stockItems.minThreshold,
        })
        .from(stockItems)
        .where(eq(stockItems.id, input.itemId))
        .for('update');
      if (!item) throw new Error('Stock item not found');

      const oldQty = Number(item.quantity);
      const newQuantity = applyMovement(oldQty, input.type, input.quantity);

      // Negative-stock guard — QO'LDA 'out' harakat manfiyga tushsa RAD (row-lock race-safe).
      // (Auto-deduction deductForServices'da guard YO'Q — vizit yozuvini bloklamaslik uchun.)
      // `adjustment` set-to-value (>= 0 schema'da majburlangan) → guardga kirmaydi.
      if (input.type === 'out' && newQuantity < 0) {
        throw new InsufficientStockError(input.itemId, oldQty, input.quantity);
      }

      // Ledger `quantity`: `in`/`out` → kiritilgan miqdor; `adjustment` → imzoli delta
      // (`target − oldQty`, masalan 100→90 → `-10`) — ledger haqiqiy o'zgarishni ko'rsatadi.
      const movementQuantity =
        input.type === 'adjustment' ? adjustmentDelta(oldQty, input.quantity) : input.quantity;

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId,
          itemId: input.itemId,
          type: input.type,
          quantity: String(movementQuantity),
          reason: input.reason ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();

      await tx
        .update(stockItems)
        .set({ quantity: String(newQuantity), updatedAt: new Date() })
        .where(eq(stockItems.id, input.itemId));

      if (movement) {
        await deps.audit.record(c, {
          action: 'created',
          resourceType: 'stock_movement',
          resourceId: movement.id,
          after: { itemId: input.itemId, type: input.type, quantity: input.quantity, newQuantity },
        });
      }
      await maybeAlertLowStock(c, tx, item, oldQty, newQuantity);
      return movement;
    });
  }

  // ===== BOM (service_materials) =====
  async function listBom(c: Context, serviceId?: string) {
    const db = getDb(c);
    const filters = [];
    if (serviceId) filters.push(eq(serviceMaterials.serviceId, serviceId));
    return db
      .select()
      .from(serviceMaterials)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(serviceMaterials.createdAt));
  }

  async function createBom(c: Context, input: CreateBomInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [bom] = await db
      .insert(serviceMaterials)
      .values({
        tenantId,
        serviceId: input.serviceId,
        itemId: input.itemId,
        qtyPerService: String(input.qtyPerService),
      })
      .returning();

    if (bom) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'service_material',
        resourceId: bom.id,
        after: input,
      });
    }
    return bom;
  }

  async function removeBom(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(serviceMaterials).where(eq(serviceMaterials.id, id));
    if (!before) return null;

    await db.delete(serviceMaterials).where(eq(serviceMaterials.id, id));

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'service_material',
      resourceId: id,
      before,
    });
    return before;
  }

  /**
   * Vizit yozuvi → ombor avtomatik chiqim (BOM bo'yicha).
   * clinical.service'ga DI orqali ulanadi (request-tx ichida ishlaydi — to'g'ridan import yo'q).
   * BOM topilmagan service → skip. Manfiyga ruxsat (guard yo'q).
   */
  async function deductForServices(c: Context, serviceIds: string[], sourceVisitNoteId: string) {
    if (serviceIds.length === 0) return;
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const boms = await db
      .select()
      .from(serviceMaterials)
      .where(inArray(serviceMaterials.serviceId, serviceIds));

    for (const bom of boms) {
      await db.insert(stockMovements).values({
        tenantId,
        itemId: bom.itemId,
        type: 'out',
        quantity: bom.qtyPerService,
        reason: 'visit_auto',
        sourceVisitNoteId,
        createdBy: c.get('user')?.id ?? null,
      });
      // ⚠️ Auto-deduction'da negative-stock guard YO'Q (advisor): vizit yozuvini ombor
      // noto'g'ri sozlangani uchun bloklamaslik kerak. Manfiyga ruxsat + alert. newQty
      // olish uchun .returning() (transition alert solishtiruvi uchun).
      const [updated] = await db
        .update(stockItems)
        .set({
          quantity: sql`${stockItems.quantity} - ${bom.qtyPerService}`,
          updatedAt: new Date(),
        })
        .where(eq(stockItems.id, bom.itemId))
        .returning({
          id: stockItems.id,
          name: stockItems.name,
          branchId: stockItems.branchId,
          quantity: stockItems.quantity,
          minThreshold: stockItems.minThreshold,
        });
      if (updated) {
        const newQty = Number(updated.quantity);
        await maybeAlertLowStock(c, db, updated, newQty + Number(bom.qtyPerService), newQty);
      }
    }
  }

  // ===== Stock batches (qabul + expiry/cost/supplier) — V2-2 =====

  /** Item bo'yicha partiyalar (yangi avval). */
  async function listBatches(c: Context, itemId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.itemId, itemId))
      .orderBy(desc(stockBatches.receivedAt));
  }

  /** Muddati yaqinlashayotgan partiyalar (default 30 kun). */
  async function expiringBatches(c: Context, withinDays = 30) {
    const db = getDb(c);
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return db
      .select()
      .from(stockBatches)
      .where(lte(stockBatches.expiryDate, cutoff))
      .orderBy(asc(stockBatches.expiryDate));
  }

  /**
   * Partiya qabul qilish — batch yozuvi + `qtyReceived` uchun 'in' stock movement
   * (quantity yagona manba bo'lib qoladi, Qaror #31). Bitta tx'da.
   */
  async function createBatch(c: Context, input: CreateBatchInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [batch] = await tx
        .insert(stockBatches)
        .values({
          tenantId,
          itemId: input.itemId,
          supplierName: input.supplierName ?? null,
          batchNumber: input.batchNumber ?? null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          costPerUnit: input.costPerUnit != null ? String(input.costPerUnit) : null,
          qtyReceived: String(input.qtyReceived),
        })
        .returning();

      // 'in' movement — quantity'ni oshiradi (qabul = ombor kirimi).
      await tx.insert(stockMovements).values({
        tenantId,
        itemId: input.itemId,
        type: 'in',
        quantity: String(input.qtyReceived),
        reason: 'batch_received',
        createdBy: user?.id ?? null,
      });
      await tx
        .update(stockItems)
        .set({
          quantity: sql`${stockItems.quantity} + ${String(input.qtyReceived)}`,
          updatedAt: new Date(),
        })
        .where(eq(stockItems.id, input.itemId));

      if (batch) {
        await deps.audit.record(c, {
          action: 'created',
          resourceType: 'stock_batch',
          resourceId: batch.id,
          after: batch,
        });
      }
      return batch ?? null;
    });
  }

  return {
    listItems,
    getItem,
    createItem,
    updateItem,
    listMovements,
    createMovement,
    listBom,
    createBom,
    removeBom,
    deductForServices,
    listBatches,
    expiringBatches,
    createBatch,
  };
};

export type StockService = ReturnType<typeof createStockService>;
