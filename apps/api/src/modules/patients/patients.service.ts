import {
  auditLog,
  cashierTransactions,
  medicalRecords,
  patientEmergencyContacts,
  patientRelatives,
  patients,
  tenantSettings,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../lib/ownership.ts';
import type { NonPlanTransactionRow } from './patients.balance.ts';
import { computeNonPlanRemainder, computePatientBalance } from './patients.balance.ts';
import type {
  AddEmergencyContactInput,
  AddRelativeInput,
  CreatePatientInput,
  ListQuery,
  PatientRelativeView,
  UpdateMedicalRecordInput,
  UpdatePatientInput,
} from './patients.schema.ts';

const PII_FIELDS = ['phone', 'phoneSecondary', 'passport', 'address'] as const;

/**
 * CLI-474 (L4/L5) — `addRelative` domen-validatsiya xatosi (o'z-o'ziga havola yoki
 * takroriy/reciprocal juftlik). `ownership.ts`dagi `CrossEntityError`dan farqli —
 * bu ikkala tomon ham HAQIQIY bemor, lekin ular orasidagi MUNOSABAT noto'g'ri
 * (queue.service.ts `QueueValidationError` bilan bir xil naqsh — routes try/catch
 * orqali map qilinadi).
 */
export class PatientRelativeConflictError extends Error {
  constructor(readonly code: 'self_link' | 'duplicate_link') {
    super(code);
    this.name = 'PatientRelativeConflictError';
  }
}

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

export const createPatientsService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
  // CLI-474 (L7): bemor ro'yxatida no-show strike bayrog'i (grouped count).
  noShowStrike?: {
    activeCountForPatients: (c: Context, patientIds: string[]) => Promise<Map<string, number>>;
  };
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();

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
      const [costRows, allocRows, nonPlanOriginals] = await Promise.all([
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
              // Qaror #24/#25 (CLI-184/221): qarz COST predikati — skipped chiqariladi
              // VA faqat acceptance='accepted' kiradi (proposed/rejected chiqariladi).
              // DIQQAT: faqat COST SUM filtrlangan — allocation SUM (pastda) FILTRLANMAYDI,
              // shunda skip/reject-after-pay to'lovi saqlanib, manfiy (kredit) balans chiqadi.
              ne(treatmentStages.status, 'skipped'),
              eq(treatmentStages.acceptance, 'accepted'),
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
          // CLI-416: allocation SUM plan-status bo'yicha FILTRLANMAYDI (C4 invariant,
          // cashier.billing.ts:62-72) — cancelled/draft planga to'langan pul kredit
          // sifatida saqlanishi kerak, aks holda per-plan balans bilan zid bo'ladi.
          .where(inArray(treatmentPlans.patientId, ids))
          .groupBy(treatmentPlans.patientId),
        db
          .select({
            id: cashierTransactions.id,
            patientId: cashierTransactions.patientId,
            totalAmount: cashierTransactions.totalAmount,
            paidAmount: cashierTransactions.paidAmount,
          })
          .from(cashierTransactions)
          .where(
            and(
              inArray(cashierTransactions.patientId, ids),
              eq(cashierTransactions.type, 'payment'),
              eq(cashierTransactions.status, 'completed'),
              isNull(cashierTransactions.treatmentPlanId),
            ),
          ),
      ]);

      const costById = new Map(costRows.map((r) => [r.patientId, Number(r.sum)]));
      const allocById = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));

      // CLI-448: har original non-plan to'lovning refund'ini parentTransactionId
      // orqali topamiz (bitta qo'shimcha guruhlangan so'rov — N+1 emas).
      const originalIds = nonPlanOriginals.map((r) => r.id);
      const refundSumRows =
        originalIds.length > 0
          ? await db
              .select({
                parentTransactionId: cashierTransactions.parentTransactionId,
                sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
              })
              .from(cashierTransactions)
              .where(
                and(
                  eq(cashierTransactions.type, 'refund'),
                  inArray(cashierTransactions.parentTransactionId, originalIds),
                ),
              )
              .groupBy(cashierTransactions.parentTransactionId)
          : [];
      const refundedByParentId = new Map(
        refundSumRows.map((r) => [r.parentTransactionId as string, Number(r.sum)]),
      );

      const nonPlanRowsByPatientId = new Map<string, NonPlanTransactionRow[]>();
      for (const row of nonPlanOriginals) {
        const pid = row.patientId as string;
        const list = nonPlanRowsByPatientId.get(pid) ?? [];
        list.push({
          totalAmount: Number(row.totalAmount),
          paidAmount: Number(row.paidAmount),
          refundedSum: refundedByParentId.get(row.id) ?? 0,
        });
        nonPlanRowsByPatientId.set(pid, list);
      }

      for (const id of ids) {
        const { balance } = computePatientBalance({
          stageCostSum: costById.get(id) ?? 0,
          allocationSum: allocById.get(id) ?? 0,
          nonPlanRemainder: computeNonPlanRemainder(nonPlanRowsByPatientId.get(id) ?? []),
        });
        balanceById.set(id, balance);
      }
    }

    // CLI-474 (L7): no-show strike flag — tenant threshold (0=o'chiq) + grouped
    // faol count (join-anchored). Threshold 0 bo'lsa umuman hisoblamaymiz (perf).
    let strikeById = new Map<string, number>();
    let strikeThreshold = 0;
    if (deps.noShowStrike && ids.length > 0) {
      const [settingsRow] = await db
        .select({ t: tenantSettings.noShowStrikeThreshold })
        .from(tenantSettings)
        .limit(1);
      strikeThreshold = settingsRow?.t ?? 0;
      if (strikeThreshold > 0) {
        strikeById = await deps.noShowStrike.activeCountForPatients(c, ids);
      }
    }

    const hasPii = userHasPiiAccess(c);
    const masked = hasPii ? rows : rows.map(maskPii);
    const data = masked.map((p) => {
      const noShowStrikes = strikeById.get(p.id) ?? 0;
      return {
        ...p,
        balance: balanceById.get(p.id) ?? 0,
        noShowStrikes,
        flagged: strikeThreshold > 0 && noShowStrikes >= strikeThreshold,
      };
    });
    const total = totalRows[0]?.total ?? 0;

    // CLI-458: findById()dagi bilan bir xil sensitive-read audit, lekin bulk —
    // har row uchun alohida emas, bitta batch yozuv (N+1 audit yo'q).
    if (hasPii && rows.length > 0) {
      await deps.audit.record(c, {
        action: 'viewed_pii',
        resourceType: 'patient',
        resourceId: null,
        after: { count: rows.length, patientIds: rows.map((r) => r.id) },
      });
    }

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
          // Qaror #24/#25 (CLI-184/221): qarz COST predikati — skipped chiqariladi VA
          // faqat acceptance='accepted' kiradi (allocation SUM esa FILTRLANMAYDI → kredit).
          ne(treatmentStages.status, 'skipped'),
          eq(treatmentStages.acceptance, 'accepted'),
        ),
      );

    const [allocRow] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)` })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      // CLI-416: allocation SUM plan-status bo'yicha FILTRLANMAYDI (C4 invariant) —
      // cancelled/draft planga to'langan pul kredit sifatida saqlanadi.
      .where(eq(treatmentPlans.patientId, patientId));

    const nonPlanOriginals = await db
      .select({
        id: cashierTransactions.id,
        totalAmount: cashierTransactions.totalAmount,
        paidAmount: cashierTransactions.paidAmount,
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

    const originalIds = nonPlanOriginals.map((r) => r.id);
    const refundSumRows =
      originalIds.length > 0
        ? await db
            .select({
              parentTransactionId: cashierTransactions.parentTransactionId,
              sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
            })
            .from(cashierTransactions)
            .where(
              and(
                eq(cashierTransactions.type, 'refund'),
                inArray(cashierTransactions.parentTransactionId, originalIds),
              ),
            )
            .groupBy(cashierTransactions.parentTransactionId)
        : [];
    const refundedByParentId = new Map(
      refundSumRows.map((r) => [r.parentTransactionId as string, Number(r.sum)]),
    );

    const nonPlanRows: NonPlanTransactionRow[] = nonPlanOriginals.map((row) => ({
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      refundedSum: refundedByParentId.get(row.id) ?? 0,
    }));

    return computePatientBalance({
      stageCostSum: Number(costRow?.sum ?? 0),
      allocationSum: Number(allocRow?.sum ?? 0),
      nonPlanRemainder: computeNonPlanRemainder(nonPlanRows),
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
          allowEmergencyRecall: input.allowEmergencyRecall ?? false,
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

    // CLI-455: explicit patch — kalit yo'q (`undefined`) bo'lsa ustunga tegmaydi,
    // `null` bo'lsa ustunni tozalaydi. Zod schema `.nullable()` bo'lgani uchun
    // ikkalasi runtime'da farqlanadi (`in`/`!== undefined` emas, oddiy tekshiruv
    // yetarli — JSON body'dan `undefined` qiymat hech qachon kelmaydi).
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.fullName !== undefined) patch.fullName = input.fullName;
    if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth;
    if (input.gender !== undefined) patch.gender = input.gender;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.phoneSecondary !== undefined) patch.phoneSecondary = input.phoneSecondary;
    if (input.passport !== undefined) patch.passport = input.passport;
    if (input.address !== undefined) patch.address = input.address;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.source !== undefined) patch.source = input.source;
    if (input.insurance !== undefined) patch.insurance = input.insurance;
    if (input.allowEmergencyRecall !== undefined)
      patch.allowEmergencyRecall = input.allowEmergencyRecall;

    const [updated] = await db.update(patients).set(patch).where(eq(patients.id, id)).returning();

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

  /**
   * Medical record o'zgarishlar tarixi (V2-7) — audit_log'dan o'qiladi
   * (updateMedicalRecord har o'zgarishda before/after yozadi). Yangi jadval shart emas.
   * RLS audit_log'ni tenant bo'yicha filtrlaydi.
   */
  async function medicalRecordHistory(c: Context, patientId: string) {
    const db = getDb(c);
    const [record] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.patientId, patientId));
    if (!record) return [];

    // CLI-439: getMedicalRecord() bilan bir xil sensitive-read audit —
    // medical_record.view bilan gate qilingan boshqa o'qish ham yoziladi.
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'medical_record',
      resourceId: record.id,
    });

    return db
      .select({
        id: auditLog.id,
        changedAt: auditLog.createdAt,
        changedById: auditLog.userId,
        changedByName: users.fullName,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(
        and(
          eq(auditLog.resourceType, 'medical_record'),
          eq(auditLog.resourceId, record.id),
          eq(auditLog.action, 'updated'),
        ),
      )
      .orderBy(desc(auditLog.createdAt));
  }

  // ===== Patient relatives (oila) sub-resource =====

  /**
   * Bemor qarindoshlari — link row har ikki yo'nalishda topiladi
   * (`patientId = X OR relativePatientId = X`). Har row uchun "boshqa" bemor
   * va yo'nalish qaytariladi. RLS tenant orqali filtrlaydi.
   */
  async function listRelatives(c: Context, patientId: string): Promise<PatientRelativeView[]> {
    const db = getDb(c);

    const links = await db
      .select()
      .from(patientRelatives)
      .where(
        or(
          eq(patientRelatives.patientId, patientId),
          eq(patientRelatives.relativePatientId, patientId),
        ),
      )
      .orderBy(desc(patientRelatives.createdAt));

    if (links.length === 0) return [];

    // Har link uchun "boshqa" bemor id'sini yig'ib, ismlarni bitta query bilan olamiz
    const otherIds = links.map((l) =>
      l.patientId === patientId ? l.relativePatientId : l.patientId,
    );
    const nameRows = await db
      .select({ id: patients.id, fullName: patients.fullName })
      .from(patients)
      .where(inArray(patients.id, otherIds));
    const nameById = new Map(nameRows.map((r) => [r.id, r.fullName]));

    return links.map((l) => {
      const otherId = l.patientId === patientId ? l.relativePatientId : l.patientId;
      const direction: 'outgoing' | 'incoming' =
        l.patientId === patientId ? 'outgoing' : 'incoming';
      return {
        id: l.id,
        relativePatient: { id: otherId, fullName: nameById.get(otherId) ?? '' },
        relationship: l.relationship,
        direction,
      };
    });
  }

  async function addRelative(c: Context, patientId: string, input: AddRelativeInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-474 (L4): o'z-o'ziga havola — arzon input tekshiruvi, DB'ga tegmasdan
    // birinchi bo'lib rad etiladi.
    if (input.relativePatientId === patientId) {
      throw new PatientRelativeConflictError('self_link');
    }

    // CLI-421: cross-entity ownership — ikkala tomon ham shu tenant'ga tegishli
    // haqiqiy bemor ekanini tekshiramiz (avval FK constraint'ga tayanardi — xom
    // 500 o'rniga toza CrossEntityError → routes 400).
    await ownership.assertPatientExists(c, patientId);
    await ownership.assertPatientExists(c, input.relativePatientId);

    // CLI-474 (L5): unique constraint (patient_id, relative_patient_id) faqat AYNAN
    // bir xil yo'nalishni bloklaydi — reciprocal (B→A, A→B mavjud bo'lganda) alohida
    // qator sifatida yozilaverardi. Ikkala yo'nalishni ham oldindan tekshiramiz —
    // shu bilan bir vaqtda aynan bir xil yo'nalishdagi takror ham xom Postgres unique
    // violation (500) o'rniga toza PatientRelativeConflictError (409) qaytaradi.
    const [existing] = await db
      .select({ id: patientRelatives.id })
      .from(patientRelatives)
      .where(
        or(
          and(
            eq(patientRelatives.patientId, patientId),
            eq(patientRelatives.relativePatientId, input.relativePatientId),
          ),
          and(
            eq(patientRelatives.patientId, input.relativePatientId),
            eq(patientRelatives.relativePatientId, patientId),
          ),
        ),
      )
      .limit(1);
    if (existing) {
      throw new PatientRelativeConflictError('duplicate_link');
    }

    const [link] = await db
      .insert(patientRelatives)
      .values({
        tenantId,
        patientId,
        relativePatientId: input.relativePatientId,
        relationship: input.relationship,
      })
      .returning();

    if (link) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'patient_relative',
        resourceId: link.id,
        after: link,
      });
    }

    return link ?? null;
  }

  async function removeRelative(c: Context, patientId: string, relId: string) {
    const db = getDb(c);

    // Link har ikki yo'nalishdan ko'rinadi (outgoing/incoming), shuning uchun
    // o'chirish ham :id bemor link'ning istalgan tomonida bo'lsa ruxsat.
    const [deleted] = await db
      .delete(patientRelatives)
      .where(
        and(
          eq(patientRelatives.id, relId),
          or(
            eq(patientRelatives.patientId, patientId),
            eq(patientRelatives.relativePatientId, patientId),
          ),
        ),
      )
      .returning();

    if (deleted) {
      await deps.audit.record(c, {
        action: 'deleted',
        resourceType: 'patient_relative',
        resourceId: relId,
        before: deleted,
      });
    }

    return deleted ?? null;
  }

  // ===== Patient emergency contacts (erkin) sub-resource =====

  /** Bemorning erkin emergency kontaktlari (isPrimary avval, keyin yangi). */
  async function listEmergencyContacts(c: Context, patientId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(patientEmergencyContacts)
      .where(eq(patientEmergencyContacts.patientId, patientId))
      .orderBy(desc(patientEmergencyContacts.isPrimary), desc(patientEmergencyContacts.createdAt));
  }

  async function addEmergencyContact(
    c: Context,
    patientId: string,
    input: AddEmergencyContactInput,
  ) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-421: cross-entity ownership — URL patientId shu tenant'ga tegishli
    // haqiqiy bemor ekanini tekshiramiz.
    await ownership.assertPatientExists(c, patientId);

    const isPrimary = input.isPrimary ?? false;

    // CLI-463: isPrimary=true bo'lsa, shu bemorning boshqa contact'larini AVVAL
    // demote qilamiz (bitta tranzaksiya ichida) — bir nechta contact bir vaqtda
    // primary bo'lib qolmasligi uchun (listEmergencyContacts bitta-primary
    // semantikasini nazarda tutadi, `isPrimary DESC` tartib).
    const [contact] = isPrimary
      ? await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
          await tx
            .update(patientEmergencyContacts)
            .set({ isPrimary: false })
            .where(
              and(
                eq(patientEmergencyContacts.patientId, patientId),
                eq(patientEmergencyContacts.isPrimary, true),
              ),
            );
          return tx
            .insert(patientEmergencyContacts)
            .values({
              tenantId,
              patientId,
              name: input.name,
              phone: input.phone,
              relationship: input.relationship ?? null,
              isPrimary: true,
            })
            .returning();
        })
      : await db
          .insert(patientEmergencyContacts)
          .values({
            tenantId,
            patientId,
            name: input.name,
            phone: input.phone,
            relationship: input.relationship ?? null,
            isPrimary: false,
          })
          .returning();

    if (contact) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'patient_emergency_contact',
        resourceId: contact.id,
        after: contact,
      });
    }

    return contact ?? null;
  }

  async function removeEmergencyContact(c: Context, patientId: string, contactId: string) {
    const db = getDb(c);

    const [deleted] = await db
      .delete(patientEmergencyContacts)
      .where(
        and(
          eq(patientEmergencyContacts.id, contactId),
          eq(patientEmergencyContacts.patientId, patientId),
        ),
      )
      .returning();

    if (deleted) {
      await deps.audit.record(c, {
        action: 'deleted',
        resourceType: 'patient_emergency_contact',
        resourceId: contactId,
        before: deleted,
      });
    }

    return deleted ?? null;
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
    medicalRecordHistory,
    listRelatives,
    addRelative,
    removeRelative,
    listEmergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
  };
};

export type PatientsService = ReturnType<typeof createPatientsService>;
export { PII_FIELDS };
