import { Hono } from 'hono';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createStockService } from '../stock/stock.service.ts';
import { diagnosesRoutes } from './diagnoses/index.ts';
import { toothChartsRoutes } from './tooth-charts/index.ts';
import { treatmentPlansRoutes } from './treatment-plans/index.ts';
import { visitNotesRoutes } from './visit-notes/index.ts';

/**
 * Clinical aggregator — 4 sub-domenni bitta modul ostida birlashtiradi:
 *   /api/diagnoses (read-only, platform katalog)
 *   /api/treatment-plans (CRUD + stages)
 *   /api/visit-notes (CRUD, BOM ombor chiqimi)
 *   /api/tooth-charts (snapshot create + read)
 */
export const clinicalRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  // Ombor chiqim hook'i DI — vizit yaratilganda BOM material yechiladi (cycle yo'q).
  const stockService = createStockService({ audit: deps.audit });

  app.route('/', diagnosesRoutes({ db: deps.db }));
  app.route('/', treatmentPlansRoutes({ audit: deps.audit }));
  app.route(
    '/',
    visitNotesRoutes({ audit: deps.audit, deductStock: stockService.deductForServices }),
  );
  app.route('/', toothChartsRoutes({ audit: deps.audit }));

  return app;
};
