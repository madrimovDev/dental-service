# DS12 Group A — Read-Only Aggregatlar (Dizayn / Spec)

> **Sana:** 2026-06-23
> **Milestone:** DS12 (post-redesign backend) — **Guruh A: Read-only aggregatlar**
> **Kelib chiqishi:** `docs/superpowers/briefs/ds12-deferred-backend.md` — Dental OS redesign (DS1–DS11) paytida defer qilingan kategoriya-3 (data-bog'liq) elementlar.
> **Scope qarori (foydalanuvchi, 2026-06-23):** A guruhdan boshlash; «done» = backend aggregatlar **+** frontend placeholder ulash.

---

## 1. Maqsad va scope

Dental OS dizayni dashboard/analitika/recall ekranlarida joriy API'dan ko'proq aggregate funksiya nazarda tutadi. DS1–DS11 redesign paytida bu elementlar placeholder/omit qilingan edi (`StatCard.delta`/`spark` proplari mavjud, lekin to'ldirilmagan). Guruh A bu placeholder'larni **read-only aggregate** ma'lumot bilan jonlantiradi.

**6 ta aggregate (har biri mustaqil testlanadigan birlik):**

1. KPI **period-over-period + YoY delta** (▲▼%)
2. KPI **7-kunlik sparkline** seriya
3. **To'lov-usuli donut** (`byPaymentMethod`)
4. **Occupancy heatmap** (kun×soat matritsa)
5. **Recall summary** (4-KPI + dashboard rail)
6. **Activity feed** (audit-log, metadata-only)

**Scope DAN TASHQARI:** yangi schema/migration YO'Q (barchasi mavjud jadvallardan o'qiladi); yozish/mutatsiya YO'Q; B/C/D guruhlar (inventory migration, yangi ekranlar, SMS-tracking) — alohida DS12 sub-loyihalar.

---

## 2. Asosiy arxitektura prinsipi — «additive, yangi permission yuzasiz»

> Ushbu loyihada cross-domen **403 RBAC gap** 3 marta takrorlangan (CLI-153, M8/useVertical, CLI-157) va har safar faqat holistik review topgan. Guruh A buni dizayn darajasida oldini oladi.

**Qoida:** Imkon qadar yangi maydonlar **mavjud endpoint javobiga** qo'shiladi — shunda rol allaqachon ushlagan permission meros qilib olinadi. Yangi `/reports/dashboard-summary` kabi birlashtiruvchi endpoint **yaratilmaydi** (u gap'ni qayta ochadi). Yangi endpoint faqat mavjud, mos permission'i bor modulga qo'shiladi (recall → `recall.view`; audit → `audit_log.view`).

---

## 3. RBAC matritsasi (manba haqiqati)

`packages/core/src/role-templates.ts` dan tasdiqlangan:

| Permission | Tenant Admin | Branch Manager | Doctor | Doctor+Asst | Nurse | Receptionist | Accountant | Technician |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `report.view` | ✓ | ✓ | — | — | — | **—** | ✓ | — |
| `recall.view` | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| `audit_log.view` | ✓ | ✓ | — | — | — | — | — | — |

**Dashboard manbalari (tasdiqlangan):**
- `ManagerDashboard` → `useManagerKpi` → `/reports/{revenue,appointments,doctors,treatment-plans}` (`report.view`).
- `AccountantDashboard` → `useRevenueReport` (`report.view`) + `useDailySummary` (`cashier.view`).
- `ReceptionistDashboard` → `useAppointments` (`appointment.view`) + `useQueueToday` (`queue.view`) — **`report.view` YO'Q.**

### Element → endpoint → permission xaritasi

| UI elementi | Manba endpoint | Permission | Ko'radigan rol |
|---|---|---|---|
| KPI delta/YoY/sparkline (Manager) | `/reports/{revenue,appointments}` — additive | `report.view` | Branch Manager, Tenant Admin |
| KPI delta/YoY/sparkline (Accountant) | `/reports/revenue` — additive | `report.view` | Accountant |
| To'lov-usuli donut (DS8) | `/reports/revenue` → `byPaymentMethod` additive | `report.view` | Admin, Branch Manager, Accountant |
| Occupancy heatmap (DS8) | `/reports/appointments` → `occupancy` additive | `report.view` | Admin, Branch Manager, Accountant |
| Recall 4-KPI (DS7) + recall rail (DS1) | **yangi** `GET /recalls/summary` | `recall.view` | Admin, Branch Manager, Receptionist, Doctor |
| Activity feed (DS1 rail) | **yangi** `GET /audit-log/recent` | `audit_log.view` | Admin, Branch Manager |

### Receptionist qarori (tasdiqlangan)
ReceptionistDashboard `report.view` ushlamaydi va KPI'lari «bugun» sanoqlari (navbat, bugungi yozilishlar) — period-over-period/YoY ular uchun ma'noli emas. **Qaror: Receptionist KPI kartalari delta/sparkline'siz qoladi (YAGNI).** DS1 sparkline/delta gap'i asosan manager dashboard haqida. Receptionist uchun yangi permission yuzasi ochilmaydi.

### Sparkline scope (tasdiqlangan)
Sparkline faqat **revenue + appointments** uchun (revenue'da `byPeriod` allaqachon mavjud; appointments'ga `byPeriod` qo'shiladi). `treatment-plans`/`doctors` KPI sparkline'i — agar arzon qo'shilsa qo'shiladi, aks holda omit (UI bu KPI'larda sparkline'siz ham to'liq ishlaydi).

---

## 4. Backend dizayn (additive maydonlar + 2 yangi endpoint)

Barcha aggregatlar mavjud `reports` patternini kuzatadi (`reports.service.ts` + `reports.aggregations.ts`): Drizzle `GROUP BY` + `SUM`/`COUNT FILTER`, sana chegaralari **`AT TIME ZONE 'Asia/Tashkent'`** konvensiyasi bilan (delta day-edge drift'ini oldini oladi). RLS transaction-bound `getDb(c)` orqali — explicit `WHERE tenant_id` yozilmaydi.

### 4.1 Period-comparison + YoY (revenue, appointments)
`revenueReportDtoSchema` va `appointmentStatsReportDtoSchema`ga **additive** maydon:
```ts
comparison: z.object({
  previous: z.object({ total: z.number(), deltaPct: z.number() }).nullable(),
  yoy:      z.object({ total: z.number(), deltaPct: z.number() }).nullable(),
}).nullable(),
```
- `previous`: joriy `[from, to]` uzunligini hisoblab, darhol oldingi teng oraliq (`[from - len, from)`) total.
- `yoy`: o'tgan yil shu kalendar oralig'i (`from`/`to` minus 1 yil).
- Service ikkita qo'shimcha aggregate so'rov bajaradi (current query'ning total qismini qayta ishlatib).
- **Null-handling:** taqqoslash oynasida ma'lumot bo'lmasa (yangi tenant, YoY baseline yo'q) → tegishli obyekt `null`. `deltaPct` faqat `previous.total > 0` bo'lganda hisoblanadi; aks holda obyekt `null` (0%/+100% RENDER QILINMAYDI).

### 4.2 Sparkline (`byPeriod`)
- Revenue: `byPeriod` allaqachon mavjud — frontend uni sparkline sifatida ishlatadi (yangi backend ish YO'Q).
- Appointments: `appointmentStatsReportDtoSchema`ga `byPeriod: z.array(z.object({ date: z.string(), count: z.number() }))` additive — kunlik appointment soni (`GROUP BY (startTime AT TZ)::date`).

### 4.3 byPaymentMethod (revenue)
`revenueReportDtoSchema`ga additive:
```ts
byPaymentMethod: z.array(z.object({ paymentMethod: z.string(), total: z.number() })),
```
`SELECT paymentMethod, SUM(signed amount) FROM cashier_transactions WHERE status='completed' [range/branch] GROUP BY paymentMethod`. Enum: `cash`/`card`/`transfer`/`other`. Refund signed-total logikasi mavjud revenue query bilan izchil.

### 4.4 Occupancy heatmap (appointments)
`appointmentStatsReportDtoSchema`ga additive:
```ts
occupancy: z.array(z.object({ weekday: z.number(), hour: z.number(), count: z.number() })),
```
`SELECT EXTRACT(DOW FROM startTime AT TZ)::int AS weekday, EXTRACT(HOUR FROM startTime AT TZ)::int AS hour, COUNT(*) ... GROUP BY weekday, hour`. Faqat ko'rinadigan slotlar (count>0); frontend matritsa to'ldiradi.

### 4.5 `GET /recalls/summary` (yangi, `recall.view`)
`recalls` modulga yangi route + service metodi. DTO:
```ts
recallSummaryDtoSchema = z.object({
  pending: z.number(),
  contacted: z.number(),
  scheduled: z.number(),
  overdue: z.number(),       // dueDate < today AND status IN (pending, contacted)
  efficacyPct: z.number(),   // (scheduled + completed) / total, mavjud recallEfficacy() helper
})
```
Bitta so'rov, `COUNT(*) FILTER (WHERE status=...)` + overdue uchun `dueDate < current_date`. Mavjud `reports.aggregations.recallEfficacy()` qayta ishlatiladi. Branch filtri ixtiyoriy (`branchId` query param), default tenant-wide.

### 4.6 `GET /audit-log/recent` (yangi, `audit_log.view`)
`audit` modulga yangi route + service metodi (mavjud `list()` ustiga tor wrapper). DTO — **metadata-only**:
```ts
auditRecentItemDtoSchema = z.object({
  id: z.string(),
  actorName: z.string().nullable(),   // userId → join users.fullName (yoki null = tizim)
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  createdAt: z.string(),              // ISO
})
```
- **`before`/`after` JSON HECH QACHON qaytarilmaydi** (maxfiy tarkib).
- Oxirgi 15 (`ORDER BY createdAt DESC LIMIT 15`), tenant-wide (RLS scoped).

---

## 5. Frontend ulash (RFC-0010 feature-folder)

- **Sparkline/delta (Manager):** `dashboard.api.ts` `useManagerKpi` revenue/appointments javobidan `comparison`+`byPeriod` ni `StatCard.delta`/`spark` proplariga uzatadi. Mappers'da DTO→view-model.
- **Sparkline/delta (Accountant):** `AccountantDashboard` `useRevenueReport` javobini xuddi shunday uzatadi.
- **Donut (DS8):** `ReportsScreen` `Dental analitika` bo'limiga to'lov-usuli donut (`@mantine/charts` `DonutChart`).
- **Heatmap (DS8):** kun×soat matritsa komponenti (`ReportsScreen`).
- **Recall (DS7+DS1):** `RecallDashboard`ga 4-KPI `StatCard` grid (`useRecallSummary` yangi hook); DS1 `ManagerDashboard` rail'iga recall rail + activity feed kartalar (`useRecallSummary` + `useRecentActivity` yangi hooklar, `hasPermission` gating bilan — permission yo'q bo'lsa karta yashirin).
- **StatCard:** proplar (`delta`, `spark`) allaqachon mavjud — UI o'zgarishi minimal.
- **i18n:** har yangi matn `uz.json`+`ru.json` (donut label, heatmap o'qlari, recall KPI sarlavhalari, activity feed action tarjimalari).

### api-client generatsiya oqimi
Backend schema o'zgargach: `bun run generate:contract` (OpenAPI → orval) → barrel re-export → feature hooks `.then(r => r.data)`. Yangi DTO'lar `generated/model`dan import qilinadi.

---

## 6. Null va edge-case xulqi

- **YoY baseline yo'q** (yangi tenant) → `comparison.yoy = null` → ▲▼ indikator render qilinmaydi.
- **Period-over-period oldingi oyna bo'sh** → `comparison.previous = null` → indikator yo'q.
- **`deltaPct`** faqat baseline total > 0 bo'lganda; aks holda obyekt null (0%/+100% ko'rsatilmaydi).
- **Sana chegaralari** har yerda `AT TIME ZONE 'Asia/Tashkent'` — day-edge drift yo'q.
- **Permission yo'q** → frontend karta/rail `hasPermission` bilan yashiriladi (403 so'rov yuborilmaydi).

---

## 7. Testlash va acceptance mezonlari

**TDD:** har aggregate uchun service/integration test (`apps/api/tests/integration/`), `bun test --env-file=../../.env` bilan.

**Backend:**
- Period-comparison: bo'sh baseline → null; to'la baseline → to'g'ri deltaPct; day-edge TZ to'g'riligi.
- byPaymentMethod / occupancy: GROUP BY to'g'riligi, refund signed-total izchilligi.
- recalls/summary: status FILTER + overdue chegarasi; efficacy helper.
- audit-log/recent: `before`/`after` JAVOBDA YO'Qligi (maxfiylik testi); limit 15; DESC tartib.

**RBAC (kritik — `@owner` EMAS, real cheklangan permset):**
- `report.view`'siz rol (Receptionist) `/reports/*` chaqirmasligini va delta/sparkline ko'rmasligini tasdiqlash.
- `recall.view` ushlagan har rol (Receptionist, Doctor, Manager) `/recalls/summary` 200 olishini.
- `audit_log.view`'siz rol (Accountant, Doctor) `/audit-log/recent` 403 olishini va activity rail yashirinishini.
- Integration testlar mavjud `cli-153-*`/`cli-157-*` patternini kuzatadi (rol-bo'yicha permission guard).

**Frontend (rendering, endpoint-200 emas):**
- Manager / Accountant / Receptionist / Doctor real permset bilan dashboard renderini tekshirish (Playwright E2E memory bo'yicha). Owner-only smoke test YETARLI EMAS — bu loyiha doim shu failure mode'ga tushadi.

---

## 8. Birlik chegaralari (independently shippable)

Har aggregate alohida land + verify bo'lishi kerak — heatmap'dagi muammo delta'ni bloklamasligi uchun. Taklif etilgan task ajratish (writing-plans bosqichida aniqlanadi):

1. Period-comparison + YoY (revenue + appointments) + frontend delta ulash.
2. Sparkline (appointments `byPeriod`) + frontend spark ulash.
3. byPaymentMethod + frontend donut.
4. Occupancy heatmap + frontend matritsa.
5. `GET /recalls/summary` + DS7 4-KPI + DS1 recall rail.
6. `GET /audit-log/recent` + DS1 activity feed.

---

## 9. Verifikatsiya komandalari

- `bunx turbo typecheck` (16/16)
- `bunx biome check` (0)
- `bun test --env-file=../../.env` (api integration)
- `bun run check:rls` (yangi jadval YO'Q — coverage o'zgarmasligi kerak)
- `bun run generate:contract` (OpenAPI regeneratsiya, web hooks yangilanishi)
