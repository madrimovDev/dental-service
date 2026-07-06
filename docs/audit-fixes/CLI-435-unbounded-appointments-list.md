# CLI-435 — Chegarasiz (unbounded) appointments list — self-DoS

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgarishisiz). Manba: `AUDIT-2026-07-06.md` §M22, `scratchpad/audit-04-scheduling.md`. Prioritet: MEDIUM (mavjudlik / self-DoS).

---

## 1. Muammo

`GET /appointments` list endpoint'i hech qanday majburiy chegaraga ega emas.

```ts
// apps/api/src/modules/appointments/appointments.service.ts:105-124
async function list(c: Context, query: ListAppointmentsQuery) {
  const db = getDb(c);
  const filters = [];
  if (query.branchId) filters.push(eq(appointments.branchId, query.branchId));
  if (query.doctorId) filters.push(eq(appointments.doctorId, query.doctorId));
  if (query.patientId) filters.push(eq(appointments.patientId, query.patientId));
  if (query.from && query.to) {
    filters.push(between(appointments.startTime, new Date(query.from), new Date(query.to)));
  } else if (query.from) { ... } else if (query.to) { ... }

  return db
    .select()
    .from(appointments)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(appointments.startTime));
}
```

`listAppointmentsQuery` (`appointments.schema.ts:37-44`) da barcha filtr — `branchId/doctorId/patientId/from/to` — **optional**. Hech biri berilmasa `.where(undefined)` bo'ladi, `.limit()` YO'Q → RLS faqat `tenant_id` bo'yicha filtrlaydi va klinikaning BUTUN tarixidagi barcha yozilishlar bitta javobда qaytadi.

**Ta'sir.** Katta klinikada bir so'rov o'n minglab qatorni yuklaydi (DB + API xotira + tarmoq) — self-DoS. Bu `patients` / `cashier` / `lab-orders` / `expenses` list'lariга zid, ular `pageSize` ni `.max(100)` bilan chegaralaydi (`patients.schema.ts:91-92`).

**Ikkilamchi:** `orderBy(asc(startTime))` yagona — `startTime` teng bo'lgan qatorlar uchun order beqaror (non-deterministik), pagination bo'lganda tie-break yo'q.

---

## 2. Dizayn qarori

### Bog'liq cheklov: calendar caller bare-array kutadi

Frontend `useAppointments(range)` (`apps/web/src/features/appointments/appointments.api.ts:15-24`) DOIM `from`/`to` beradi va javobni bare `Appointment[]` sifatida (`.then(r => r.data)`) o'qiydi. `CalendarScreen.tsx:87-96` `appts`ni to'g'ridan-to'g'ri massiv deb ishlatadi (`apptList = appts ?? []`). Route hozir `okJson(z.array(appointmentDtoSchema), ...)` (`appointments.routes.ts:85`) — envelope EMAS, ochiq massiv.

Shuning uchun `patients` uslubidagi `{ data, meta }` envelope'ga o'tish calendar caller'ini SINDIRADI (`r.data` massivdan `{data,meta}`ga aylanadi).

### Qaror: bare-array javob shaklini SAQLAB, majburiy chegara qo'shish

1. `listAppointmentsQuery`ga `page` (default 1) va `pageSize` (`.max(100)`, default **100**) qo'shiladi — `patients.schema.ts:91-92` naqshi bilan (`z.coerce.number().int().positive()`).
2. `list()` DOIM `.limit(pageSize).offset((page-1)*pageSize)` qo'llaydi.
3. Barqaror tartib: `.orderBy(asc(appointments.startTime), asc(appointments.id))` (tie-break `id` bilan).
4. **Javob shakli o'zgarmaydi** (bare `Appointment[]`) → calendar caller churn = 0.

`pageSize` default'i 20 emas, **100** tanlandi: calendar KUNLIK ko'rinishi (default view) bir kunlik oynani chegarasiz ko'rsatishi kerak; kunlik yozilishlar realistik ravishda 100 dan oshmaydi. `.max(100)` cap self-DoS'ni yopadi.

Alternativa (rad etilди): to'liq `{ data, meta }` envelope + calendar migratsiyasi — ortiqcha churn, va calendar hech qачон total/meta ishlatmaydi (u date-range'ga tayanadi).

### Calendar HAFTALIK ko'rinishi (>100 xavfi) — §5da hal qilinadi

Haftalik ko'rinish (7 kun × ko'p doktor) 100 qatordan oshishi mumkin. Bu holat §5 (xavflar) da ochiq ko'rsatiladi va tavsiya: calendar haftalik fetch'ni `dayKeys` bo'yicha kunlik so'rovlarga bo'lish (CalendarScreen'da `dayKeys` allaqачon hisoblanadi). Bu ushbu ticket doirasidagi backend chegarasini buzmaydi — backend har bir so'rovni to'g'ri chegaralaydi.

---

## 3. Spec + test case'lar

**Xulq spetsifikatsiyasi:**
- Argument'siz `GET /appointments` eng ko'pi 100 qator qaytaradi (chegaralangan).
- `pageSize > 100` so'ralsa 100'ga cap qilinadi (validatsiya `.max(100)`); `pageSize<=0` rad qilinadi (`.positive()`).
- `page`/`pageSize` bilan offset-based pagination ishlaydi.
- Natija tartibi barqaror: `startTime` asc, so'ng `id` asc.
- `from`/`to` date-range beruvchi caller'lar (calendar) o'sha bare-array javobини oladi (regressiya yo'q).

**Test case'lar** (`apps/api/src/modules/appointments/appointments.service.test.ts` yoki `tests/integration/`):
1. **T1 (asosiy):** N>100 yozilish seed → argument'siz `list()` → natija uzunligi = 100. — HOZIR QIZIL.
2. **T2:** `pageSize=1000` → schema parse 100'ga cap qiladi (yoki service 100 qaytaradi). — QIZIL.
3. **T3 (pagination):** 150 qator, `page=2 pageSize=100` → 50 qator, birinchi sahifadan farqli va uzluksiz (offset to'g'ri).
4. **T4 (barqaror tartib):** bir xil `startTime` li 3 qator → ketma-ket ikki so'rov bir xil tartibni qaytaradi (`id` tie-break).
5. **T5 (calendar regressiya):** `from`/`to` bilan chaqiruv bare massiv qaytaradi, envelope emas; day-window (<100) to'liq keladi.

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing testlar** — T1/T2 yozib QIZIL ekanini tasdiqlash (`bun test --env-file=../../.env` API'da).
2. **Schema** — `appointments.schema.ts:37` `listAppointmentsQuery`ga qo'shish:
   ```ts
   page: z.coerce.number().int().positive().default(1),
   pageSize: z.coerce.number().int().positive().max(100).default(100),
   ```
3. **Service** — `appointments.service.ts:119-123` `list()`:
   ```ts
   const offset = (query.page - 1) * query.pageSize;
   return db
     .select()
     .from(appointments)
     .where(filters.length > 0 ? and(...filters) : undefined)
     .orderBy(asc(appointments.startTime), asc(appointments.id))
     .limit(query.pageSize)
     .offset(offset);
   ```
4. **Yashil** — T1–T5 o'tishini tasdiqlash.
5. **OpenAPI regen** — `page`/`pageSize` query param spec'ga tushishi uchun `bun run generate:openapi` + `bun run generate:api-client` (calendar caller bare-array bo'lib qoladi — response DTO o'zgarmadi).
6. **Typecheck** — `turbo typecheck` toza (16/16).
7. **Qo'lda verify** — calendar kunlik ko'rinishi ishlaydi; argument'siz list endi chegaralangan.
8. **Commit** — `fix(api): appointments list unbounded edi — pageSize .max(100) + barqaror tartib (self-DoS)`.

---

## 5. Migratsiya / xavflar

- **DB migratsiyasi yo'q.** Faqat schema (Zod) + service query. Barcha `page`/`pageSize` default'li, mavjud client'lar (default 100) o'zgarishsiz ishlaydi.
- **Xavf: calendar HAFTALIK ko'rinishi >100 yozilish.** Katta klinikada haftalik oyna 100 qatordan oshsa jim qisqaradi (truncation). **Yumshatish (bu ticket doirasida hal qilinmasa alohida ticket):**
  - CalendarScreen haftalik fetch'ni `dayKeys` (mavjud, `CalendarScreen.tsx:68-85`) bo'yicha 7 ta kunlik so'rovga bo'lish; yoki
  - Calendar uchun `pageSize=100`ni yetarli deb qoldirish (kunlik ko'rinish default) va haftalik ko'rinishда per-day fetch.
  - Bu xavfни implementatsiya PR izohida ochiq qoldirish tavsiya etiladi.
- **Regressiya xavfi past:** response shakli (bare array) SAQLANADI → frontend `r.data` mantig'i buzilmaydi.

---

## 6. Qabul mezonlari

- [ ] Argument'siz `GET /appointments` eng ko'pi 100 qator qaytaradi (test bilan qamrangan).
- [ ] `pageSize` `.max(100)` bilan cheklangan; `page`/`pageSize` offset pagination ishlaydi.
- [ ] Tartib barqaror: `startTime` asc, `id` asc.
- [ ] Calendar (`from`/`to` beruvchi) caller bare `Appointment[]` oladi — regressiya yo'q.
- [ ] OpenAPI spec + generated client yangilangan; typecheck + API test suite toza.
- [ ] Haftalik ko'rinish >100 xavfi PR/ticket'да ochiq hujjatlangan.

---

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/appointments/appointments.schema.ts` (`listAppointmentsQuery`, ~37-44) — `page`/`pageSize`.
- `apps/api/src/modules/appointments/appointments.service.ts` (`list`, 105-124) — `limit`/`offset` + barqaror tartib.
- `apps/api/src/modules/appointments/appointments.routes.ts` (o'qish; response DTO o'zgarmaydi, query param spec'ga qo'shiladi).
- `packages/api-client/**` (generated — regen).
- `apps/web/src/features/appointments/components/CalendarScreen.tsx` (ixtiyoriy follow-up — haftalik per-day fetch; bu ticket'da SHART emas).
- Test: `apps/api/src/modules/appointments/appointments.service.test.ts` yoki `tests/integration/`.
