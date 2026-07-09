import { createFiscalProvider } from '@dental/fiscal';
import { createSmsChannel } from '@dental/notifications';
import { OpenAPIHono } from '@hono/zod-openapi';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { db } from './db/client.ts';
import { createAuditLogger } from './lib/audit-logger.ts';
import { env } from './lib/env.ts';
import { requireModuleInDesktop } from './lib/license-middleware.ts';
import { METRICS_CONTENT_TYPE, renderMetrics } from './lib/metrics.ts';
import { reminderJobId, reminderQueue } from './lib/queue.ts';
import { createLocalStorageAdapter } from './lib/storage.ts';
import { errorHandler } from './middleware/error-handler.ts';
import { requestId } from './middleware/request-id.ts';
import { appointmentRoutes, createAppointmentsService } from './modules/appointments/index.ts';
import { auditRoutes } from './modules/audit/index.ts';
import { authRoutes } from './modules/auth/index.ts';
import { branchRoutes } from './modules/branches/index.ts';
import { cashierRoutes } from './modules/cashier/index.ts';
import { clinicalRoutes } from './modules/clinical/index.ts';
import { consentRoutes } from './modules/consent/index.ts';
import { expensesRoutes } from './modules/expenses/index.ts';
import { healthRoutes } from './modules/health/index.ts';
import { labOrdersRoutes } from './modules/lab-orders/index.ts';
import { createNoShowStrikesService, noShowStrikeRoutes } from './modules/no-show-strikes/index.ts';
import { createNotificationsService, notificationsRoutes } from './modules/notifications/index.ts';
import { patientImagesRoutes } from './modules/patient-images/index.ts';
import { patientRoutes } from './modules/patients/index.ts';
import { createPayrollService, payrollRoutes } from './modules/payroll/index.ts';
import { permissionRoutes } from './modules/permissions/index.ts';
import { prescriptionsRoutes } from './modules/prescriptions/index.ts';
import { queueRoutes } from './modules/queue/index.ts';
import { createRecallsService, recallRoutes } from './modules/recalls/index.ts';
import { reportsRoutes } from './modules/reports/index.ts';
import { roleRoutes } from './modules/roles/index.ts';
import { createScheduleService, scheduleRoutes } from './modules/schedule/index.ts';
import {
  createServiceCategoriesService,
  serviceCategoryRoutes,
} from './modules/service-categories/index.ts';
import { createServicesService, serviceRoutes } from './modules/services/index.ts';
import { stockRoutes } from './modules/stock/index.ts';
import { tenantSettingsRoutes } from './modules/tenant-settings/index.ts';
import { tenantRoutes } from './modules/tenants/index.ts';
import { userRoutes } from './modules/users/index.ts';
import { activateRoutes } from './routes/activate.ts';
import { resetOwnerPasswordRoutes } from './routes/reset-owner-password.ts';
import { uploadsRoutes } from './routes/uploads.ts';

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
  // CLI-443: cashier POS va treatment-plans bosqich narxini serverda hisoblash
  // uchun narrow `priceLookup` hook (`getActivePrice`) — `/api/services`
  // route'ining o'z ichki instance'idan mustaqil (ikkalasi ham stateless factory,
  // bir xil DB'ga o'qiydi — churn kamaytirish uchun alohida instance yetarli).
  const priceLookup = createServicesService({
    audit,
    categories: createServiceCategoriesService({ audit }),
  });
  // CLI-446 G3: payroll carry-forward hook — cashier.refund() finalized payroll
  // davriga tushgan refund uchun `payroll_adjustments` yozishi kerak. Bir marta
  // (early) quriladi va cashierRoutes'ga narrow `payrollAdjustment` hook sifatida
  // uzatiladi. `payrollRoutes` (pastda) o'zining ALOHIDA instance'ini quradi —
  // ikkalasi ham stateless factory, bir xil DB'ga o'qiydi, churn kamaytirish uchun
  // bitta umumiy instance shart emas (priceLookup bilan bir xil qaror, :62-69).
  const payrollAdjustmentHook = createPayrollService({ audit });

  // Global middleware
  app.use('*', requestId());

  // Security headers — early in the chain. Normally this is a JSON API
  // serving a separate SPA (no HTML/docs UI served at runtime), so the CSP
  // locks everything down. Local Desktop (WEB_DIST_DIR set) is the one
  // exception — this SAME process serves the web SPA's own HTML/JS/CSS/
  // fonts, so `default-src 'none'` would block the app from loading its own
  // assets (found 2026-07-02 in a real BrowserWindow — blank screen, CSP
  // refused index.css/index.js/favicon.svg). `'unsafe-inline'` for styles
  // only — Mantine's emotion CSS-in-JS injects <style> tags without a nonce;
  // acceptable here since this serves a single trusted bundled SPA on a
  // desktop-local port, not third-party content.
  // CORS is handled separately below; secureHeaders does not touch CORS headers.
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: env.WEB_DIST_DIR
        ? {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            // CLI-402: Vite ba'zi shriftlarni `data:font/woff2;base64,...` sifatida
            // inline qiladi — `data:` bo'lmasa BrowserWindow har sahifada shriftni
            // rad etadi (console'da 8-10 xato, fallback shriftga tushadi).
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
          }
        : {
            // No HTML is served → forbid all sub-resource loading and framing.
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
  // Vendor-mediated owner password reset (CLI-226) — auth yo'q (owner login
  // qila olmaydi), license-middleware.ts WHITELIST'i bilan bir xil yo'l.
  app.route('/api/reset-owner-password', resetOwnerPasswordRoutes());

  // Observability (CLI-238 / D7): Prometheus metrics. Public text/plain — keep
  // on the internal network / behind edge auth. Localized append-only mount.
  app.get('/metrics', async (c) => {
    const body = await renderMetrics();
    return c.text(body, 200, { 'Content-Type': METRICS_CONTENT_TYPE });
  });

  // CLI-474 (L7): no-show strike service bir marta — bemor ro'yxati bayrog'i
  // (patientRoutes) VA no_show transition hook (appointmentsService) ishlatadi.
  const noShowStrike = createNoShowStrikesService({ audit });

  // Authenticated routes (auth + RLS middleware har module ichida mount qilingan)
  app.route('/api/permissions', permissionRoutes({ db }));
  app.route('/api/tenant', tenantRoutes({ db, audit }));
  app.route('/api/tenant-settings', tenantSettingsRoutes({ db, audit }));
  app.route('/api/branches', branchRoutes({ db, audit }));
  app.route('/api/roles', roleRoutes({ db, audit }));
  app.route('/api/users', userRoutes({ db, audit }));
  app.route('/api/patients', patientRoutes({ db, audit, noShowStrike }));
  app.route('/api/no-show-strikes', noShowStrikeRoutes({ db, audit }));
  app.route('/api/services', serviceRoutes({ db, audit }));
  app.route('/api/service-categories', serviceCategoryRoutes({ db, audit }));
  app.route(
    '/api/cashier',
    cashierRoutes({ db, audit, fiscal, priceLookup, payrollAdjustment: payrollAdjustmentHook }),
  );
  app.route('/api/reports', reportsRoutes({ db, audit }));
  app.route('/api/audit', auditRoutes({ db }));
  // Epic A: doktor jadvali + time-off + availability. Service'ni bir marta
  // yaratamiz va predikatlarini appointmentRoutes'ga inject qilamiz (A6).
  const schedule = createScheduleService({ audit });
  // Epic B: recalls service bir marta — narrow hook'larini appointments (B4
  // preventive + B5 rebook) va clinical/treatment-plans (B4 stage-followup) ga
  // inject qilamiz (RFC-0009 §4 sof factory DI; to'g'ridan import emas).
  const recall = createRecallsService({ audit });
  // CLI-425: appointmentsService bir marta quriladi (reminder-queue wiring
  // bilan) va appointmentRoutes + queueRoutes ikkalasiga uzatiladi — shared
  // completion path, queue "done"→completed ham preventive-recall hook'ini
  // (B4) fire qiladi (ilgari faqat kalendar PATCH orqali yopilgan appointment
  // recall olardi).
  const appointmentsService = createAppointmentsService({
    audit,
    schedule,
    recall,
    noShowStrike,
    // A9 (CLI-438): reminder job hayot-sikli. Ilgari `remove()` keyin `add()`
    // ketma-ket chaqirilardi — BullMQ bir xil `jobId` bilan `add()`ni MAVJUD
    // (hali olib tashlanmagan) job'ni qaytarib, delay'ni YANGILAMAYDI (dedupe).
    // Agar `remove()` job ACTIVE bo'lgani uchun jim muvaffaqiyatsiz bo'lsa
    // (worker aynan shu daqiqada fire qilayotgan bo'lsa), keyingi `add()` eski
    // vaqt bilan qolib ketardi → reminder yangi (rescheduled) vaqtda ketmasdi.
    // Endi: mavjud job'ni AVVAL topib, `changeDelay()` bilan YANGILAYMIZ (job
    // yo'q qilinmaydi, shuning uchun dedupe race'i yo'q); topilmasa (allaqachon
    // fire bo'lgan/yo'q) — oddiy `add()`. `removeOnComplete`/`removeOnFail` —
    // Redis'da tugagan job'lar to'planmasin (CLI-403 bilan bog'liq o'sish).
    enqueueReminder: async (tenantId, appointmentId, delayMs) => {
      const jobId = reminderJobId(appointmentId);
      const existing = await reminderQueue.getJob(jobId);
      if (existing) {
        try {
          await existing.changeDelay(delayMs);
          return;
        } catch {
          // Job ACTIVE/completed bo'lib o'zgartirib bo'lmadi — pastda qayta
          // qo'shishga urinamiz (eski job hali tursa `add` uni qaytaradi, lekin
          // bu — worker aynan shu lahzada ishlab turgan chekka holat, kuzatuvga
          // loyiq bo'lsa-da xavfsiz: fire bo'lgan job endi qayta ishlanmaydi).
        }
      }
      await reminderQueue.add(
        'appointment-reminder',
        { tenantId, appointmentId },
        { delay: delayMs, jobId, removeOnComplete: true, removeOnFail: 100 },
      );
    },
    removeReminder: async (appointmentId) => {
      const jobId = reminderJobId(appointmentId);
      const existing = await reminderQueue.getJob(jobId);
      if (!existing) return;
      try {
        await existing.remove();
      } catch {
        // Active/locked (fire jarayonida) — worker `shouldSkipReminder` bilan
        // fire-vaqtida status'ni tekshiradi (cancelled/no_show), xavfsiz no-op.
      }
    },
  });
  app.route('/api/appointments', appointmentRoutes({ db, audit, service: appointmentsService }));
  app.route('/api/schedule', scheduleRoutes({ db, audit }));
  app.route('/api/queue', queueRoutes({ db, audit, appointmentsService }));
  app.route('/api/recalls', recallRoutes({ db, audit }));
  // M5 clinical extras
  app.route('/api/prescriptions', prescriptionsRoutes({ db, audit }));
  app.route('/api/consent', consentRoutes({ db, audit }));
  app.route('/api/lab-orders', labOrdersRoutes({ db, audit }));
  // R4 Guruh A: xarajatlar (/api/expense-categories, /api/expenses), ombor (/api/stock)
  //
  // CLI-433 — daromad modullari (expenses/stock/payroll/notifications) ilgari
  // HECH QANDAY litsenziya-gate'ga ega emas edi (starter tarif bilan ham
  // to'liq ochiq). Gate parent-darajada (`app.use(...)`, sub-app ichida emas —
  // bu 4 modulning route fayllari file-ownership doirasidan tashqarida)
  // qo'shiladi, har `app.route(...)`dan DARHOL OLDIN.
  //
  // Mount-tartib (fix-forward, CLI-358 bare-`/api` quirk'i takrorlanди):
  // `expenses` bare `/api` prefiksiga mount qilinadi (pastga qarang). Bare-`/api`
  // mount'dan KEYIN ro'yxatdan o'tkazilgan har qanday path-scoped
  // `app.use(pattern, ...)` gate matching'ini yo'qotadi (quyidagi CLI-358
  // izohidagi bilan bir xil Hono quirk — runtime probe bilan tasdiqlangan:
  // expenses'ni stock/payroll/notifications'dан OLDIN qo'ysa ularning gate'i
  // 401ga tushib qolardi, chunki gate umuman ishlamay next()ga o'tib ketardi).
  // Shuning uchun stock/payroll/notifications (path-scoped gate) AVVAL, expenses
  // (bare-`/api`) esa clinical/patient-images bilan bir qatorda — ENG OXIRIDA.
  app.use('/api/stock', requireModuleInDesktop('stock'));
  app.use('/api/stock/*', requireModuleInDesktop('stock'));
  app.route('/api/stock', stockRoutes({ db, audit, notifications }));
  app.use('/api/payroll', requireModuleInDesktop('payroll'));
  app.use('/api/payroll/*', requireModuleInDesktop('payroll'));
  app.route('/api/payroll', payrollRoutes({ db, audit }));
  app.use('/api/notifications', requireModuleInDesktop('notifications'));
  app.use('/api/notifications/*', requireModuleInDesktop('notifications'));
  app.route('/api/notifications', notificationsRoutes({ db, sms }));
  // `DENTAL_LOCAL_DESKTOP!=='true'` bo'lsa (cloud/dev/CI) `requireModuleInDesktop`
  // no-op — mavjud test suite/cloud deploy buzilmaydi. `expenses` bare `/api`
  // prefiksiga mount qilinib ikkita top-level yo'lga (expense-categories,
  // expenses) fan-out qiladi — Hono `/*` wildcard bare prefiksni (masalan
  // `GET /api/expenses`, sub-path'siz) QAMRAMAYDI, shuning uchun har biri
  // uchun aniq prefiks + `/*` ikkalasi ham ro'yxatdan o'tkaziladi. Yuqoridagi
  // izohga ko'ra — bare-`/api` mount'i bo'lgani uchun ENG OXIRIDA (clinical/
  // patient-images bilan bir qatorda) turadi, hech qanday path-scoped gate'ни
  // buzmasin deb.
  app.use('/api/expense-categories', requireModuleInDesktop('expenses'));
  app.use('/api/expense-categories/*', requireModuleInDesktop('expenses'));
  app.use('/api/expenses', requireModuleInDesktop('expenses'));
  app.use('/api/expenses/*', requireModuleInDesktop('expenses'));
  app.route('/api', expensesRoutes({ db, audit }));
  // CLI-358: clinical/patient-images are mounted at the BARE `/api` prefix
  // (they fan out to top-level paths like /api/diagnoses, /api/treatment-plans,
  // /api/patients/{id}/images — see each file's own comment) and clinical
  // internally composes several nested `.route('/', childApp)` sub-apps.
  // Empirically, registering a bare-`/api` mount with nested route
  // composition BEFORE a sibling module that mounts its own top-level
  // `app.use('*', requireModuleInDesktop(...))` gate at a distinct prefix
  // (e.g. `/api/lab-orders`) breaks that sibling's gate entirely (its
  // middleware silently stops matching — reproduced and root-caused via
  // runtime probes, not yet filed as an upstream Hono issue). Mounting
  // clinical/patient-images LAST avoids the interaction: nothing gated is
  // registered after them, and their own gates are pattern-scoped (not
  // blanket `'*'`) so they don't leak onto each other or anything before them.
  // Clinical: /api/diagnoses, /api/treatment-plans, /api/visit-notes, /api/tooth-charts
  app.route('/api', clinicalRoutes({ db, audit, recall, notifications, priceLookup }));
  app.route('/api', patientImagesRoutes({ db, audit }));

  // CLI-359: bemor rasmlari (`patient-images`) `serveUrl()` orqali generatsiya
  // qilingan `/uploads/:key` URL'lar shu route orqali serve qilinadi (local
  // filesystem storage — MinIO/S3 emas, CLI-340). Tenant-scoping tekshiruvi
  // `uploads.ts` ichida (key'dagi tenantId JWT `activeTenantId` bilan
  // solishtiriladi — bu route filesystem-based, RLS qamrovidan tashqarida).
  const uploadsStorage = createLocalStorageAdapter();
  app.route('/uploads', uploadsRoutes(uploadsStorage));

  // Local Desktop bitta-EXE arxitekturasi — Windows'da alohida nginx/Caddy
  // yo'q, api.exe o'zi `apps/web` build outputni ham serve qiladi
  // (`process-manager.ts` `spawnApi()` `WEB_DIST_DIR`ni beradi). Faqat shu env
  // o'rnatilganda faollashadi — cloud/dev deployment'da bo'sh, mavjud xulq
  // o'zgarmaydi. `/api/*`/`/uploads/*`/`/metrics` yuqorida ro'yxatdan o'tgan
  // (aniqroq) — Hono ularni bu catch-all'dan oldin moslashtiradi.
  if (env.WEB_DIST_DIR) {
    app.use('*', serveStatic({ root: env.WEB_DIST_DIR }));
    app.get('*', serveStatic({ root: env.WEB_DIST_DIR, path: 'index.html' }));
  }

  // Error handler
  app.onError(errorHandler);

  return app;
};
