import { labOrders } from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { CreateLabOrderInput, UpdateLabOrderInput } from './lab-orders.schema.ts';

export const createLabOrdersService = (deps: { audit: AuditLogger; db: Database }) => {
  async function list(c: Context, patientId?: string, status?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(labOrders.patientId, patientId));
    if (status) filters.push(eq(labOrders.status, status as 'draft'));
    return db
      .select()
      .from(labOrders)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(labOrders.createdAt));
  }

  async function get(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id));
    return row ?? null;
  }

  async function create(c: Context, input: CreateLabOrderInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [row] = await db
      .insert(labOrders)
      .values({
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        labName: input.labName,
        orderType: input.orderType,
        items: input.items,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        cost: input.cost !== undefined ? String(input.cost) : null,
        notes: input.notes ?? null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'lab_order',
        resourceId: row.id,
        after: { patientId: input.patientId, orderType: input.orderType, lab: input.labName },
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdateLabOrderInput) {
    const db = getDb(c);
    const [before] = await db.select().from(labOrders).where(eq(labOrders.id, id));
    if (!before) return null;

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
    if (input.sentDate !== undefined)
      patch.sentDate = input.sentDate ? new Date(input.sentDate) : null;
    if (input.expectedDate !== undefined)
      patch.expectedDate = input.expectedDate ? new Date(input.expectedDate) : null;
    if (input.deliveredDate !== undefined)
      patch.deliveredDate = input.deliveredDate ? new Date(input.deliveredDate) : null;
    if (input.cost !== undefined) patch.cost = input.cost === null ? null : String(input.cost);
    if (input.notes !== undefined) patch.notes = input.notes;

    const [row] = await db.update(labOrders).set(patch).where(eq(labOrders.id, id)).returning();
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

  return { list, get, create, update };
};

export type LabOrdersService = ReturnType<typeof createLabOrdersService>;
