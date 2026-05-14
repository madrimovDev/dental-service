import { medicalRecords, patients } from '@dental/db-schema';
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
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

    const hasPii = userHasPiiAccess(c);
    const data = hasPii ? rows : rows.map(maskPii);
    const total = totalRows[0]?.total ?? 0;

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
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
    create,
    update,
    archive,
    getMedicalRecord,
    updateMedicalRecord,
  };
};

export type PatientsService = ReturnType<typeof createPatientsService>;
export { PII_FIELDS };
