import type { ToothStateValue } from '@dental/db-schema';
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../../lib/ownership.ts';
import { createToothChartsRepository } from './tooth-charts.repository.ts';
import type { CreateToothChartInput } from './tooth-charts.schema.ts';

export const createToothChartsService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
}) => {
  const repo = createToothChartsRepository();
  const ownership = deps.ownership ?? createOwnershipValidator();

  const list = async (c: Context, patientId: string) => {
    const rows = await repo.list(c, patientId);
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'tooth_chart',
      resourceId: patientId,
      after: { count: rows.length },
    });
    return rows;
  };

  const getLatest = async (c: Context, patientId: string) => {
    const chart = await repo.getLatestWithStates(c, patientId);
    if (chart) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'tooth_chart',
        resourceId: chart.id,
      });
    }
    return chart;
  };

  async function create(c: Context, input: CreateToothChartInput) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    // CLI-421: cross-entity ownership — patientId/visitNoteId shu bemorga tegishlimi.
    await ownership.assertPatientExists(c, input.patientId);
    if (input.visitNoteId)
      await ownership.assertVisitNoteBelongsToPatient(c, input.visitNoteId, input.patientId);

    const chart = await repo.insertChartWithStates(
      c,
      tenantId,
      {
        tenantId,
        patientId: input.patientId,
        visitNoteId: input.visitNoteId ?? null,
        isPrimaryDentition: input.isPrimaryDentition,
        notes: input.notes ?? null,
        createdBy: user?.id ?? null,
      },
      (chartId) =>
        input.states.map((s) => ({
          toothChartId: chartId,
          toothNumber: s.toothNumber,
          surface: s.surface,
          state: s.state,
          diagnosisId: s.diagnosisId ?? null,
          notes: s.notes ?? null,
        })),
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'tooth_chart',
      resourceId: chart.id,
      after: { patientId: input.patientId, stateCount: input.states.length },
    });
    return chart;
  }

  /**
   * CLI-488 — davolash bosqichi 'completed' bo'lganda odontogramma auto-update.
   * treatment-plans service DI hook orqali chaqiradi (recall pattern; modullar
   * ajratilgan). Immutable snapshot modeliga MOS: oldingi eng so'nggi snapshot
   * holatini ko'chirib, ta'sirlangan tishlarning BARCHA oldingi holatlarini (har
   * surface) tashlab, yangi 'whole' holat bilan qoplaydi → getLatest izchil (butun
   * og'iz) qoladi va bir tishda qarama-qarshi surface-holatlar birga turmaydi.
   * Idempotentlik: updateStage bosqichni faqat HAQIQIY completed-o'tishda chaqiradi
   * (qayta PATCH erta qaytadi) → snapshot bir marta yoziladi.
   */
  async function recordStageCompletion(
    c: Context,
    args: {
      patientId: string;
      toothNumbers: number[];
      state: ToothStateValue;
      sourceStageId: string;
    },
  ) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');
    if (args.toothNumbers.length === 0) return null;

    const latest = await repo.getLatestWithStates(c, args.patientId);
    const affected = new Set(args.toothNumbers);
    const carried = (latest?.states ?? [])
      .filter((s) => !affected.has(s.toothNumber))
      .map((s) => ({
        toothNumber: s.toothNumber,
        surface: s.surface,
        state: s.state,
        diagnosisId: s.diagnosisId,
        notes: s.notes,
      }));

    const chart = await repo.insertChartWithStates(
      c,
      tenantId,
      {
        tenantId,
        patientId: args.patientId,
        visitNoteId: null,
        isPrimaryDentition: latest?.isPrimaryDentition ?? false,
        notes: `Auto: davolash bosqichi tugadi (${args.sourceStageId})`,
        createdBy: user?.id ?? null,
      },
      (chartId) => [
        ...carried.map((s) => ({ ...s, toothChartId: chartId })),
        ...args.toothNumbers.map((n) => ({
          toothChartId: chartId,
          toothNumber: n,
          surface: 'whole' as const,
          state: args.state,
          diagnosisId: null,
          notes: null,
        })),
      ],
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'tooth_chart',
      resourceId: chart.id,
      after: {
        autoStageCompletion: args.sourceStageId,
        toothNumbers: args.toothNumbers,
        state: args.state,
      },
    });
    return chart;
  }

  return { list, getLatest, create, recordStageCompletion };
};

export type ToothChartsService = ReturnType<typeof createToothChartsService>;
