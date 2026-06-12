import { toothCharts, toothStates } from '@dental/db-schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../../db/scoped.ts';

export const createToothChartsRepository = () => {
  async function list(c: Context, patientId: string) {
    const db = getDb(c);
    return db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt));
  }

  async function getLatestWithStates(c: Context, patientId: string) {
    const db = getDb(c);
    const [chart] = await db
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt))
      .limit(1);
    if (!chart) return null;
    const states = await db
      .select()
      .from(toothStates)
      .where(eq(toothStates.toothChartId, chart.id));
    return { ...chart, states };
  }

  async function insertChartWithStates(
    c: Context,
    tenantId: string,
    chartValues: typeof toothCharts.$inferInsert,
    stateValues: (chartId: string) => (typeof toothStates.$inferInsert)[],
  ) {
    const db = getDb(c);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
      const [chart] = await tx.insert(toothCharts).values(chartValues).returning();
      if (!chart) throw new Error('Chart insert failed');
      const states = stateValues(chart.id);
      if (states.length > 0) await tx.insert(toothStates).values(states);
      const fullStates = await tx
        .select()
        .from(toothStates)
        .where(eq(toothStates.toothChartId, chart.id));
      return { ...chart, states: fullStates };
    });
  }

  return { list, getLatestWithStates, insertChartWithStates };
};
