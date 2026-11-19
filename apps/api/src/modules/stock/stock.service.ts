import {
  appointments,
  expenses,
  serviceMaterials,
  stockBatches,
  stockItems,
  stockMovements,
  users,
  visitNotes,
} from '@dental/db-schema';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  type BranchScope,
  loadBranchScope as loadAssignedBranchScope,
  scopeAllows,
} from '../../lib/branch-scope.ts';
import { findRecipientsWithPermission } from '../../lib/notify-recipients.ts';
import { CrossEntityError, createOwnershipValidator } from '../../lib/ownership.ts';
import {
  adjustmentDelta,
  allocateBatchRemaining,
  applyMovement,
  avgDailyUsage,
  daysOfSupply,
  isLowStock,
  USAGE_WINDOW_DAYS,
} from './stock.calc.ts';
import type {
  CreateBatchInput,
  CreateBomInput,
  CreateItemInput,
  CreateMovementInput,
  ListItemsQuery,
  ListMovementsQuery,
  UpdateItemInput,
} from './stock.schema.ts';

/** `listMovements` default sahifa hajmi (CLI-442 #3 — chegaralanmagan tarix oldini olish). */
const DEFAULT_MOVEMENTS_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Tashkent UTC+5 (DST yo'q) — «bugun» chegarasi cashier/expenses bilan izchil. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const tashkentDateStr = (now = Date.now()) =>
  new Date(now + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

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

/** Owner (`@owner`) — atid'dan qat'i nazar cheksiz; qolganlar uchun tayinlov doirasi. */
const loadBranchScope = async (c: Context, permission: string): Promise<BranchScope> =>
  c.get('accessClaims')?.perms?.includes('@owner')
    ? { kind: 'all' }
    : loadAssignedBranchScope(c, permission);

/**
 * FX-115 (D-8): chaqiruvchining filial doirasidan tashqaridagi item/filial.
 * Routes `branch.forbidden` 403 ga aylantiradi (yozishdan OLDIN tashlanadi — hech narsa yozilmagan).
 */
export class StockBranchForbiddenError extends Error {
  constructor() {
    super('Stock branch forbidden');
    this.name = 'StockBranchForbiddenError';
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
  const ownership = createOwnershipValidator();

  /**
   * FX-115: item filialiga ruxsat. Doira `permission` bo'yicha (o'qish — `stock.view`,
   * yozish — `stock.manage`): owner/tenant-wide → hammasi; aks holda tayinlangan filiallar.
   * Tayinlovsiz (`none`) → fail-closed. Tenant-darajali item (`branchId = null`) —
   * har qanday tayinlangan xodim uchun operatsion (umumiy zaxira).
   */
  const itemAllowed = (scope: BranchScope, itemBranchId: string | null) => {
    if (scope.kind === 'none') return false;
    if (itemBranchId === null) return true;
    return scopeAllows(scope, itemBranchId);
  };
  const assertItemBranch = async (
    c: Context,
    permission: 'stock.view' | 'stock.manage',
    itemBranchId: string | null,
  ) => {
    if (!itemAllowed(await loadBranchScope(c, permission), itemBranchId)) {
      throw new StockBranchForbiddenError();
    }
  };
  /** Ro'yxat filtri: so'ralgan filial doirada bo'lishi shart; berilmasa — doiraga toraytiriladi. */
  const itemBranchFilter = async (c: Context, requested?: string) => {
    const scope = await loadBranchScope(c, 'stock.view');
    if (scope.kind === 'none') throw new StockBranchForbiddenError();
    if (requested) {
      if (!scopeAllows(scope, requested)) throw new StockBranchForbiddenError();
      return or(eq(stockItems.branchId, requested), isNull(stockItems.branchId));
    }
    if (scope.kind === 'branches') {
      return or(inArray(stockItems.branchId, scope.branchIds), isNull(stockItems.branchId));
    }
    return undefined;
  };

  /**
   * CLI-453 #5: `wasLow`/`isLow` — chaqiruvchi `isLowStock()` bilan oldindan hisoblab
   * beradi (qoldiq o'zgarganda ESKI/YANGI qoldiqni ESKI/YANGI threshold bilan, yoki
   * threshold o'zgarganda BIR XIL qoldiqni ESKI/YANGI threshold bilan). Shu orqali
   * bitta funksiya ikkala trigger-stsenariyni ("miqdor kamaydi" VA "chegara oshirildi")
   * qamrab oladi — recipient-lookup+notify kodi dublikatsiyasiz.
   */
  async function maybeAlertLowStock(
    c: Context,
    tx: DbOrTx,
    item: { id: string; name: string; branchId: string | null; minThreshold: string },
    wasLow: boolean,
    isLow: boolean,
    currentQty: number,
  ) {
    if (!deps.notifications) return;
    // Faqat YANGI transition (avval past emas edi, hozir past) — har chaqiruvda emas.
    if (!(!wasLow && isLow)) return;
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const threshold = Number(item.minThreshold);
    const recipients = await findRecipientsWithPermission(c, 'stock.manage', item.branchId);
    for (const userId of recipients) {
      await deps.notifications.notifyInTx(tx, tenantId, {
        userId,
        type: 'stock.low_threshold',
        title: `Kam qoldiq: ${item.name}`,
        body: `Qoldiq: ${currentQty} (min: ${threshold})`,
      });
    }
  }

  /**
   * Item bo'yicha oxirgi 30 kun SOF sarfi: `out` yig'indisi − `visit_edit_return` (`in`).
   * Qo'lda kirim (`in`) va inventarizatsiya (`adjustment`) sarf emas. RLS tenantni filtrlaydi.
   */
  async function netConsumption(c: Context, itemIds?: string[]) {
    const db = getDb(c);
    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * DAY_MS);
    const net = sql<string>`coalesce(sum(case
      when ${stockMovements.type} = 'out' then ${stockMovements.quantity}
      when ${stockMovements.type} = 'in' and ${stockMovements.reason} = 'visit_edit_return' then -${stockMovements.quantity}
      else 0 end), 0)`;
    const rows = await db
      .select({ itemId: stockMovements.itemId, net })
      .from(stockMovements)
      .where(
        and(
          gte(stockMovements.createdAt, since),
          itemIds ? inArray(stockMovements.itemId, itemIds) : undefined,
        ),
      )
      .groupBy(stockMovements.itemId);
    return new Map(rows.map((r) => [r.itemId, Number(r.net)]));
  }

  const withUsage = <T extends { id: string; quantity: string; minThreshold: string }>(
    item: T,
    consumed: Map<string, number>,
  ) => {
    const avg = avgDailyUsage(consumed.get(item.id) ?? 0);
    return {
      ...item,
      lowStock: isLowStock(Number(item.quantity), Number(item.minThreshold)),
      avgDailyUsage: avg,
      daysLeft: daysOfSupply(Number(item.quantity), avg),
    };
  };

  /** Item (RLS ostida) bo'yicha o'qish ruxsati; item topilmasa — bo'sh natija uchun tekshirilmaydi. */
  async function assertViewableItem(c: Context, itemId: string) {
    const [item] = await getDb(c)
      .select({ branchId: stockItems.branchId })
      .from(stockItems)
      .where(eq(stockItems.id, itemId));
    if (item) await assertItemBranch(c, 'stock.view', item.branchId);
  }

  // ===== Stock Items =====
  async function listItems(c: Context, query: ListItemsQuery) {
    const db = getDb(c);
    // CLI-441 #5: branchId bo'yicha filtrlaganda tenant-bo'ylab (branchId=null) itemlar
    // ham ko'rsatilsin — `stockItems.branchId` nullable (barcha filialga tegishli item).
    // FX-115: default (branchId yo'q) chaqiruvchi doirasiga toraytiriladi.
    const filter = await itemBranchFilter(c, query.branchId);

    const rows = await db.select().from(stockItems).where(filter).orderBy(asc(stockItems.name));

    // numeric(14,2) → string; Number() bilan solishtiramiz (leksik solishtiruvdan saqlanish).
    const consumed = await netConsumption(c);
    return rows.map((item) => withUsage(item, consumed));
  }

  async function getItem(c: Context, id: string) {
    const db = getDb(c);
    const [item] = await db.select().from(stockItems).where(eq(stockItems.id, id));
    if (!item) return null;
    await assertItemBranch(c, 'stock.view', item.branchId);
    return withUsage(item, await netConsumption(c, [item.id]));
  }

  async function createItem(c: Context, input: CreateItemInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // FX-115: yangi item filiali doirada bo'lishi shart; tenant-darajali (branchId yo'q)
    // item — faqat owner/tenant-wide. Filial shu tenantda mavjudligi ham tekshiriladi (X-1).
    const manageScope = await loadBranchScope(c, 'stock.manage');
    if (input.branchId) {
      await ownership.assertBranchExists(c, input.branchId);
      if (!itemAllowed(manageScope, input.branchId)) throw new StockBranchForbiddenError();
    } else if (manageScope.kind !== 'all') {
      throw new StockBranchForbiddenError();
    }

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

    // IR-01: boshlang'ich qoldiq ledgerga yoziladi (avval faqat `quantity` ustuni edi —
    // harakatlar tarixi nol bilan boshlanardi). qty 0 → qator yo'q.
    if (item && input.quantity > 0) {
      await db.insert(stockMovements).values({
        tenantId,
        itemId: item.id,
        type: 'in',
        quantity: String(input.quantity),
        reason: 'initial_balance',
        createdBy: c.get('user')?.id ?? null,
      });
    }

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

    // FX-115: item filiali doirada bo'lishi shart; filialni O'ZGARTIRISH (item boshqa
    // filialga/tenant-darajaga ko'chadi) — faqat owner/tenant-wide, va yangi filial shu tenantda.
    const manageScope = await loadBranchScope(c, 'stock.manage');
    if (!itemAllowed(manageScope, before.branchId)) throw new StockBranchForbiddenError();
    if (input.branchId !== undefined && input.branchId !== before.branchId) {
      if (manageScope.kind !== 'all') throw new StockBranchForbiddenError();
      if (input.branchId !== null) await ownership.assertBranchExists(c, input.branchId);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.category !== undefined) patch.category = input.category;
    if (input.price !== undefined) patch.price = input.price != null ? String(input.price) : null;
    // CLI-424: `quantity` PATCH orqali o'zgartirilmaydi (ledger chetlanmasin) — schema'dan
    // olib tashlangan (`UpdateItemInput`da yo'q). Qoldiq faqat movement/batch orqali.
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

      // CLI-453 #5: `minThreshold` PATCH orqali o'zgarganda ham low-stock alert
      // trigger bo'lishi kerak (avval faqat `quantity` o'zgarganda — createMovement/
      // deductForServices/reconcileForServices — chaqirilardi). `quantity` o'zi
      // o'zgarmaydi (CLI-424) — shuning uchun `wasLow`/`isLow` ESKI/YANGI thresholdga
      // nisbatan BIR XIL qoldiq bilan hisoblanadi.
      if (input.minThreshold !== undefined) {
        const quantity = Number(before.quantity);
        const oldThreshold = Number(before.minThreshold);
        const newThreshold = Number(updated.minThreshold);
        await maybeAlertLowStock(
          c,
          db,
          updated,
          isLowStock(quantity, oldThreshold),
          isLowStock(quantity, newThreshold),
          quantity,
        );
      }
    }
    return updated;
  }

  // ===== Stock Movements =====
  /**
   * CLI-442 #3: sahifalab qaytaradi (default 50/sahifa) — uzoq ishlagan itemda minglab
   * movement bitta so'rovda qaytmasin. `page`/`pageSize` ixtiyoriy — berilmasa 1-sahifa,
   * default hajm.
   */
  async function listMovements(c: Context, query: ListMovementsQuery) {
    const db = getDb(c);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_MOVEMENTS_PAGE_SIZE;
    await assertViewableItem(c, query.itemId);
    return db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.itemId, query.itemId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }

  /** Movement insert + stock_items.quantity yangilash — bir tx (RLS tx-bound, set_config qayta). */
  async function createMovement(c: Context, input: CreateMovementInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');
    const manageScope = await loadBranchScope(c, 'stock.manage');

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
      // X-1 (FX-03a): begona/yo'q itemId — routes 404 (RLS bo'sh select).
      if (!item) throw new CrossEntityError('stock_item', 'not_found');
      // FX-115: begona filial itemi — yozishdan OLDIN rad (qoldiq/ledger o'zgarmaydi).
      if (!itemAllowed(manageScope, item.branchId)) throw new StockBranchForbiddenError();

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
      {
        const threshold = Number(item.minThreshold);
        await maybeAlertLowStock(
          c,
          tx,
          item,
          isLowStock(oldQty, threshold),
          isLowStock(newQuantity, threshold),
          newQuantity,
        );
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

    // X-1 (FX-03a): FK RLS'ni chetlab o'tadi — begona serviceId/itemId insertdan OLDIN rad.
    await ownership.assertServiceExists(c, input.serviceId);
    await ownership.assertStockItemExists(c, input.itemId);
    // FX-115: BOM faqat o'z filiali (yoki tenant-darajali) itemiga.
    const [bomItem] = await db
      .select({ branchId: stockItems.branchId })
      .from(stockItems)
      .where(eq(stockItems.id, input.itemId));
    await assertItemBranch(c, 'stock.manage', bomItem?.branchId ?? null);

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
   * FX-35 (LA-11): vizit filiali — yozilish (appointment) filiali, bo'lmasa aktiv filial
   * (JWT `abid`). Noma'lum bo'lsa `null` (eski xulq: BOM itemi o'z holicha).
   */
  async function resolveVisitBranch(c: Context, visitNoteId: string): Promise<string | null> {
    const [row] = await getDb(c)
      .select({ branchId: appointments.branchId })
      .from(visitNotes)
      .innerJoin(appointments, eq(appointments.id, visitNotes.appointmentId))
      .where(eq(visitNotes.id, visitNoteId));
    return row?.branchId ?? c.get('activeBranchId') ?? null;
  }

  /**
   * FX-35: BOM itemini vizit filialiga moslaydi. Item tenant-darajali yoki vizit filialida
   * bo'lsa — o'zi; boshqa filial itemi bo'lsa — vizit filialidagi shu nomli/birlikli item
   * (tenant-darajali BOM filial itemlarini qamray olmaydi). Mos item yo'q → qator tashlanadi
   * (begona filial ombori kamaytirilmaydi; vizit yozuvi baribir bloklanmaydi).
   */
  async function resolveBomItems<T extends { itemId: string }>(
    c: Context,
    boms: T[],
    visitNoteId: string,
  ): Promise<T[]> {
    if (boms.length === 0) return boms;
    const visitBranch = await resolveVisitBranch(c, visitNoteId);
    if (!visitBranch) return boms;
    const db = getDb(c);
    const items = await db
      .select({
        id: stockItems.id,
        name: stockItems.name,
        unit: stockItems.unit,
        branchId: stockItems.branchId,
      })
      .from(stockItems)
      .where(inArray(stockItems.id, [...new Set(boms.map((b) => b.itemId))]));
    const byId = new Map(items.map((i) => [i.id, i]));
    const norm = (v: string) => v.trim().toLowerCase();
    let siblings: { id: string; name: string; unit: string }[] | undefined;
    const result: T[] = [];
    for (const bom of boms) {
      const item = byId.get(bom.itemId);
      if (!item) continue;
      if (item.branchId === null || item.branchId === visitBranch) {
        result.push(bom);
        continue;
      }
      siblings ??= await db
        .select({ id: stockItems.id, name: stockItems.name, unit: stockItems.unit })
        .from(stockItems)
        .where(eq(stockItems.branchId, visitBranch))
        .orderBy(asc(stockItems.createdAt));
      const match = siblings.find((s) => norm(s.name) === norm(item.name) && s.unit === item.unit);
      if (match) result.push({ ...bom, itemId: match.id });
    }
    return result;
  }

  /**
   * Vizit yozuvi → ombor avtomatik chiqim (BOM bo'yicha).
   * clinical.service'ga DI orqali ulanadi (request-tx ichida ishlaydi — to'g'ridan import yo'q).
   * BOM topilmagan service → skip. Manfiyga ruxsat (guard yo'q).
   *
   * CLI-414 (stock-side handoff): `serviceIds` bir vizitda TAKROR bo'lishi mumkin
   * (masalan `[X, X]` — bitta xizmat ikki marta bajarilgan). `inArray` BOM'larni faqat
   * *distinct* serviceId bo'yicha oladi — bu o'zi to'g'ri (BOM jadvalda serviceId'ga bir
   * marta yozilgan), lekin deduction takrorlanish (occurrence) SONIGA qarab bo'lishi kerak,
   * bitta emas. Count-map orqali har BOM occurrence-count marta ayiriladi (har occurrence —
   * alohida movement qatori, ledger granularityси saqlanadi).
   */
  async function deductForServices(c: Context, serviceIds: string[], sourceVisitNoteId: string) {
    if (serviceIds.length === 0) return;
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // Har serviceId necha marta takrorlanganini sanash (masalan [X,X] -> X:2).
    const occurrenceCount = new Map<string, number>();
    for (const serviceId of serviceIds) {
      occurrenceCount.set(serviceId, (occurrenceCount.get(serviceId) ?? 0) + 1);
    }

    const boms = await resolveBomItems(
      c,
      await db
        .select()
        .from(serviceMaterials)
        .where(inArray(serviceMaterials.serviceId, serviceIds)),
      sourceVisitNoteId,
    );

    for (const bom of boms) {
      const count = occurrenceCount.get(bom.serviceId) ?? 1;
      for (let i = 0; i < count; i++) {
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
          const oldQty = newQty + Number(bom.qtyPerService);
          const threshold = Number(updated.minThreshold);
          await maybeAlertLowStock(
            c,
            db,
            updated,
            isLowStock(oldQty, threshold),
            isLowStock(newQty, threshold),
            newQty,
          );
        }
      }
    }
  }

  /**
   * CLI-445 — visit-note UPDATE'da `performedServices` reconciliation (CLI-414 §3/§4 spec).
   * `before`/`after` — occurrence-aware multiset (bir xizmat bir vizitda bir necha marta
   * bo'lishi mumkin). Har xizmat uchun `delta = after.count - before.count`:
   *   - `delta > 0` → BOM `delta` marta ayiriladi (`out`, `reason:'visit_auto'`) — CREATE
   *     yo'lidagi (`deductForServices`) konventsiya bilan bir xil.
   *   - `delta < 0` → BOM `|delta|` marta qaytariladi (`in`, `reason:'visit_edit_return'`).
   *   - `delta === 0` → tegilmaydi (bir xil PATCH → nol movement, idempotent).
   * Har occurrence — alohida `stock_movements` qatori (ledger granularity `deductForServices`
   * bilan bir xil). Negative-stock guard YO'Q (auto-deduction'dagi kabi — advisor qarori,
   * vizit yozuvini bloklamaslik). Restock yo'lida ham `maybeAlertLowStock` chaqiriladi
   * (qoldiq oshganda pastdan yuqoriga o'tsa alert kerak emas, lekin funksiya o'zi faqat
   * PASTGA o'tishda triggerlanadi — no-op yuqoriga transition uchun).
   */
  async function reconcileForServices(
    c: Context,
    before: string[],
    after: string[],
    sourceVisitNoteId: string,
  ) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const beforeCount = new Map<string, number>();
    for (const serviceId of before) {
      beforeCount.set(serviceId, (beforeCount.get(serviceId) ?? 0) + 1);
    }
    const afterCount = new Map<string, number>();
    for (const serviceId of after) {
      afterCount.set(serviceId, (afterCount.get(serviceId) ?? 0) + 1);
    }

    const allServiceIds = new Set([...beforeCount.keys(), ...afterCount.keys()]);
    const deltas = new Map<string, number>();
    for (const serviceId of allServiceIds) {
      const delta = (afterCount.get(serviceId) ?? 0) - (beforeCount.get(serviceId) ?? 0);
      if (delta !== 0) deltas.set(serviceId, delta);
    }
    if (deltas.size === 0) return;

    const boms = await resolveBomItems(
      c,
      await db
        .select()
        .from(serviceMaterials)
        .where(inArray(serviceMaterials.serviceId, [...deltas.keys()])),
      sourceVisitNoteId,
    );

    for (const bom of boms) {
      const delta = deltas.get(bom.serviceId);
      if (!delta) continue;

      const occurrences = Math.abs(delta);
      const isDeduction = delta > 0;
      const movementType = isDeduction ? ('out' as const) : ('in' as const);
      const reason = isDeduction ? 'visit_auto' : 'visit_edit_return';

      for (let i = 0; i < occurrences; i++) {
        await db.insert(stockMovements).values({
          tenantId,
          itemId: bom.itemId,
          type: movementType,
          quantity: bom.qtyPerService,
          reason,
          sourceVisitNoteId,
          createdBy: c.get('user')?.id ?? null,
        });

        // ⚠️ Negative-stock guard YO'Q (deductForServices bilan bir xil — advisor qarori).
        const [updated] = await db
          .update(stockItems)
          .set({
            quantity: isDeduction
              ? sql`${stockItems.quantity} - ${bom.qtyPerService}`
              : sql`${stockItems.quantity} + ${bom.qtyPerService}`,
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
          const oldQty = isDeduction
            ? newQty + Number(bom.qtyPerService)
            : newQty - Number(bom.qtyPerService);
          const threshold = Number(updated.minThreshold);
          await maybeAlertLowStock(
            c,
            db,
            updated,
            isLowStock(oldQty, threshold),
            isLowStock(newQty, threshold),
            newQty,
          );
        }
      }
    }
  }

  // ===== Stock batches (qabul + expiry/cost/supplier) — V2-2 =====

  /** Item bo'yicha partiyalar (yangi avval). */
  async function listBatches(c: Context, itemId: string) {
    const db = getDb(c);
    await assertViewableItem(c, itemId);
    return db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.itemId, itemId))
      .orderBy(desc(stockBatches.receivedAt));
  }

  /**
   * Muddati yaqinlashayotgan (yoki o'tib ketgan) partiyalar (default 30 kun) — FAQAT qoldig'i
   * borlar (IR-02): partiya qoldig'i item qoldig'ini FIFO bilan taqsimlash orqali topiladi
   * (`allocateBatchRemaining`). Filial filtri: tanlangan filial + tenant-darajali (branchId=null).
   */
  async function expiringBatches(c: Context, withinDays = 30, branchId?: string) {
    const db = getDb(c);
    const cutoff = new Date(Date.now() + withinDays * DAY_MS);
    const branchFilter = await itemBranchFilter(c, branchId);

    const candidates = await db
      .select({ batch: stockBatches, itemName: stockItems.name, unit: stockItems.unit })
      .from(stockBatches)
      .innerJoin(stockItems, eq(stockItems.id, stockBatches.itemId))
      .where(and(lte(stockBatches.expiryDate, cutoff), branchFilter))
      .orderBy(asc(stockBatches.expiryDate));
    if (candidates.length === 0) return [];

    // FIFO taqsimot uchun shu itemlarning BARCHA partiyalari kerak (muddati uzoqlari ham —
    // ular eng yangi bo'lib qoldiqni oldin "oladi").
    const itemIds = [...new Set(candidates.map((r) => r.batch.itemId))];
    const [items, allBatches] = await Promise.all([
      db
        .select({ id: stockItems.id, quantity: stockItems.quantity })
        .from(stockItems)
        .where(inArray(stockItems.id, itemIds)),
      db.select().from(stockBatches).where(inArray(stockBatches.itemId, itemIds)),
    ]);
    const qtyByItem = new Map(items.map((i) => [i.id, Number(i.quantity)]));
    const remaining = new Map<string, number>();
    for (const itemId of itemIds) {
      const mine = allBatches
        .filter((b) => b.itemId === itemId)
        .map((b) => ({ id: b.id, receivedAt: b.receivedAt, qtyReceived: Number(b.qtyReceived) }));
      for (const r of allocateBatchRemaining(qtyByItem.get(itemId) ?? 0, mine)) {
        remaining.set(r.id, r.qtyRemaining);
      }
    }

    return candidates
      .map((r) => ({
        ...r.batch,
        itemName: r.itemName,
        unit: r.unit,
        qtyRemaining: remaining.get(r.batch.id) ?? 0,
      }))
      .filter((b) => b.qtyRemaining > 0);
  }

  /**
   * Bugungi (Asia/Tashkent) avto-yechish jurnali: vizit yozuvidan kelgan chiqim (`visit_auto`)
   * va qaytarish (`visit_edit_return`), yangisi birinchi. Shifokor nomi vizit yozuvidan.
   */
  async function autoDeductionsToday(c: Context, branchId?: string) {
    const db = getDb(c);
    const dayStart = new Date(`${tashkentDateStr()}T00:00:00+05:00`);
    const branchFilter = await itemBranchFilter(c, branchId);
    return db
      .select({
        id: stockMovements.id,
        itemId: stockMovements.itemId,
        itemName: stockItems.name,
        unit: stockItems.unit,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.reason,
        doctorName: users.fullName,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(stockItems, eq(stockItems.id, stockMovements.itemId))
      .leftJoin(visitNotes, eq(visitNotes.id, stockMovements.sourceVisitNoteId))
      .leftJoin(users, eq(users.id, visitNotes.doctorId))
      .where(
        and(
          gte(stockMovements.createdAt, dayStart),
          inArray(stockMovements.reason, ['visit_auto', 'visit_edit_return']),
          branchFilter,
        ),
      )
      .orderBy(desc(stockMovements.createdAt))
      .limit(100);
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

    // X-1 (FX-03a): begona itemId — partiya/harakat yozilmasin.
    await ownership.assertStockItemExists(c, input.itemId);
    // FX-115: partiya faqat o'z filiali (yoki tenant-darajali) itemiga.
    const [batchItem] = await db
      .select({ branchId: stockItems.branchId })
      .from(stockItems)
      .where(eq(stockItems.id, input.itemId));
    await assertItemBranch(c, 'stock.manage', batchItem?.branchId ?? null);

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

      // UI-M5: kirim → xarajat (ixtiyoriy). Marshrut `expense.manage`ni oldindan tekshiradi;
      // schema `costPerUnit`ni majburlaydi. Bir tx: partiya + ledger + xarajat birga yoziladi.
      if (batch && input.recordAsExpense && input.costPerUnit != null) {
        const [item] = await tx
          .select({ name: stockItems.name, branchId: stockItems.branchId })
          .from(stockItems)
          .where(eq(stockItems.id, input.itemId));
        const amount = Math.round(input.qtyReceived * input.costPerUnit * 100) / 100;
        const [expense] = await tx
          .insert(expenses)
          .values({
            tenantId,
            branchId: item?.branchId ?? null,
            amount: String(amount),
            date: tashkentDateStr(),
            note: `Ombor kirimi: ${item?.name ?? ''} × ${input.qtyReceived}${
              input.batchNumber ? ` (partiya ${input.batchNumber})` : ''
            }`,
            createdBy: user?.id ?? null,
          })
          .returning();
        if (expense) {
          await deps.audit.record(c, {
            action: 'created',
            resourceType: 'expense',
            resourceId: expense.id,
            after: { amount, source: 'stock_batch', batchId: batch.id },
          });
        }
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
    reconcileForServices,
    listBatches,
    expiringBatches,
    autoDeductionsToday,
    createBatch,
  };
};

export type StockService = ReturnType<typeof createStockService>;
