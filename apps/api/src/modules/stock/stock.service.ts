import { serviceMaterials, stockItems, stockMovements } from '@dental/db-schema';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { applyMovement, isLowStock } from './stock.calc.ts';
import type {
  CreateBomInput,
  CreateItemInput,
  CreateMovementInput,
  ListItemsQuery,
  UpdateItemInput,
} from './stock.schema.ts';

export const createStockService = (deps: { audit: AuditLogger }) => {
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
        .select({ quantity: stockItems.quantity })
        .from(stockItems)
        .where(eq(stockItems.id, input.itemId))
        .for('update');
      if (!item) throw new Error('Stock item not found');

      const newQuantity = applyMovement(Number(item.quantity), input.type, input.quantity);

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId,
          itemId: input.itemId,
          type: input.type,
          quantity: String(input.quantity),
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
      await db
        .update(stockItems)
        .set({
          quantity: sql`${stockItems.quantity} - ${bom.qtyPerService}`,
          updatedAt: new Date(),
        })
        .where(eq(stockItems.id, bom.itemId));
    }
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
  };
};

export type StockService = ReturnType<typeof createStockService>;
