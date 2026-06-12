import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createToothChartsRepository } from './tooth-charts.repository.ts';
import type { CreateToothChartInput } from './tooth-charts.schema.ts';

export const createToothChartsService = (deps: { audit: AuditLogger }) => {
  const repo = createToothChartsRepository();

  const list = (c: Context, patientId: string) => repo.list(c, patientId);
  const getLatest = (c: Context, patientId: string) => repo.getLatestWithStates(c, patientId);

  async function create(c: Context, input: CreateToothChartInput) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

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

  return { list, getLatest, create };
};

export type ToothChartsService = ReturnType<typeof createToothChartsService>;
