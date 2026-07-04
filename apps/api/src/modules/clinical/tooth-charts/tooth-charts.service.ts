import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createToothChartsRepository } from './tooth-charts.repository.ts';
import type { CreateToothChartInput } from './tooth-charts.schema.ts';

export const createToothChartsService = (deps: { audit: AuditLogger }) => {
  const repo = createToothChartsRepository();

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
