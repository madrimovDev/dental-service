import { labOrderFiles, labOrders } from '@dental/db-schema';
import { and, asc, count, desc, eq, lt, notInArray } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  CrossEntityError,
  createOwnershipValidator,
  type OwnershipValidator,
} from '../../lib/ownership.ts';
import { deleteObject, labOrderFileKey, presignedGetUrl, uploadObject } from '../../lib/s3.ts';
import { enqueueLabHub, LabHubOrderError, type LabOrderHubOp } from './lab-orders.hub.ts';
import type {
  CreateLabOrderInput,
  ListLabOrdersQuery,
  UpdateLabOrderInput,
} from './lab-orders.schema.ts';
import { assertLabOrderTransition, type LabOrderStatus } from './lab-orders.transitions.ts';

/**
 * `dueDate` (kalendar kun) → `expectedDate` (timestamptz): O'zbekiston (UTC+5) kun oxiri.
 * Eski `overdue()` va ro'yxat `expectedDate`ga tayanadi — kun oxirigacha "muddati o'tmagan".
 */
const dueDateToExpected = (dueDate: string): Date => new Date(`${dueDate}T23:59:59+05:00`);

export type UploadLabFileInput = {
  label?: string;
  originalFilename: string;
  contentType: string;
  ext: string;
  body: ArrayBuffer;
};

export const createLabOrdersService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();
  /**
   * DS7: tenant-wide yoki patientId-filtered ro'yxat. RLS tenant bo'yicha filtrlaydi
   * (explicit WHERE tenant_id YO'Q). Pagination + ixtiyoriy status filtri; jami count alohida.
   */
  async function list(c: Context, query: ListLabOrdersQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.patientId) filters.push(eq(labOrders.patientId, query.patientId));
    if (query.status) filters.push(eq(labOrders.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [data, totalRows] = await Promise.all([
      db
        .select()
        .from(labOrders)
        .where(where)
        .orderBy(desc(labOrders.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(labOrders).where(where),
    ]);
    const total = totalRows[0]?.total ?? 0;

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: query.patientId ?? null,
      after: { patientId: query.patientId ?? null, count: data.length },
    });

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Muddati o'tgan buyurtmalar (V3-5) — expectedDate < hozir, delivered/cancelled EMAS. */
  async function overdue(c: Context) {
    const db = getDb(c);
    const rows = await db
      .select()
      .from(labOrders)
      .where(
        and(
          lt(labOrders.expectedDate, new Date()),
          notInArray(labOrders.status, ['delivered', 'cancelled']),
        ),
      )
      .orderBy(labOrders.expectedDate);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: null,
      after: { overdue: true, count: rows.length },
    });
    return rows;
  }

  async function get(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id));
    if (row) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'lab_order',
        resourceId: id,
      });
    }
    return row ?? null;
  }

  async function create(c: Context, input: CreateLabOrderInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // L12 (audit 2026-07-06): cross-entity ownership — mavjud bo'lmagan/cross-tenant
    // patientId oldindan tekshiriladi (FK constraint xom 500 o'rniga toza 400,
    // visit-notes.service.ts CLI-421 pattern bilan bir xil — routes 400'ga aylantiradi).
    await ownership.assertPatientExists(c, input.patientId);
    // CLI-485: doctorId ham cross-entity ownership tekshiruvidan o'tadi (platform-level
    // user; assertUserExists shu tenantda aktiv assignment'i/owner ekanini tasdiqlaydi —
    // cross-tenant/mavjud bo'lmagan doctorId xom 500 emas, toza 400).
    await ownership.assertUserExists(c, input.doctorId);

    // UI-D5: remake — asl buyurtma shu tenantda (RLS) VA shu bemorniki bo'lishi shart.
    if (input.remakeOfId) {
      const [orig] = await db
        .select({ patientId: labOrders.patientId })
        .from(labOrders)
        .where(eq(labOrders.id, input.remakeOfId));
      if (!orig) throw new CrossEntityError('lab_order', 'not_found');
      if (orig.patientId !== input.patientId) throw new CrossEntityError('lab_order', 'mismatch');
    }

    const [row] = await db
      .insert(labOrders)
      .values({
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        labName: input.labName,
        orderType: input.orderType,
        items: input.items,
        shade: input.shade,
        dueDate: input.dueDate,
        // dueDate — haqiqat manbai; expectedDate unga mos (aniq vaqt berilsa o'sha saqlanadi).
        expectedDate: input.expectedDate
          ? new Date(input.expectedDate)
          : dueDateToExpected(input.dueDate),
        remakeOfId: input.remakeOfId ?? null,
        remakeReason: input.remakeReason ?? null,
        cost: input.cost !== undefined ? String(input.cost) : null,
        notes: input.notes ?? null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'lab_order',
        resourceId: row.id,
        after: {
          patientId: input.patientId,
          orderType: input.orderType,
          lab: input.labName,
          shade: input.shade,
          dueDate: input.dueDate,
          remakeOfId: input.remakeOfId ?? null,
          remakeReason: input.remakeReason ?? null,
        },
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdateLabOrderInput) {
    const db = getDb(c);
    // `FOR UPDATE` — Hub poll'i parallel `hubStatus`ni o'zgartirsa, tekshiruv eskirmaydi.
    const [before] = await db.select().from(labOrders).where(eq(labOrders.id, id)).for('update');
    if (!before) return null;

    // Lab Hub qoidalari (yozishdan OLDIN — rad etilsa hech narsa yozilmaydi/navbatga tushmaydi).
    // jsonb kalit tartibini saqlamaydi — kalitlar saralangan holda solishtiriladi.
    const json = (v: unknown): string =>
      JSON.stringify(v ?? null, (_k, val) =>
        val && typeof val === 'object' && !Array.isArray(val)
          ? Object.fromEntries(
              Object.entries(val as Record<string, unknown>)
                .filter(([, x]) => x !== undefined)
                .sort(([a], [b]) => a.localeCompare(b)),
            )
          : val,
      );
    const contentChanged =
      (input.items !== undefined && json(input.items) !== json(before.items)) ||
      (input.shade !== undefined && (input.shade || null) !== (before.shade ?? null)) ||
      (input.dueDate !== undefined && (input.dueDate || null) !== (before.dueDate ?? null)) ||
      (input.notes !== undefined && (input.notes ?? null) !== (before.notes ?? null)) ||
      (input.orderType !== undefined && input.orderType !== before.orderType);
    if (before.labHubCaseRef) {
      if (
        input.status === 'delivered' &&
        before.status !== 'delivered' &&
        before.hubStatus !== 'ready'
      ) {
        throw new LabHubOrderError(
          400,
          'lab_hub.not_ready',
          { hubStatus: before.hubStatus },
          "Laboratoriya ishni hali «tayyor» deb belgilamagan — «Yetkazildi» faqat tayyor ishga qo'yiladi",
        );
      }
      // Lab ishni qabul qilgan (Hub holati `sent`dan keyin) — tarkib endi lokal tahrirlanmaydi.
      if (contentChanged && before.hubStatus != null && before.hubStatus !== 'sent') {
        throw new LabHubOrderError(
          409,
          'lab_order.locked_by_lab',
          { hubStatus: before.hubStatus },
          "Laboratoriya ishni qabul qilgan — o'zgartirishni laboratoriyaga xabar orqali yuboring",
        );
      }
    }

    // CLI-439 B2: status state-machine guard — istalgan status→status o'tish avval
    // ruxsat etilardi (`delivered→draft`, `cancelled→delivered`). Endi forward-only
    // chiziqli oqim (draft→sent→in_progress→ready→delivered) + `cancelled` istalgan
    // non-terminal holatdan. Orqaga qaytish BUTUNLAY bloklanadi — shu sabab sentDate/
    // deliveredDate'ni regressда tozalash kerak emas (regress yuz bermaydi).
    if (input.status && input.status !== before.status) {
      assertLabOrderTransition(before.status as LabOrderStatus, input.status as LabOrderStatus);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.labName) patch.labName = input.labName;
    if (input.orderType) patch.orderType = input.orderType;
    if (input.status) {
      patch.status = input.status;
      // Auto-set sentDate when transitioning to "sent"
      if (input.status === 'sent' && !before.sentDate) patch.sentDate = new Date();
      if (input.status === 'delivered' && !before.deliveredDate) patch.deliveredDate = new Date();
    }
    if (input.items) patch.items = input.items;
    if (input.shade) patch.shade = input.shade;
    if (input.dueDate) {
      patch.dueDate = input.dueDate;
      // dueDate o'zgarsa expectedDate ham mos (aniq expectedDate berilsa pastda ustun turadi).
      patch.expectedDate = dueDateToExpected(input.dueDate);
    }
    if (input.sentDate !== undefined)
      patch.sentDate = input.sentDate ? new Date(input.sentDate) : null;
    if (input.expectedDate !== undefined)
      patch.expectedDate = input.expectedDate ? new Date(input.expectedDate) : null;
    if (input.deliveredDate !== undefined)
      patch.deliveredDate = input.deliveredDate ? new Date(input.deliveredDate) : null;
    if (input.cost !== undefined) patch.cost = input.cost === null ? null : String(input.cost);
    if (input.notes !== undefined) patch.notes = input.notes;

    const [row] = await db.update(labOrders).set(patch).where(eq(labOrders.id, id)).returning();
    // Lab Hub: Hub'ga yuborilgan buyurtma — «yetkazildi» Hub'ga ham ketadi; ish hali `sent`
    // holatida bo'lsa (lab qabul qilmagan) tahrir qayta push qilinadi (idempotent PUT).
    if (row?.labHubCaseRef) {
      const ops: { op: LabOrderHubOp }[] = [];
      if (input.status === 'delivered' && before.status !== 'delivered') {
        ops.push({ op: 'delivered' });
      } else if (contentChanged && (row.hubStatus === null || row.hubStatus === 'sent')) {
        ops.push({ op: 'upsert_case' });
      }
      await enqueueLabHub(c, db, row.tenantId, id, ops);
    }
    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'lab_order',
        resourceId: id,
        before,
        after: row,
      });
    }
    return row;
  }

  // ─── Fayllar (UI-D5) ─────────────────────────────────────────────────────────

  async function listFiles(c: Context, labOrderId: string) {
    const db = getDb(c);
    const [order] = await db
      .select({ id: labOrders.id })
      .from(labOrders)
      .where(eq(labOrders.id, labOrderId));
    if (!order) return null;

    const rows = await db
      .select()
      .from(labOrderFiles)
      .where(eq(labOrderFiles.labOrderId, labOrderId))
      .orderBy(asc(labOrderFiles.createdAt));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: labOrderId,
      after: { files: rows.length },
    });
    return Promise.all(
      rows.map(async (row) => ({ row, url: await presignedGetUrl(row.objectKey) })),
    );
  }

  async function uploadFile(c: Context, labOrderId: string, input: UploadLabFileInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // Buyurtma shu tenantda bo'lishi shart (RLS) — storage yozishdan OLDIN.
    const [order] = await db
      .select({ id: labOrders.id, hubRef: labOrders.labHubCaseRef })
      .from(labOrders)
      .where(eq(labOrders.id, labOrderId));
    if (!order) return null;

    const fileId = crypto.randomUUID();
    const objectKey = labOrderFileKey({ tenantId, labOrderId, fileId, ext: input.ext });
    await uploadObject({ key: objectKey, body: input.body, contentType: input.contentType });

    let row: typeof labOrderFiles.$inferSelect | undefined;
    try {
      [row] = await db
        .insert(labOrderFiles)
        .values({
          id: fileId,
          tenantId,
          labOrderId,
          uploadedByUserId: user?.id ?? null,
          label: input.label ?? null,
          objectKey,
          originalFilename: input.originalFilename,
          contentType: input.contentType,
          sizeBytes: input.body.byteLength,
        })
        .returning();
    } catch (e) {
      await deleteObject(objectKey).catch(() => {});
      throw e;
    }
    if (!row) {
      await deleteObject(objectKey).catch(() => {});
      throw new Error('Insert failed after upload');
    }

    // Hub'ga allaqachon yuborilgan buyurtmaga keyin qo'shilgan fayl ham labga ketadi.
    if (order.hubRef) {
      await enqueueLabHub(c, db, tenantId, labOrderId, [
        { op: 'file', payload: { fileId: row.id } },
      ]);
    }

    await deps.audit.record(c, {
      action: 'uploaded',
      resourceType: 'lab_order_file',
      resourceId: row.id,
      after: {
        labOrderId,
        contentType: input.contentType,
        size: row.sizeBytes,
      },
    });
    return { row, url: await presignedGetUrl(row.objectKey) };
  }

  async function removeFile(c: Context, labOrderId: string, fileId: string) {
    const db = getDb(c);
    const [before] = await db
      .select()
      .from(labOrderFiles)
      .where(and(eq(labOrderFiles.id, fileId), eq(labOrderFiles.labOrderId, labOrderId)));
    if (!before) return null;

    await db.delete(labOrderFiles).where(eq(labOrderFiles.id, fileId));
    await deleteObject(before.objectKey).catch((err) =>
      console.error('[lab-orders] storage delete failed:', err),
    );

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'lab_order_file',
      resourceId: fileId,
      before,
    });
    return before;
  }

  return { list, get, create, update, overdue, listFiles, uploadFile, removeFile };
};

export type LabOrdersService = ReturnType<typeof createLabOrdersService>;
