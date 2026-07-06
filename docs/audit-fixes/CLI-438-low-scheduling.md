# CLI-438 — LOW-A: Scheduling / Queue / Recall hardening

> Guruhlangan LOW topilmalar (12 sub-item). Manba: `AUDIT-2026-07-06.md` §🟡 LOW, `scratchpad/audit-04-scheduling.md`. Har band: Muammo (file:line) → Fix yondashuvi → qabul mezoni. Yengil hujjat — har band alohida kichik PR/commit bo'lishi mumkin.

---

## A1. Doctor-detection role-nomidagi "doctor" substring'iga tayanadi

**Muammo** (`apps/api/src/modules/appointments/appointments.service.ts:273-288`): `listDoctors` doktorlarni `lower(roles.name) like '%doctor%'` bilan aniqlaydi. Tenant rolni "Shifokor"/"Ortodont" deb qayta nomlasa → doktorlar wizard/calendar'dan yo'qoladi; "Doctor's Assistant" esa bookable ko'rinadi.

**Fix yondashuvi:** rol-nomi substring o'rniga barqaror signal — rol permission (masalan `appointment.view` + klinik permission) yoki maxsus `is_clinical`/rol-template kaliti bo'yicha aniqlash. Minimal: permission-based deteksiya (nom emas).

- [ ] Rol "Shifokor" deb nomlangan doktor booking wizard/calendar'da ko'rinadi.
- [ ] "Doctor's Assistant" (klinik permission'siz) doktor sifatida ko'rinmaydi.

---

## A2. O'tmishda booking to'liq mumkin; availability o'tган slotlarни taklif qiladi

**Muammo** (`schedule.availability.ts:144-195` — "now" yo'q; `appointments.service.ts:138-152` — faqat `end<=start` tekshiradi): 15:00da wizard bugungi 09:00 chip'larini taklif qiladi; o'tmish booking'lar check-in candidate va no-show statistikasini ifloslaydi.

**Fix yondashuvi:** availability generatsiyasida `now` (Tashkent TZ) dan oldingi slotlarni chiqarib tashlash; `create()`/`update()`da `start < now` bo'lsa rad qilish (masalan `time.in_past`), ehtimol kichik grace bilan.

- [ ] Availability bugungi o'tган slotlarni qaytarmaydi.
- [ ] O'tmishga yozilish 400 (`time.in_past`) qaytaradi.

---

## A3. Patient picker ilk 100 bemorда cheklangan

**Muammo** (`NewAppointmentWizard.tsx:23`, `CalendarScreen.tsx:98` — `usePatients({pageSize:100})`, `queue.api.ts` `usePatientsAll pageSize:100`): 100+ bemorli klinikada #250-bemor UI'dan bron/check-in qilinmaydi, calendar/queue'да "—" ko'rinadi.

**Fix yondashuvi:** picker'ni server-side qidiruvли (debounced `search=` query) autocomplete'ga o'tkazish (bemor list allaqачon paginatsiyalangan + search qo'llaydi). Bemor nomini ko'rsatish uchun ID→name map'ni to'liq listга emas, tanlangan/ko'rinadigan yozilishlar bo'yicha lookup'ga tayanish.

- [ ] 100+ bemorli klinikada istalgan bemor qidiruv orqali bron/check-in qilinadi.
- [ ] Calendar/queue'да yozilgan bemor nomi "—" o'rniga to'g'ri ko'rinadi.

---

## A4. Queue "day" UTC-kuni — 05:00 local'да reset

**Muammo** (`queue.service.ts:12-13, 24-25, 43-44, 147-150`): `todayList`/`nextNumber`/`create`/`checkInCandidates` `setUTCHours(0,0,0,0)` (= 05:00 Tashkent) ishlatadi. Qolgan kodbaza `T00:00:00+05:00` anchor'iga tayanadi. 00:00–05:00 orasidagi tiketlar kechagi ketma-ketlikni davom ettiradi; check-in oynasi siljigan.

**Fix yondashuvi:** Tashkent kun chegarasi (kodbazadagi mavjud TZ helper) ishlatish; UTC hour arifmetikasini almashtirish.

- [ ] Queue kuni Tashkent yarim tunида reset bo'ladi (05:00 emas).
- [ ] 00:00–05:00 tiketlari yangi kunga tegishli.

---

## A5. Queue ticket linked appointment'ни validatsiya qilmaydi

**Muammo** (`queue.service.ts:35-78`): tiket yaratishда linked appointment mavjudligi / branch / patient-match / status tekshirilmaydi; dublikat-tiket tekshiruvi yo'q (dedupe faqat candidates query'да).

**Fix yondashuvi:** `create`da `appointmentId` berilsa — mavjudlik + o'sha tenant/branch + patient mosligi + status (masalan cancelled emas) tekshirish; ochiq tiket bo'lsa dublikatни rad qilish.

- [ ] Boshqa bemor/branch appointment'iga bog'langan tiket rad qilinadi.
- [ ] Bir appointmentга ikkinchi ochiq tiket yaratilmaydi.

---

## A6. Queue state-machine yo'q + auto no_show sweep yo'q

**Muammo** (`queue.service.ts:80-95`, `reports.service.ts:225,450`): tiket statusида holat-mashinasi yo'q (istalgan status→status); eskirgan tiketlar hech qачон hal bo'lmaydi; kun oxiri auto `no_show` sweep yo'q → `noShowRate` kam sanaydi.

**Fix yondashuvi:** queue tiket status uchun transition jadvali (Qaror #25 uslubида, InvalidTransition→400); kun oxiri sweep (job) ochiq/kutayotgan tiketlarni `no_show`ga o'tkazadi.

- [ ] Noto'g'ri status o'tishi 400 qaytaradi.
- [ ] Kun oxirida hal qilinmagan tiketlar `no_show` bo'ladi; `noShowRate` to'g'ri.

---

## A7. computeDueDate oy-oxiri overflow

**Muammo** (`recalls.service.ts:31-36`): izoh clamping da'vo qiladi, JS qilmaydi. `Jan 31 + 1 oy` → `Mar 3` (Fevral overflow). Recall due-sana noto'g'ri siljiydi.

**Fix yondashuvi:** oy qo'shishда oy-oxiri clamp (masalan kunni oldin 1ga o'rnatib oy qo'shib, so'ng min(day, daysInMonth)). Unit test oy-oxiri holatlari uchun.

- [ ] `Jan 31 + 1 oy` → `Feb 28/29` (Mar emas).
- [ ] Oddiy holatlar (o'rta oy) o'zgarmaydi.

---

## A8. Preventive-recall dedupe check-then-insert; partial unique index sourceStageId IS NULL'ни qoplamaydi

**Muammo** (`recalls.service.ts:170-188`, `recalls.repository.ts:82-94`): dedupe SELECT keyin INSERT (race); partial unique index `sourceStageId IS NULL` holatini qoplamaydi → konkurent ikki preventive recall.

**Fix yondashuvi:** `sourceStageId IS NULL` ni ham qoplaydigan unique index (masalan `COALESCE`-asosli yoki ikki qismli partial index) + insert'ni `ON CONFLICT DO NOTHING` bilan idempotent qilish.

- [ ] Konkurent ikki preventive-recall create → bitta qator.
- [ ] `sourceStageId` NULL bo'lsa ham dublikat yaratilmaydi.

---

## A9. Reminder job lifecycle — cancel/reschedule/removeOnComplete

**Muammo** (`appointments.service.ts:248-262`, `appointments.routes.ts:62-71`, `lib/reminder-worker.ts:18-20`): appointment cancel BullMQ job'ni o'chirmaydi (fire-vaqtида yumshatilgan); reschedule race (active job remove jim fail + bir xil jobId add = no-op → reminder ketmaydi); `removeOnComplete` yo'q → Redis o'sadi (CLI-403 bilan bog'liq).

**Fix yondashuvi:** cancel'да job'ni `remove()`; reschedule'да eski jobни ishonchli olib tashlab yangi jobId bilan qo'shish (yoki `updateData`/`changeDelay`); reminder queue'да `removeOnComplete`/`removeOnFail` o'rnatish.

- [ ] Bekor qilingan appointment reminder yubormaydi (job o'chadi).
- [ ] Reschedule keyin reminder yangi vaqtда bir marta yuboriladi.
- [ ] Tugagan job'lar Redis'da to'planmaydi.

---

## A10. NewAppointmentWizard `form.validate()` chaqirilmaydi

**Muammo** (`NewAppointmentWizard.tsx:89-107, 118, 227-241`): `zod4Resolver` sozlangan lekin `form.validate()` hech qачон chaqirilmaydi → `patientId` majburlanmaydi; barcha 400/409 xatolar `t('appointments.conflict')` deb ko'rsatiladi.

**Fix yondashuvi:** submit'да `form.validate()` (yoki `onSubmit(form.onSubmit(...))`) ishlatish; backend xato kodini (`conflict.doctor_busy` vs boshqa) ajratib mos i18n xabar ko'rsatish (global `MutationCache` bilan mos, CLI-165).

- [ ] `patientId`siz submit inline validatsiya xatosi beradi (server 400 emas).
- [ ] Conflict emas xatolar "conflict" deb ko'rsatilmaydi.

---

## A11. CalendarScreen browser-TZ vs Tashkent grouping

**Muammo** (`CalendarScreen.tsx:27-34, 68-96`, `CheckInDialog.tsx:24-26`): fetch range browser TZ'да hisoblanadi, grouping esa Tashkent kaliti (`localDateKey`) bo'yicha; `CheckInDialog` `toLocaleTimeString`ni `timeZone`siz ishlatadi; backend inclusive `between` chegara ikki fetch orasида ikki marta oladi.

**Fix yondashuvi:** range hisoblash + grouping + display'ni yagona Tashkent TZ'ga bog'lash (mavjud TZ helper); `between` chegarani yarim-ochiq (`[from, to)`) qilish yoki chegarada dublikatni oldini olish.

- [ ] Boshqa TZ brauzerда to'g'ri kun oynasi olinadi.
- [ ] Kun chegarasidagi appointment ikki marta ko'rinmaydi; vaqt Tashkent TZ'да ko'rsatiladi.

---

## A12. Availability cache booking'dan keyin invalidate bo'lmaydi (30s stale)

**Muammo** (`appointments.api.ts:80-86`, `schedule.api.ts`, `query-client.ts:30`): `useCreateAppointment` `appointmentKeys.all`ни invalidate qiladi lekin `scheduleKeys.availability`ni EMAS → yangi bron qilingandan keyin availability 30s (`staleTime`) eski slotni bo'sh deb ko'rsatadi.

**Fix yondashuvi:** `useCreateAppointment` (va cancel/update) `onSuccess`ига `scheduleKeys.availability` invalidatsiyasini qo'shish (CLI-420 bilan bir xil naqsh).

- [ ] Slot bron qilingach availability reload'siz uni bo'sh ko'rsatmaydi.
- [ ] Cancel/reschedule keyin availability yangilanadi.

---

## Umumiy eslatma

- A1/A2/A4/A5/A6 (backend logika) TDD bilan (`bun test`); A3/A10/A11/A12 (frontend) vitest.
- A9 BullMQ + Redis (CLI-403 bilan koordinatsiya).
- Ko'p band mustaqil — alohida kichik commit/PR sifatida yopish mumkin.
