# RFC-0011: Recall / Revisit Subsystem

- **Status:** Proposed
- **Sana:** 2026-06-21
- **Bog'liq:** RFC-0008 (notifications), RFC-0009 (backend module architecture), RFC-0005 (patient balance)
- **Manba:** `DENTAL-WORKFLOW-AUDIT.md` (Recall = Critical Missing / Very High impact)

## 1. Kontekst va muammo

Stomatologiyada **davriy qayta chaqirish (recall/revisit)** — profilaktik tekshiruvlar (odatda har 6 oy), davolash davomi va operatsiyadan keyingi nazorat — bemor retention va daromadning eng barqaror manbai. Hozir loyihada bu **UMUMAN yo'q**:

- Manba kodda `recall|revisit|checkup|periodic|nextVisit` — 0 natija.
- Faqat **appointment reminder** bor (yozilgan vaqtdan 24h oldin SMS), u ham nuqsonli (reschedule/cancel handle qilinmaydi).
- Davolash tugagach yoki interval bo'yicha bemorni qaytarish — yo'q.

Bu RFC recall subsystem'ning arxitekturasini belgilaydi.

## 2. Asosiy qarorlar

### 2.1 Scheduler: kunlik cross-tenant scan (delay EMAS)
Recall'lar oylab uzoq, `dueDate` o'zgaruvchan (rebook → yopiladi), va dashboard ("bugun chaqirish kerak") baribir scan-query talab qiladi. Uzoq kechiktirilgan BullMQ job mo'rt (deploy/Redis flush'da yo'qoladi).

**Qaror:** BullMQ **repeatable** job (cron `0 6 * * *` = Asia/Tashkent 11:00) har kuni due recall'larni topadi. Manba haqiqati DB da, queue faqat trigger.

### 2.2 Cross-tenant scan + RLS (kritik)
Scan tenant context'siz ishlaydi → app connection (`DATABASE_URL`, non-superuser) `FORCE RLS` tufayli 0 row ko'radi.

**Qaror:** worker **admin connection** (`DATABASE_ADMIN_URL`, RLS bypass) bilan barcha tenant bo'yicha due recall'larni topadi, keyin **`withTenant(tenantId, …)` per-row** orqali SMS yuboradi (RLS + audit izchil). Bu `migrate.ts` pattern bilan mos.

### 2.3 SMS yo'li: `notifyInTx` reuse QILINMAYDI
Mavjud `notifyInTx` har doim `notifications` (in-app, `userId NOT NULL`) row yozadi. Recall = **bemorga** SMS (staff `userId` tabiiy emas).

**Qaror:** `deps.sms.send(phone, {text})` (Eskiz `NotificationChannel` reuse) to'g'ridan-to'g'ri chaqiriladi; natija `recall_logs`ga. Staff in-app xabari (ixtiyoriy) alohida.

### 2.4 Idempotentlik
Partial unique index `(patientId, sourceStageId) WHERE status IN ('pending','contacted')` — bir bemor + manba uchun bitta ochiq recall. Avto-create `onConflictDoNothing`.

## 3. Ma'lumotlar modeli

### `recalls`
`id, tenantId, branchId?, patientId, reason(preventive/treatment_followup/post_op_check/manual), status(pending/contacted/scheduled/completed/dismissed), dueDate(date), intervalMonths?, source(treatment_stage/appointment/manual/scheduler), sourceStageId?(soft ref), treatmentPlanId?, scheduledAppointmentId?, lastContactedAt?, contactAttempts, notes?, assignedDoctorId?, createdBy?, closedBy?, closedAt?, createdAt, updatedAt`

Indekslar: `(tenantId, dueDate, status)` dashboard, `(dueDate, status)` scan, `(patientId)`, partial unique idempotentlik.

### `recall_logs`
`id, tenantId, recallId, channel(sms/manual), outcome(sent/failed/no_phone), detail?, sentAt` — SMS delivery audit izi.

### `tenant_settings` kengaytma
`defaultRecallIntervalMonths(int=6), timezone(text='Asia/Tashkent'), recallSendHourLocal(int=10)`.

### RLS
`0013_recall_rls.sql` — `recalls` + `recall_logs` ENABLE+FORCE+tenant_isolation policy (0010 pattern). `check-rls-coverage.ts` majburlaydi.

## 4. Lifecycle

```
[trigger: stage completed / appointment completed / manual]
  → recalls.autoCreateFromStage (idempotent) → status=pending, dueDate=today+intervalMonths
[scheduler: kunlik scan]
  → due (dueDate<=today, status=pending) → SMS → status=contacted, recall_logs
[bemor qayta yozildi]
  → appointments.create → closeOpenOnRebook → status=scheduled, scheduledAppointmentId
[vizit bo'lib o'tdi] → status=completed
[kerak emas] → status=dismissed
```

## 5. Trigger nuqtalari (modullararo DI)
- `treatment-plans.service.updateStage` (stage→completed) — `treatment-plans` route factory'ga `recalls` deps.
- `appointments.service.update` (status→completed) + `appointments.service.create` (rebook-close) — `appointments` route factory'ga `recalls` deps.
- app.ts da inject (RFC-0009 §4 sof DI).

## 6. API
| Method | Path | Permission |
|---|---|---|
| GET | `/recalls` | recall.view |
| GET | `/recalls/patient/{id}` | recall.view |
| POST | `/recalls` | recall.manage |
| PATCH | `/recalls/{id}` | recall.manage |
| POST | `/recalls/{id}/contact` | recall.manage |

Yangi permission: `recall.view`, `recall.manage` (`packages/core/src/permissions.ts`).

## 7. Frontend
`apps/web/src/features/recalls/` — `RecallDashboard` ("bugun chaqirish kerak" + Chaqirildi/Yozish/Bekor) + sidebar badge; bemor kartasi `RecallTab` (`visible-tabs.ts`).

## 8. Ochiq savollar
- SMS opt-out / consent (bemor SMS rad etishi).
- Eskiz rate-limit / cost recall hajmida.
- Qayta urinish siyosati (contacted → 3 kun keyin re-scan).

## 9. Reuse
Eskiz `createSmsChannel`, `withTenant` (`db/scoped.ts`), `DATABASE_ADMIN_URL` pattern (`migrate.ts`), `AuditLogger`, `requirePermission`, RFC-0009 modul skeleti, `tenant_settings`. SMS template helper `renderRecallSms`/`renderReminderSms` (M9.3 bilan umumiy `lib/sms-templates.ts`).
