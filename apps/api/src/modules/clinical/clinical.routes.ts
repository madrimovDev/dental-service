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
  type PriceLookup,
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
  /** CLI-443: davolash rejasi bosqich narxini serverda hisoblash uchun. */
  priceLookup?: PriceLookup;
}) => {
  const app = new OpenAPIHono();

  // requireModuleInDesktop('clinical') is applied PER-ROUTE, inside each of
  // the 5 sub-modules' own createRoute `middleware:` arrays (diagnoses,
  // treatment-plans, visit-notes, visit-note-templates, tooth-charts) — NOT
  // here as `app.use('*', ...)` or even a path-scoped `app.use(pattern, ...)`.
  //
  // clinicalRoutes is mounted at the BARE `/api` prefix in app.ts (not
  // `/api/clinical`, since it fans out to /diagnoses, /treatment-plans,
  // /visit-notes, /visit-note-templates, /tooth-charts as top-level paths).
  // A bare `app.use('*', ...)` here flattens to `/api/*` in the composed
  // router and bleeds onto every OTHER route group mounted after this one in
  // app.ts (confirmed by runtime probe: it made /api/expenses, /api/stock,
  // /api/payroll, /api/notifications — none in MODULE_MAP — incorrectly
  // 403 LICENSE_NOT_FOUND, and made /api/lab-orders 403
  // MODULE_DISABLED('clinical') even when a license had 'lab-orders' active
  // but not 'clinical').
  //
  // Path-scoped `app.use(pattern, ...)` (e.g. `app.use('/treatment-plans', gate)`)
  // avoids that specific bleed but hits a DIFFERENT, also-confirmed problem:
  // patientImagesRoutes is the other module mounted at bare `/api`
  // (`/api/patients/{id}/images`), and when clinicalRoutes and
  // patientImagesRoutes — two independently-built OpenAPIHono instances that
  // each register their own `.use(pattern, ...)` — are merged via `.route()`
  // into app.ts's parent app at the same prefix, ONE of them silently stops
  // matching its own `.use()` middleware (which side breaks depends on mount
  // order and even on how many OTHER modules are mounted elsewhere in the
  // same app — reproduced via isolated runtime probes, not a textual-overlap
  // issue: it also broke for non-overlapping patterns like `/patient-images`
  // vs `/treatment-plans`). Per-route `middleware:` arrays don't register any
  // `.use()` pattern at all, so they don't hit this — the only combination
  // proven reliable across every runtime probe. Trade-off: for clinical (and
  // patient-images) specifically, the license gate now runs AFTER
  // auth/rls — an unauthenticated request gets 401 first, not 403
  // LICENSE_NOT_FOUND, unlike the other 9 gated modules. No frontend
  // consumer differentiates 401 vs 403 today (grep found none), so this is
  // an accepted deviation, not a silent regression.
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
    priceLookup: deps.priceLookup,
  });

  // CLI-414/CLI-445: visit-note UPDATE'da `performedServices` reconciliation — stock modul
  // `reconcileForServices(c, before[], after[], visitNoteId)` orqali (multiset diff:
  // delta>0 ayirish/delta<0 qaytarish, occurrence-aware). Spec:
  // `docs/audit-fixes/CLI-414-visit-note-stock-reconciliation.md` §3/§4. CLI-445 gacha bu
  // yerda unsafe optional-cast bor edi (`reconcileForServices` doim `undefined`ga tushardi
  // — hech qachon chaqirilmasdi); endi haqiqiy funksiya to'g'ridan-to'g'ri ulanadi.
  const reconcileStock = stockService.reconcileForServices;

  app.route('/', diagnosesRoutes({ db: deps.db }));
  // B4: bosqich completed → treatment_followup recall (factory injection).
  app.route(
    '/',
    treatmentPlansRoutes({ audit: deps.audit, recall: deps.recall, priceLookup: deps.priceLookup }),
  );
  app.route(
    '/',
    visitNotesRoutes({
      audit: deps.audit,
      deductStock: stockService.deductForServices,
      completeStage: { completeStageForVisit: treatmentPlansService.completeStageForVisit },
      reconcileStock,
    }),
  );
  app.route('/', visitNoteTemplatesRoutes({ audit: deps.audit }));
  app.route('/', toothChartsRoutes({ audit: deps.audit }));

  return app;
};
