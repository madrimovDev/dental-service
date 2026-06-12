import type { toothCharts, toothStates } from '@dental/db-schema';
import type {
  ToothChartDto,
  ToothChartWithStatesDto,
  ToothStateEntryDto,
} from './tooth-charts.schema.ts';

type ChartRow = typeof toothCharts.$inferSelect;
type StateRow = typeof toothStates.$inferSelect;

/** DB state row → wire DTO (no createdAt — tooth_states table has none). */
export const toToothStateEntryDto = (s: StateRow): ToothStateEntryDto => ({
  id: s.id,
  toothChartId: s.toothChartId,
  toothNumber: s.toothNumber,
  surface: s.surface,
  state: s.state,
  diagnosisId: s.diagnosisId ?? null,
  notes: s.notes ?? null,
});

/** DB chart row → header DTO (list — no states). */
export const toToothChartDto = (chart: ChartRow): ToothChartDto => ({
  id: chart.id,
  tenantId: chart.tenantId,
  patientId: chart.patientId,
  visitNoteId: chart.visitNoteId ?? null,
  isPrimaryDentition: chart.isPrimaryDentition,
  notes: chart.notes ?? null,
  createdBy: chart.createdBy ?? null,
  createdAt: chart.createdAt.toISOString(),
});

/** DB chart row + states → with-states DTO (latest / create). */
export const toToothChartWithStatesDto = (
  chart: ChartRow & { states: StateRow[] },
): ToothChartWithStatesDto => ({
  ...toToothChartDto(chart),
  states: chart.states.map(toToothStateEntryDto),
});
