import type { toothCharts, toothStates } from '@dental/db-schema';

type ChartRow = typeof toothCharts.$inferSelect;
type StateRow = typeof toothStates.$inferSelect;

/** Javob = chart + states (api-client invariant). */
export const toToothChartDto = (chart: ChartRow & { states: StateRow[] }) => chart;
