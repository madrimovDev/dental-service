import { createFiscalProvider } from '@dental/fiscal';
import { createSmsChannel } from '@dental/notifications';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { db } from './db/client.ts';
import { createAuditLogger } from './lib/audit-logger.ts';
import { env } from './lib/env.ts';
import { METRICS_CONTENT_TYPE, renderMetrics } from './lib/metrics.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';
import { appointmentRoutes } from './modules/appointments/index.ts';
import { auditRoutes } from './modules/audit/index.ts';
import { authRoutes } from './modules/auth/index.ts';
import { branchRoutes } from './modules/branches/index.ts';
import { cashierRoutes } from './modules/cashier/index.ts';
import { clinicalRoutes } from './modules/clinical/index.ts';
import { consentRoutes } from './modules/consent/index.ts';
import { expensesRoutes } from './modules/expenses/index.ts';
import { healthRoutes } from './modules/health/index.ts';
import { labOrdersRoutes } from './modules/lab-orders/index.ts';
import { createNotificationsService, notificationsRoutes } from './modules/notifications/index.ts';
import { patientImagesRoutes } from './modules/patient-images/index.ts';
import { patientRoutes } from './modules/patients/index.ts';
import { payrollRoutes } from './modules/payroll/index.ts';
import { permissionRoutes } from './modules/permissions/index.ts';
import { prescriptionsRoutes } from './modules/prescriptions/index.ts';
import { queueRoutes } from './modules/queue/index.ts';
import { createRecallsService, recallRoutes } from './modules/recalls/index.ts';
import { reportsRoutes } from './modules/reports/index.ts';
import { roleRoutes } from './modules/roles/index.ts';
import { createScheduleService, scheduleRoutes } from './modules/schedule/index.ts';
import { serviceCategoryRoutes } from './modules/service-categories/index.ts';
import { serviceRoutes } from './modules/services/index.ts';
import { stockRoutes } from './modules/stock/index.ts';
import { tenantSettingsRoutes } from './modules/tenant-settings/index.ts';
import { tenantRoutes } from './modules/tenants/index.ts';
import { userRoutes } from './modules/users/index.ts';
import { activateRoutes } from './routes/activate.ts';

export const createApp = () => {
  const app = new OpenAPIHono();
  const audit = createAuditLogger({ db });
  // Notifications service — bir marta yaratiladi, bir nechta modulga ulanadi
  // (notifications routes + stock low-stock alert + clinical auto-deduction alert).
  const sms = createSmsChannel({ eskizEmail: env.ESKIZ_EMAIL, eskizPassword: env.ESKIZ_PASSWORD });
  const notifications = createNotificationsService({ sms });
  // Fiskal provider (V3-1) — SOLIQ_* env bo'lsa real Soliq, aks holda NoOp.
  const fiscal = createFiscalProvider({
    soliqApiUrl: env.SOLIQ_API_URL,
    soliqApiKey: env.SOLIQ_API_KEY,
    soliqFiscalId: env.SOLIQ_FISCAL_ID,
  });

  // Global middleware
  app.use('*', requestId());

  // Security headers — early in the chain. This is a JSON API serving a separate
  // SPA (no HTML/docs UI served at runtime), so the CSP locks everything down.
  // CORS is handled separately below; secureHeaders does not touch CORS headers.
  app.use(
    '*',
    secureHeaders({
      // No HTML is served → forbid all sub-resource loading and framing.
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      // HSTS only in production (over real HTTPS) — emitting it on http://localhost
      // would poison the browser's HSTS cache for local dev.
      strictTransportSecurity:
        env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains; preload' : false,
    }),
  );

  app.use(
    '*',
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // Public routes
  app.route('/api/health', healthRoutes({ db }));
  app.route('/api/auth', authRoutes({ db }));
  // Local Desktop litsenziya faollashtirish (CLI-348 qaror 1) — auth yo'q,
  // license-middleware.ts WHITELIST'i bilan bir xil yo'l.
  app.route('/api/activate', activateRoutes());

  // Observability (CLI-238 / D7): Prometheus metrics. Public text/plain — keep
  // on the internal network / behind edge auth. Localized append-only mount.
  app.get('/metrics', async (c) => {
    const body = await renderMetrics();
    return c.text(body, 200, { 'Content-Type': METRICS_CONTENT_TYPE });
  });

  // Authenticated routes (auth + RLS middleware har module ichida mount qilingan)
  app.route('/api/permissions', permissionRoutes({ db }));
  app.route('/api/tenant', tenantRoutes({ db, audit }));
  app.route('/api/tenant-settings', tenantSettingsRoutes({ db, audit }));
  app.route('/api/branches', branchRoutes({ db, audit }));
  app.route('/api/roles', roleRoutes({ db, audit }));
  app.route('/api/users', userRoutes({ db, audit }));
  app.route('/api/patients', patientRoutes({ db, audit }));
  app.route('/api/services', serviceRoutes({ db, audit }));
  app.route('/api/service-categories', serviceCategoryRoutes({ db, audit }));
  app.route('/api/cashier', cashierRoutes({ db, audit, fiscal }));
  app.route('/api/reports', reportsRoutes({ db }));
  app.route('/api/audit', auditRoutes({ db }));
  // Epic A: doktor jadvali + time-off + availability. Service'ni bir marta
  // yaratamiz va predikatlarini appointmentRoutes'ga inject qilamiz (A6).
  const schedule = createScheduleService({ audit });
  // Epic B: recalls service bir marta — narrow hook'larini appointments (B4
  // preventive + B5 rebook) va clinical/treatment-plans (B4 stage-followup) ga
  // inject qilamiz (RFC-0009 §4 sof factory DI; to'g'ridan import emas).
  const recall = createRecallsService({ audit });
  app.route('/api/appointments', appointmentRoutes({ db, audit, schedule, recall }));
  app.route('/api/schedule', scheduleRoutes({ db, audit }));
  app.route('/api/queue', queueRoutes({ db, audit }));
  app.route('/api/recalls', recallRoutes({ db, audit }));
  // Clinical: /api/diagnoses, /api/treatment-plans, /api/visit-notes, /api/tooth-charts
  app.route('/api', clinicalRoutes({ db, audit, recall, notifications }));
  // M5 clinical extras
  app.route('/api/prescriptions', prescriptionsRoutes({ db, audit }));
  app.route('/api/consent', consentRoutes({ db, audit }));
  app.route('/api/lab-orders', labOrdersRoutes({ db, audit }));
  app.route('/api', patientImagesRoutes({ db, audit }));
  // R4 Guruh A: xarajatlar (/api/expense-categories, /api/expenses), ombor (/api/stock)
  app.route('/api', expensesRoutes({ db, audit }));
  app.route('/api/stock', stockRoutes({ db, audit, notifications }));
  app.route('/api/payroll', payrollRoutes({ db, audit }));
  app.route('/api/notifications', notificationsRoutes({ db, sms }));

  // Error handler
  app.onError(errorHandler);

  return app;
};
