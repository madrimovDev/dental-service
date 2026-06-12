import { createSmsChannel } from '@dental/notifications';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { db } from './db/client.ts';
import { createAuditLogger } from './lib/audit-logger.ts';
import { env } from './lib/env.ts';
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
import { notificationsRoutes } from './modules/notifications/index.ts';
import { patientImagesRoutes } from './modules/patient-images/index.ts';
import { patientRoutes } from './modules/patients/index.ts';
import { payrollRoutes } from './modules/payroll/index.ts';
import { permissionRoutes } from './modules/permissions/index.ts';
import { prescriptionsRoutes } from './modules/prescriptions/index.ts';
import { queueRoutes } from './modules/queue/index.ts';
import { reportsRoutes } from './modules/reports/index.ts';
import { roleRoutes } from './modules/roles/index.ts';
import { serviceRoutes } from './modules/services/index.ts';
import { stockRoutes } from './modules/stock/index.ts';
import { tenantSettingsRoutes } from './modules/tenant-settings/index.ts';
import { tenantRoutes } from './modules/tenants/index.ts';
import { userRoutes } from './modules/users/index.ts';

export const createApp = () => {
  const app = new OpenAPIHono();
  const audit = createAuditLogger({ db });

  // Global middleware
  app.use('*', requestId());
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

  // Authenticated routes (auth + RLS middleware har module ichida mount qilingan)
  app.route('/api/permissions', permissionRoutes({ db }));
  app.route('/api/tenant', tenantRoutes({ db, audit }));
  app.route('/api/tenant-settings', tenantSettingsRoutes({ db, audit }));
  app.route('/api/branches', branchRoutes({ db, audit }));
  app.route('/api/roles', roleRoutes({ db, audit }));
  app.route('/api/users', userRoutes({ db, audit }));
  app.route('/api/patients', patientRoutes({ db, audit }));
  app.route('/api/services', serviceRoutes({ db, audit }));
  app.route('/api/cashier', cashierRoutes({ db, audit }));
  app.route('/api/reports', reportsRoutes({ db }));
  app.route('/api/audit', auditRoutes({ db }));
  app.route('/api/appointments', appointmentRoutes({ db, audit }));
  app.route('/api/queue', queueRoutes({ db, audit }));
  // Clinical: /api/diagnoses, /api/treatment-plans, /api/visit-notes, /api/tooth-charts
  app.route('/api', clinicalRoutes({ db, audit }));
  // M5 clinical extras
  app.route('/api/prescriptions', prescriptionsRoutes({ db, audit }));
  app.route('/api/consent', consentRoutes({ db, audit }));
  app.route('/api/lab-orders', labOrdersRoutes({ db, audit }));
  app.route('/api', patientImagesRoutes({ db, audit }));
  // R4 Guruh A: xarajatlar (/api/expense-categories, /api/expenses), ombor (/api/stock)
  app.route('/api', expensesRoutes({ db, audit }));
  app.route('/api/stock', stockRoutes({ db, audit }));
  app.route('/api/payroll', payrollRoutes({ db, audit }));
  app.route(
    '/api/notifications',
    notificationsRoutes({
      db,
      sms: createSmsChannel({ eskizEmail: env.ESKIZ_EMAIL, eskizPassword: env.ESKIZ_PASSWORD }),
    }),
  );

  // Error handler
  app.onError(errorHandler);

  return app;
};
