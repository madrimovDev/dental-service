import {
  cashierTransactions,
  medicalRecords,
  patients,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computePatientBalance } from './patients.balance.ts';
import type {
  CreatePatientInput,
  ListQuery,
  UpdateMedicalRecordInput,
  UpdatePatientInput,
} from './patients.schema.ts';

const PII_FIELDS = ['phone', 'phoneSecondary', 'passport', 'address'] as const;

/**
 * PII fieldlarni masklash — user `patient.view_pii` permission yo'q bo'lsa
 */
const maskPii = <
  T extends {
    phone?: string | null;
    phoneSecondary?: string | null;
    passport?: string | null;
    address?: string | null;
  },
>(
  patient: T,
): T => ({
  ...patient,
  phone: patient.phone ? maskString(patient.phone, 4) : null,
  phoneSecondary: patient.phoneSecondary ? maskString(patient.phoneSecondary, 4) : null,
  passport: patient.passport ? '***' : null,
  address: patient.address ? '***' : null,
});

const maskString = (s: string, keepLastN: number): string => {
  if (s.length <= keepLastN) return '*'.repeat(s.length);
  return '*'.repeat(s.length - keepLastN) + s.slice(-keepLastN);
};

const userHasPiiAccess = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('patient.view_pii');
};

/** Qarzga kiruvchi reja statuslari — draft/presented/cancelled chiqariladi. */
const DEBT_PLAN_STATUSES = ['accepted', 'in_progress', 'completed'] as const;

export const createPatientsService = (deps: { audit: AuditLogger }) => {
  async function list(c: Context, query: ListQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (!query.archived) filters.push(isNull(patients.archivedAt));
    else filters.push(isNotNull(patients.archivedAt));

    if (query.search) {
      const term = `%${query.search}%`;
      filters.push(
        or(
          ilike(patients.fullName, term),
          ilike(patients.phone, term),
          ilike(patients.passport, term),
        ),
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(patients)
        .where(where)
        .orderBy(desc(patients.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(patients).where(where),
    ]);

    // Sahifa bemorlari uchun balansni 3 ta guruhlangan aggregate bilan (N+1 yo'q, fan-out yo'q)
    const ids = rows.map((r) => r.id);
    const balanceById = new Map<string, number>();

    if (ids.length > 0) {
      const [costRows, allocRows, nonPlanRows] = await Promise.all([
        db
          .select({
            patientId: treatmentPlans.patientId,
            sum: sql<string>`COALESCE(SUM(${treatmentStages.cost}), 0)`,
          })
          .from(treatmentStages)
          .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
          .where(
            and(
              inArray(treatmentPlans.patientId, ids),
              inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
            ),
          )
          .groupBy(treatmentPlans.patientId),
        db
          .select({
            patientId: treatmentPlans.patientId,
            sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
          })
          .from(treatmentStagePayments)
          .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
          .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
          .where(
            and(
              inArray(treatmentPlans.patientId, ids),
              inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
            ),
          )
          .groupBy(treatmentPlans.patientId),
        db
          .select({
            patientId: cashierTransactions.patientId,
            sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
          })
          .from(cashierTransactions)
          .where(
            and(
              inArray(cashierTransactions.patientId, ids),
              eq(cashierTransactions.type, 'payment'),
              eq(cashierTransactions.status, 'completed'),
              isNull(cashierTransactions.treatmentPlanId),
            ),
          )
          .groupBy(cashierTransactions.patientId),
      ]);

      const costById = new Map(costRows.map((r) => [r.patientId, Number(r.sum)]));
      const allocById = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));
      const nonPlanByIdRaw = new Map(
        nonPlanRows.map((r) => [r.patientId as string, Number(r.sum)]),
      );

      for (const id of ids) {
        const { balance } = computePatientBalance({
          stageCostSum: costById.get(id) ?? 0,
          allocationSum: allocById.get(id) ?? 0,
          nonPlanRemainder: nonPlanByIdRaw.get(id) ?? 0,
        });
        balanceById.set(id, balance);
      }
    }

    const hasPii = userHasPiiAccess(c);
    const masked = hasPii ? rows : rows.map(maskPii);
    const data = masked.map((p) => ({ ...p, balance: balanceById.get(p.id) ?? 0 }));
    const total = totalRows[0]?.total ?? 0;

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Bemor umumiy balansi — computed (saqlanmaydi). RLS tenant orqali filtrlaydi. */
  async function balanceFor(c: Context, patientId: string) {
    const db = getDb(c);

    const [costRow] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStages.cost}), 0)` })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          eq(treatmentPlans.patientId, patientId),
          inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
        ),
      );

    const [allocRow] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)` })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          eq(treatmentPlans.patientId, patientId),
          inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
        ),
      );

    const [nonPlanRow] = await db
      .select({
        sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.patientId, patientId),
          eq(cashierTransactions.type, 'payment'),
          eq(cashierTransactions.status, 'completed'),
          isNull(cashierTransactions.treatmentPlanId),
        ),
      );

    return computePatientBalance({
      stageCostSum: Number(costRow?.sum ?? 0),
      allocationSum: Number(allocRow?.sum ?? 0),
      nonPlanRemainder: Number(nonPlanRow?.sum ?? 0),
    });
  }

  async function findById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(patients).where(eq(patients.id, id));
    if (!row) return null;

    const hasPii = userHasPiiAccess(c);

    // Sensitive read'ni audit log'ga yozish (faqat PII access bo'lsa)
    if (hasPii) {
      await deps.audit.record(c, {
        action: 'viewed_pii',
        resourceType: 'patient',
        resourceId: id,
      });
    }

    return hasPii ? row : maskPii(row);
  }

  async function create(c: Context, input: CreatePatientInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [patient] = await tx
        .insert(patients)
        .values({
          tenantId,
          fullName: input.fullName,
          dateOfBirth: input.dateOfBirth ?? null,
          gender: input.gender ?? null,
          phone: input.phone ?? null,
          phoneSecondary: input.phoneSecondary ?? null,
          passport: input.passport ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? [],
          source: input.source ?? null,
          insurance: input.insurance ?? null,
        })
        .returning();

      if (!patient) throw new Error('Patient insert failed');

      // Avtomatik bo'sh medical record yaratish (1-to-1)
      await tx.insert(medicalRecords).values({
        tenantId,
        patientId: patient.id,
      });

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'patient',
        resourceId: patient.id,
        after: patient,
      });

      return patient;
    });
  }

  async function update(c: Context, id: string, input: UpdatePatientInput) {
    const db = getDb(c);
    const [before] = await db.select().from(patients).where(eq(patients.id, id));
    if (!before) return null;

    const [updated] = await db
      .update(patients)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'patient',
        resourceId: id,
        before,
        after: updated,
      });
    }

    return updated;
  }

  /** Arxivlash (soft delete) */
  async function archive(c: Context, id: string) {
    const db = getDb(c);
    const [before] = await db.select().from(patients).where(eq(patients.id, id));
    if (!before) return null;

    const [updated] = await db
      .update(patients)
      .set({ archivedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'archived',
        resourceType: 'patient',
        resourceId: id,
        before,
        after: { archivedAt: updated.archivedAt },
      });
    }

    return updated;
  }

  // ===== Medical records =====

  async function getMedicalRecord(c: Context, patientId: string) {
    const db = getDb(c);
    const [record] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.patientId, patientId));

    if (record) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'medical_record',
        resourceId: record.id,
      });
    }

    return record ?? null;
  }

  async function updateMedicalRecord(
    c: Context,
    patientId: string,
    input: UpdateMedicalRecordInput,
  ) {
    const db = getDb(c);
    const user = c.get('user');

    const [before] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.patientId, patientId));
    if (!before) return null;

    const [updated] = await db
      .update(medicalRecords)
      .set({
        ...input,
        lastUpdatedBy: user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(medicalRecords.id, before.id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'medical_record',
        resourceId: updated.id,
        before,
        after: updated,
      });
    }

    return updated;
  }

  return {
    list,
    findById,
    balanceFor,
    create,
    update,
    archive,
    getMedicalRecord,
    updateMedicalRecord,
  };
};

export type PatientsService = ReturnType<typeof createPatientsService>;
export { PII_FIELDS };
