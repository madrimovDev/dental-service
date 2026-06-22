import { OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import type { NotificationsService } from '../notifications/notifications.service.ts';
import { createStockService } from '../stock/stock.service.ts';
import { diagnosesRoutes } from './diagnoses/index.ts';
import { toothChartsRoutes } from './tooth-charts/index.ts';
import { treatmentPlansRoutes } from './treatment-plans/index.ts';
import {
  createTreatmentPlansService,
  type RecallStageHook,
} from './treatment-plans/treatment-plans.service.ts';
import { visitNotesRoutes, visitNoteTemplatesRoutes } from './visit-notes/index.ts';

/**
 * Clinical aggregator — 4 sub-domenni bitta modul ostida birlashtiradi:
 *   /api/diagnoses (read-only, platform katalog)
 *   /api/treatment-plans (CRUD + stages)
 *   /api/visit-notes (CRUD, BOM ombor chiqimi)
 *   /api/visit-note-templates (CRUD, isShared/owner visibility)
 *   /api/tooth-charts (snapshot create + read)
 */
export const clinicalRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  recall?: RecallStageHook;
  notifications?: NotificationsService;
}) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  // Ombor chiqim hook'i DI — vizit yaratilganda BOM material yechiladi (cycle yo'q).
  // notifications — auto-deduction low-stock alert uchun (V2-2).
  const stockService = createStockService({
    audit: deps.audit,
    notifications: deps.notifications,
  });

  // C5: vizit→bosqich completed hook (factory injection, recall pattern bilan bir xil).
  // Bosqich completed → recall ham fire bo'ladi (treatment-plans.service ichida).
  const treatmentPlansService = createTreatmentPlansService({
    audit: deps.audit,
    recall: deps.recall,
  });

  app.route('/', diagnosesRoutes({ db: deps.db }));
  // B4: bosqich completed → treatment_followup recall (factory injection).
  app.route('/', treatmentPlansRoutes({ audit: deps.audit, recall: deps.recall }));
  app.route(
    '/',
    visitNotesRoutes({
      audit: deps.audit,
      deductStock: stockService.deductForServices,
      completeStage: { completeStageForVisit: treatmentPlansService.completeStageForVisit },
    }),
  );
  app.route('/', visitNoteTemplatesRoutes({ audit: deps.audit }));
  app.route('/', toothChartsRoutes({ audit: deps.audit }));

  return app;
};
