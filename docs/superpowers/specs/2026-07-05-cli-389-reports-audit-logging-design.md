# CLI-389 — Reports moduli (1C export bilan) audit_log'ga yozmaydi (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-389 (High)
> **Scope:** `apps/api/src/modules/reports/reports.routes.ts`, `reports.service.ts`, `app.ts:132`.
> **Bog'liqlik:** CLI-363/364/393 bilan konseptual bir xil naqsh (CLAUDE.md §3.10) — endi `reports` moduliga qo'llanadi. Alohida, mustaqil Linear ticket.

---

## 1. Maqsad (Goal)

`reportsRoutes({ db })` (`app.ts:132`) `audit` dependency'ni umuman olmaydi, `createReportsService()` esa hech qanday dependency qabul qilmaydi (`reports.service.ts:57`). Natijada **butun modul** — jumladan `GET /api/reports/1c-export` (buxgalteriya darajasidagi xom tranzaksiya qatorlari: sana, chek raqami, to'lov usuli, summa, **bemor ismi**) — faqat `report.view` permission bilan himoyalangan, lekin kim-qachon-qaysi oraliqni ko'rgani/eksport qilgani hech qayerda yozilmaydi. Bu — moliyaviy+PII bulk-export'ning audit-siz qolishi, CLAUDE.md §3.10 ("sensitive read ham yoziladi") buzilishi.

## 2. Joriy holat — barcha endpoint'lar (`reports.routes.ts`)

| # | Route | Service metodi | Qaytaradigan shakl |
|---|---|---|---|
| 1 | `GET /revenue` | `revenue(c, range)` | Bitta aggregat obyekt (jami + byBranch/byService/byDoctor/byPeriod/byPaymentMethod + comparison) |
| 2 | `GET /appointments` | `appointmentStats(c, range)` | Bitta aggregat obyekt (byStatus/noShowRate/slotUtilization/byPeriod/comparison/occupancy) |
| 3 | `GET /doctors` | `doctorWorkload(c, range)` | `DoctorWorkloadRow[]` — har doktor uchun bitta qator (`{doctorId, total, completed}`), lekin **agregat sonlar**, xom tranzaksiya emas |
| 4 | `GET /treatment-plans` | `planCompletion(c, range)` | Bitta aggregat obyekt (`totalStages/completedStages/rate/byStatus`) |
| 5 | `GET /dental-analytics` | `dentalAnalytics(c, range)` | Bitta aggregat obyekt (procedureMix/retention/recallEfficacy/noShowByWeekday) |
| 6 | `GET /1c-export` | `oneCExport(c, range)` | `OneCExportRow[]` — **tranzaksiya-darajali xom qatorlar**, har birida `patientName` (PII) + `amount` + `receiptNumber` |

Barchasi bitta `middleware: [requirePermission('report.view')]`, `request: { query: reportRangeSchema }` (`{from, to, branchId?}`) bilan himoyalangan — permission darajasida farq yo'q, faqat data-shakli farq qiladi.

`createReportsService()` (`reports.service.ts:57`) hech qanday `deps` olmaydi — barcha 6 metod xulosa qismida `deps.audit.record(...)` chaqira olmaydi, chunki `deps` yo'q.

## 3. Yondashuv

### 3.1 Bulk/aggregat farqi va `action` tanlovi

Ticket "action:'viewed'/'exported' ... kamida 1c-export va boshqa bulk-export endpoint'lariga" deydi. Kodni o'qib chiqib, **faqat 1c-export** xom, bemor-darajasida identifikatsiya qiluvchi qator qaytaradi (`patientName` — PII, ko'p-qatorli). Qolgan 5 endpoint — hammasi **agregat/analitika** (SUM/COUNT/GROUP BY natijasi, bitta bemorni ham identifikatsiya qilmaydi). Shu bilan birga sarlavha ("reports moduli ... **umuman** audit_log'ga yozmaydi") va CLAUDE.md §3.10 ("sensitive read ham yoziladi") butun modulni nazarda tutadi — moliyaviy agregat (masalan `revenue`) ham tenant uchun sensitive. Shuning uchun: **barcha 6 endpoint audit yozadi**, lekin `action` bulk-export/agregat farqini aks ettiradi:

| Endpoint | `action` | Sabab |
|---|---|---|
| `revenue` | `'viewed'` | Agregat |
| `appointmentStats` | `'viewed'` | Agregat |
| `doctorWorkload` | `'viewed'` | Agregat (per-doktor son, xom qator emas) |
| `planCompletion` | `'viewed'` | Agregat |
| `dentalAnalytics` | `'viewed'` | Agregat |
| `oneCExport` | **`'exported'`** | Xom, bemor-darajasida ko'p-qatorli PII+moliyaviy eksport |

### 3.2 `resourceType` — bitta generik nom

Mavjud kodbazadagi katalog (`patient`, `medical_record`, `lab_order`, `cashier_transaction`, `auth`, ...) — har modul odatda bitta yoki ikkita resourceType ishlatadi. `reports` moduli 6 xil hisobot turini qaytaradi, lekin ularning barchasi bitta "narsa": *hisobot ko'rish/eksport qilish hodisasi*. Alohida-alohida resourceType (`report_revenue`, `report_1c_export`, ...) katalogni keraksiz kengaytiradi va audit-UI filtrlashni murakkablashtiradi. Shuning uchun:

```
resourceType: 'report'
```

barcha 6 metod uchun bitta qiymat — qaysi hisobot ekanligi `after.report` maydonida ажратилади (pastga qarang). Bu `auth` resourceType precedentiga mos (bitta generik resourceType, bir nechta action/kontekst).

### 3.3 `resourceId` — nima bo'ladi va nega

Bitta-yozuvli view'lar (`patients.findById`) uchun `resourceId = <uuid>` tabiiy, chunki bitta identifikatsiya qilinadigan resurs bor. Hisobot — **sana-oralig'i so'rovi**, yagona "resurs identifikatori" yo'q (xuddi `lab-orders.overdue()` yoki `payroll.listRuns()` kabi tenant-wide chaqiruv — CLI-364/393 precedenti). Shuning uchun:

```
resourceId: null
```

barcha 6 metod uchun. Identifikatsiya qiluvchi parametrlar (`from`, `to`, `branchId`) — resourceId o'rniga **`after`** maydoniga yoziladi (pastga qarang), chunki ular "qaysi resurs" emas, balki "qaysi so'rov filtri" ekanligini bildiradi.

### 3.4 `after` — faqat metadata, hech qachon natija tarkibi

Har metod audit yozuvida `after` quyidagicha to'ldiriladi (§4 global constraint bilan mos):

```ts
after: {
  report: '<report-nomi>',      // masalan 'revenue', '1c_export'
  from,
  to,
  branchId: branchId ?? null,
  rowCount: rows.length,        // FAQAT ko'p-qatorli natija qaytaradigan metodlarda (doctorWorkload, oneCExport)
}
```

- `doctorWorkload` va `oneCExport` — massiv qaytaradi → `rowCount: rows.length` (yoki natija) qo'shiladi.
- `revenue`/`appointmentStats`/`planCompletion`/`dentalAnalytics` — bitta aggregat obyekt qaytaradi, tabiiy "qator soni" yo'q → `rowCount` maydoni **qo'shilmaydi** (faqat `report`/`from`/`to`/`branchId`).
- `planCompletion` — `branchId` parametrni e'tiborga olmaydi (tenant-level by-design, Qaror #29 — reports.service.ts:319-320 izohi) → `after`da `branchId` maydoni umuman yo'q (chalg'ituvchi bo'lmasligi uchun).

**Hech qachon** natija tarkibi (`patientName`, `amount`, `total`, `byService`, va h.k.) `after`ga yozilmaydi — bu §4/CLAUDE.md §3.10 global constraint.

### 3.5 Chaqiruv joyi — service metodi ichida, har doim (topilmasa ham)

`patients.findById`dagi kabi shartli emas (u yerda "topilmasa audit yo'q" mantiqiy, chunki bitta record bor-yo'qligi masalasi). Reports metodlari har doim natija qaytaradi (bo'sh massiv/nol summa ham ma'noli — "bu oraliqda operatsiya yo'q"), shuning uchun `deps.audit.record(...)` **har chaqiruvda**, natija hisoblab bo'lgandan keyin, `return` dan oldin chaqiriladi (CLI-364 `list`/`overdue` naqshi — har doim yozadi).

## 4. Global constraint — audit faqat metadata, natija tarkibi EMAS (CLAUDE.md §3.10)

Audit yozuvi **hech qachon** hisobot natijasining o'zini saqlamaydi:
- `revenue.total`, `byBranch`/`byService`/`byDoctor`/`byPeriod`/`byPaymentMethod` massivlari, `comparison` — yozilmaydi.
- `appointmentStats`/`dentalAnalytics`/`planCompletion` ichidagi har qanday son/foiz — yozilmaydi.
- `oneCExportRow[]` ichidagi `patientName`, `amount`, `receiptNumber`, `paymentMethod` — **hech biri** yozilmaydi (aynan shu maydonlar PII+moliyaviy tarkib, ticket shu sababli High priority).
- Ruxsat etilgan `after` tarkibi: `report` (qaysi hisobot), `from`/`to`/`branchId` (so'rov query-string'ida allaqachon ko'rinadigan filtr parametrlari — sensitive emas), `rowCount` (faqat massiv qaytaradigan metodlarda).

## 5. Test strategiyasi

CLI-363/364/393 bilan bir xil: **mock/spy YO'Q**. Yangi real-DB integration test fayli `tests/integration/cli-389-reports-audit.test.ts` — real `createAuditLogger({ db })` + real `createReportsService({ audit })` + `ctx()` helper (`db`/`activeTenantId`/`user`/`accessClaims` + `req.header`) + `db.transaction` ichida `SET LOCAL app.current_tenant_id`, so'ng `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlash (CLI-364 `lab-orders`dagi naqsh). Bitta fayl — barcha 6 metodni qamrab oladi, har biri uchun kamida bitta `test()` bloki (`action`/`resourceType`/`resourceId=null`/`after.report` tekshiruvi).

**Mavjud testlar buziladi va yangilanishi shart** — `createReportsService()` signature'i `createReportsService({ audit })`ga o'zgargani sababli, quyidagi 4 fayl hozir `createReportsService()` (argumentsiz) chaqiradi va `noopAudit` bilan yangilanishi kerak (CLI-153/cashier testlaridagi naqsh: `const noopAudit = { record: async () => {} } as unknown as AuditLogger;`):
- `tests/integration/reports.test.ts:19`
- `tests/integration/cli-243-dental-analytics.test.ts:26`
- `tests/integration/ds12-a-series.test.ts:16`
- `tests/integration/ds12-a-comparison.test.ts:16`

Bu 4 fayl yangi audit chaqiruvidan keyin ham **xatti-harakat o'zgarishisiz** yashil qolishi shart (`noopAudit.record` — no-op).

## 6. Scope tashqarisida (won't-fix bu ticketda)

- `reports.aggregations.ts` (pure helper funksiyalar — `noShowRate`, `completionRate`, va h.k.) — audit'ga aloqasi yo'q, o'zgarmaydi.
- OpenAPI spec/response schema (`reports.schema.ts`) — audit chaqiruvi response shape'ga ta'sir qilmaydi, o'zgarmaydi.
- `1c-export`ning haqiqiy 1C interchange format moslashuvi (mijoz XSD) — allaqachon alohida TODO (V3 tashqi-dep, aloqasiz).

## 7. DoD

- [ ] `reportsRoutes` deps'i `{ db, audit }`ga kengaytirildi (`reports.routes.ts` signature + `app.ts:132` chaqiruv).
- [ ] `createReportsService()` → `createReportsService({ audit })`, barcha 6 metod audit yozadi (§3 jadvali).
- [ ] `oneCExport` — `action: 'exported'`; qolgan 5 metod — `action: 'viewed'`.
- [ ] Barchasida `resourceType: 'report'`, `resourceId: null`, `after: { report, from, to, branchId?, rowCount? }` (§3.4).
- [ ] Audit `after` maydonida HECH QANDAY hisobot natijasi/PII/moliyaviy summa yo'q — faqat `report`/`from`/`to`/`branchId`/`rowCount` (§4).
- [ ] Yangi real-DB integration test `tests/integration/cli-389-reports-audit.test.ts` — barcha 6 metodni qamrab oladi.
- [ ] Mavjud 4 ta test fayli (`reports.test.ts`, `cli-243-dental-analytics.test.ts`, `ds12-a-series.test.ts`, `ds12-a-comparison.test.ts`) `noopAudit` bilan yangilangan, o'zgarishsiz yashil.
- [ ] Typecheck toza.
