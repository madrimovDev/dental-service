# R2-B — Yozilish (kalendar + wizard): Design Spec

- **Sana:** 2026-06-10
- **Epik:** R2 / Linear CLI-46 (Yozilish) → CLI-47 (kalendar), CLI-48 (wizard), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), clinik `app/calendar.html` · `new-appointment.html`, R2-A (`features/patients/` etalon)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-appointments` (main'dan; R2-A PR #3 allaqachon merged)

## Maqsad

R2 ning ikkinchi ekran guruhi: **Yozilish** — multi-doktor kalendar (kun + hafta) + 4-qadamli yangi-yozuv wizard. `features/patients/` etalonini (RFC-0010) `features/appointments/` ga nusxalaydi. Mavjud `appointments.page` (7-kunlik ro'yxat) ning barcha funksiyasi kalendar'ga ko'chiriladi (yo'qotilmaydi).

## Qamrov

**Ichida:** `features/appointments/` (RFC-0010 qatlamlar), custom CSS kalendar grid (kun + hafta, multi-doktor), grid-positioning mapper, 4-qadam wizard, mavjud capability migratsiya (cancel/status/filter/create), i18n uz+ru.

**Tashqarida:**
- Drag/resize slot → keyin (R5 sayqal).
- Navbat tablosi (CLI-37) → alohida R2 guruh.
- Bemor balansi → R3.
- Backend o'zgarishi YO'Q (appointments module + listAssignments yetarli).

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **To'liq day + week** multi-doktor grid + wizard | Foydalanuvchi to'liq tanladi |
| 2 | **Custom CSS grid** (kutubxona emas) | Stack lock (Mantine); teal dizayn aniq; yangi dep yo'q |
| 3 | **Capability migratsiya** — cancel/status/filter/create kalendar'ga | R2-A saboq: mavjud funksiya yo'qotilmaydi |
| 4 | **Timezone: Asia/Tashkent (UTC+5)** — barcha math bitta joyda | Backend UTC; slot pozitsiya local soatga bog'liq |

## 1. `features/appointments/` (kanonik RFC-0010)

```
apps/web/src/features/appointments/
├── index.ts
├── appointments.keys.ts        # appointmentKeys.list(range)/all
├── appointments.types.ts       # CalendarEvent, DoctorColumn, SlotPosition, WizardValues
├── appointments.mappers.ts     # REAL: grid-positioning + timezone (eng muhim, sof funksiya)
├── appointments.api.ts         # hooks — YAGONA client qatlam (list/create/cancel/update)
├── appointments.schema.ts      # wizard Zod (qadam bo'yicha)
└── components/
    ├── CalendarScreen.tsx      # day/week toggle, branch filter, sana navigatsiya, "Yangi yozuv"
    ├── CalendarGrid.tsx        # custom CSS grid (doktor ustun × vaqt qator × slot)
    ├── AppointmentSlot.tsx     # slot blok (time/patient/doctor/status + cancel)
    └── NewAppointmentWizard.tsx # 4-qadam (Mantine Stepper)
```

## 2. Kalendar — custom CSS grid (advisor #4)

- **Day view:** doktor ustunlari (branch doktorlari) × vaqt qatorlari (ish soatlari, masalan 08:00–20:00, 30 daqiqa qadam) × slot bloklar (appointment startTime/endTime pozitsiyasi).
- **Week view:** 7 kun ustunlari (kun ichida doktor ajratish yoki bitta doktor tanlovi bilan) — day grid generalizatsiyasi.
- **Toggle:** Kun / Hafta (R0 `Tabs` pill yoki segmented). Sana navigatsiya (oldingi/keyingi/bugun).
- **Data:** `api.appointments.list({ branchId, from, to })` (date-range — mavjud). `from`/`to` ko'rinish oralig'i (kun: 1 kun; hafta: 7 kun).

### grid-positioning mapper (REAL — `appointments.mappers.ts`)
Sof funksiyalar (izolyatsiyada test):
- `toSlotPosition(startТime, endTime, opts) → { top, height }` — `opts`: kun boshi soati (08:00), px/daqiqa (masalan 40px/30min). Pozitsiya = (start - dayStart) daqiqa × px/min.
- `assignLanes(events) → events with {lane, laneCount}` — overlap/concurrent appointment lane logikasi (bir doktor, bir vaqtda ustma-ust → yonma-yon lane). **Eng qiyin qism, alohida test.**
- `groupByDoctor(events, doctors) → DoctorColumn[]` — day view ustunlar.
- `groupByDay(events, days) → DayColumn[]` — week view.

## 3. Timezone — Asia/Tashkent (advisor #2)

- Backend `startTime`/`endTime` UTC ISO (`z.iso.datetime()`).
- Klinik vaqti **Asia/Tashkent (UTC+5, DST yo'q)**. Barcha **UTC→local konvertatsiya va hour→position math `appointments.mappers.ts` da bitta joyda**.
- `localHour(iso)` / `localMinutes(iso)` — `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour, minute })` yoki barqaror offset. "Hozir" chizig'i local vaqt.
- Mapper ma'lum instant'da test: `2026-06-10T05:00:00Z` → Tashkent 10:00 → kun boshidan (08:00) 2 soat → top = 160px (40px/30min). 5-soat siljish test bilan ushlanadi.

## 4. Wizard — 4 qadam (advisor #5, #6)

Mantine `Stepper` (layout) + R0 `Input`/`Select` **manual binding** (`value` + `onChange={(v)=>form.setFieldValue}` — `getInputProps` mos emas, R2-A tasdiq). clinik step 0–3:
- **0 — Bemor:** bemor tanlash (Select, searchable; `api.patients.list`).
- **1 — Doktor + Xizmat:** doktor (Select, `listAssignments`), xizmatlar (MultiSelect, `api.services.list`).
- **2 — Vaqt:** sana + slot tanlash (mavjud bo'sh slotlardan yoki DateTimePicker; startTime/endTime).
- **3 — Tasdiq:** xulosa ko'rsatish → `create`. Conflict 409 → xato xabari ("doktor band").
- Natija: muvaffaqiyat ("Yozuv yaratildi") → kalendar'ga qaytish + invalidate.

`appointments.schema.ts` — qadam bo'yicha validatsiya (yoki bitta sxema, qadamda qism-validate). Backend `createAppointmentSchema`: branchId/patientId/doctorId/assistantId?/startTime/endTime/serviceIds[]/notes.

## 5. Capability migratsiya (advisor #1 — yo'qotilmaydi)

Mavjud `appointments.page` (274q) quyidagilarni **kalendar'ga ko'chiradi**:
- **Cancel:** `api.appointments.cancel(id, reason)`, `appointment.cancel` permission, status≠cancelled/completed. Slot'da yoki slot detail'da (reason — `prompt` o'rniga Mantine modal/`Input` yaxshiroq).
- **Status:** 6 holat (scheduled/confirmed/in_progress/completed/no_show/cancelled) → slot rangi/`StatusPill`.
- **Branch filter:** kalendar yuqorisida (Select).
- **Create:** Modal form → **4-qadam wizard**.
- **patient/doctor nomi, vaqt:** slot blokida (`Mono` vaqt).
- Mavjud `appointments.page.tsx` → yupqa entry (`<CalendarScreen />`).

## 6. Doctor list (advisor #3 — gap yo'q)

`api.users.listAssignments` → branch assignments; `roleName` ≈ doctor filtri (mavjud `appointments.page` shu pattern ishlatadi). **Backend gap YO'Q.** Kalendar ustunlari shu doktorlardan.

## 7. i18n + R0 primitiv

- `appointments.*` namespace (kalendar, wizard qadamlar, status, slot) → **uz + ru**. Mavjud `appointments.*` kalitlar saqlanadi/kengaytiriladi.
- R0 primitivlar: `PageHead, Button, Tabs (kun/hafta), Select, Input, StatusPill, Avatar, Mono, Card`. Slot/grid — CSS Module (token). lucide ikonkalar.

## 8. Testlar

- `appointments.mappers.test.ts` — **grid-positioning** (`toSlotPosition` ma'lum instant, `assignLanes` overlap, timezone konvertatsiya). Eng muhim.
- `appointments.keys.test.ts` — factory.
- `NewAppointmentWizard` — qadam navigatsiya + create chaqiruvi (behavioral).
- `CalendarScreen`/`CalendarGrid` smoke (renderApp + mock hooks).

## 9. Verifikatsiya

- `turbo test --filter @dental/web` + `bun --filter @dental/web build` (exit 0) + typecheck.
- Dev fidelity: kalendar (kun/hafta, multi-doktor, slot pozitsiya to'g'ri vaqtda), wizard (4 qadam → yozuv yaratiladi, conflict xato), cancel/status/filter ishlaydi. clinik `calendar.html`/`new-appointment.html` bilan mos (inson).

## Qurilish tartibi (plan'da)
**Day view end-to-end avval** (grid + positioning + slot + cancel), keyin week view (generalizatsiya), keyin wizard. Week grid murakkabligini bosqichli.

## Ochiq mayda nuqtalar (plan'da)
- Ish soatlari oralig'i (08:00–20:00?) va slot qadam (30 min?) — konfiguratsiya yoki konstanta.
- Cancel reason UI (Mantine modal vs inline Input — `prompt` o'rniga).
- Week view'da doktor ajratish (har kun bitta doktor tanlovi yoki barcha doktorlar siqilgan).
- assistantId (optional) wizard'da — hozircha o'tkazib yuborilsin yoki ixtiyoriy qadam.
