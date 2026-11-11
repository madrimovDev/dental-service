# UI-1 — Registrator (R1–R6) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro: `docs/ORCHESTRATION-GUIDE.md` (§6b vizual qabul). Steps `- [ ]`.

**Goal:** registratorning 6 ta ekrani yangi dizaynda: Bugun, Kalendar, Yangi yozilish, Navbat, Kassa, Bemorlar — UI-0 primitivlari ustida.

**Architecture:** 4 lane: **A** R6 Bemorlar → R1 Bugun; **B** R2 Kalendar → R3 Yangi yozilish; **C** R4 Navbat; **D** R5 Kassa. Har ekran: kanvas artboard → Mantine + `@dental/ui` (UI-0) + RFC-0010 feature-folder + generated api-client; backend o'zgarishi o'sha ekran bilan.

**Spec (har ekranning «Kod / Backend / Qabul» ustunlari — MAJBURIY o'qing):** `docs/superpowers/specs/2026-11-11-ui-redesign-design.md` §2.1 (UI-R1…R6), §0 (kanvasni o'qish), §1 (primitivlar), §4 (qarorlar). Kanvas: `docs/design/ui-redesign-2026-11/canvas/{Main,Calendar,Booking,Queue,Cashier,Patients}.dc.html` — `bun scripts/ui/canvas-shot.ts <Name>` bilan PNG qilib ko'ring.

## Global Constraints

- Qarorlar (spec §4 / roadmap §4): **kreslo modeli YO'Q** — Kalendar faqat «Shifokorlar» ko'rinishi (Kreslolar tugmasi qurilmaydi); navbatdan **registrator hammani, shifokor faqat o'ziga yozilgan bemorni** chaqiradi (tor endpoint, yangi permission kodi emas); to'lov: **«Karta» ichida sub-tur** `terminal | click | payme | other` (alohida `payment_method` emas), tashqi integratsiya YO'Q; Telegram bron so'rovlari (`booking_requests`) — **UI-4 (T2)** ga qoldiriladi, R1'da widget joyi bo'sh holat bilan.
- Har qatorda bitta keyingi amal; filtrlar navigatsiyadan keyin saqlanadi (URL search params); kechikish/kutish **matn bilan** («+7 daq»); diqqat paneli ≤3 + «yana N ta» (`AlertBanner`/info darajasi).
- `UndoToast` — «Kelmadi», «Bekor» kabi qaytariladigan amallar; **pul amallari doim tasdiq dialogi** (UndoToast emas).
- Matnlar `t()` uz+ru — **har lane o'z namespace'ida** (`receptionToday.*`, `calendar.*`, `booking.*`, `queueBoard.*`, `cashierPos.*`, `patientsList.*`); mavjud kalitlarni o'chirmang/o'zgartirmang (integratsiyada controller JSON'larni birlashtiradi).
- PII (PT-01…04): `patient.view_pii`siz telefon/manzil maskalanadi (backend mapper'da, frontend'da emas).
- Rol bo'yicha test real permset bilan (Receptionist, Doctor, Accountant), `@owner` emas. `StateView.forbidden` — 403'da default qiymat yo'q.
- Ro'yxat chegaralari: «100 ta» qattiq chegarasi olib tashlanadi (SC-01/02) — server pagination yoki kun oralig'i.
- Migratsiya raqami: **0049** — faqat lane D (`cashier_transactions.card_provider`).
- Vizual qabul (§6b): reviewer `screenshotsViewed` maydonini to'ldiradi; controller merge oldidan rollar bo'yicha o'zi tekshiradi.

## Review Focus

1. **Kirillcha qidiruv** «турсун» → «Tursun» va istalgan formatdagi telefon («90 123 45 67», «+998901234567», «901234567») bir bemorni topadi (A).
2. **Dublikat telefon** yangi bemor formasida ogohlantiradi: «Uni ochish / Baribir yangi (oila a'zosi)» (A).
3. **Shifokor boshqa shifokorning bemorini chaqira olmaydi** (403), registrator hammani (C).
4. **Naqd to'lovda qaytim to'g'ri, karta sub-turi saqlanadi va kunlik xulosada karta jami sub-turlar bo'yicha bo'linadi**; refund ayiriladi (D).
5. **«Kelmadi» UndoToast bilan 10 s ichida qaytarilsa yozilish holati o'zgarmaydi** (strike yozilmaydi) (B).

---

## Lane A — Bemorlar → Bugun

### A.1 UI-R6 Bemorlar (Tier T3 `sonnet`·`high`, risky — PII)
Backend: `patients.search` lotin↔kirill transliteratsiya (sof funksiya `packages/core/src/translit.ts` + test, so'rov ikkala variant bilan `ILIKE`), telefon har formatda (`normalizePhone`), ro'yxat DTO'siga belgilar (`flags: { allergy, debt, noShows, telegram }`), yangi `GET /api/patients/phone-check?phone=` (`patient.create`; `{ matches: [{id, fullName}] }`), PII mask mapper'da. Web: `PatientsListScreen.tsx`, `PatientNewScreen.tsx` kanvas bo'yicha (`PhoneInput`, `PatientFlag`, `StateView`).
Testlar: `packages/core/src/translit.test.ts`, yangi `apps/api/tests/integration/ui-r6-patients-search.test.ts` (kirill/telefon/dublikat/PII maska — Receptionist permset), web `src/features/patients`.
### A.2 UI-R1 Bugun (Tier T2 `sonnet`·`medium`)
`dashboard/components/ReceptionistDashboard.tsx` + widgetlar kanvas `Main` bo'yicha: bugungi qabullar (har qatorda bitta amal), navbat holati, diqqat paneli (jadvalsiz shifokor — P10 `workHoursConfigured`/segmentlar; lab muddati o'tgan; recall due) — mavjud endpoint'lardan; Telegram so'rovlari bloki — bo'sh holat «UI-4 da». Qidiruv A.1 endpoint'idan. Testlar: web `src/features/dashboard`.

## Lane B — Kalendar → Yangi yozilish

### B.1 UI-R2 Kalendar (Tier T3 `sonnet`·`high`)
`CalendarScreen.tsx`, `CalendarGrid.tsx`, `WaitlistCard.tsx` (mavjud bo'lsa) — faqat shifokorlar ustunlari; tanlangan yozilish paneli (status amallari mavjud `PATCH`, holat tarixi audit'dan yoki mavjud endpoint'dan); «Kelmadi»/«Bekor» → `UndoToast` (10 s, keyin PATCH — undo bo'lsa PATCH yuborilmaydi); jadvalsiz ustun holati; 100-chegara olib tashlanadi (SC-01/02 — kun/hafta oralig'i bo'yicha so'rov). Testlar: web `src/features/appointments`, API `tests/integration/cli-186-187-appointments.test.ts` (o'zgarsa).
### B.2 UI-R3 Yangi yozilish (Tier T2 `sonnet`·`medium`)
`NewAppointmentWizard.tsx` → bitta ekran (route `/appointments/new` yoki to'liq ekranli drawer): 4 qadam bir sahifada, yo'q slot yonida sabab (band / tushlik / sig'maydi / o'tgan vaqt — SC-07: availability `now` bilan), lab muddati ogohlantirishi (bemorning ochiq lab buyurtmasi muddati yozilishdan keyin bo'lsa), reja bosqichi taklifi, Telegram eslatma matni oldindan ko'rinishi, yopishqoq xulosa + «Yozish». Backend: availability javobiga slot `reason` (kerak bo'lsa). Testlar: web `src/features/appointments`, API `tests/integration/p10-default-work-hours.test.ts`.

## Lane C — Navbat

### C.1 UI-R4 Navbat (Tier T2 `sonnet`·`medium`, risky — RBAC)
`QueueBoard.tsx`, `QueueDisplayBoard.tsx`, `CheckInDialog.tsx` kanvas `Queue` bo'yicha: 3 ustun, kutish vaqti matn bilan, kelmaganlardan «Keldi», TV ekranida bemor ismi YO'Q (faqat raqam/kod). Backend: queue→appointment `{ok:false}` natijasini UI'ga qaytarish (SC-09); yangi tor `POST /api/queue/{id}/call-own` (yoki mavjud status endpoint'iga tekshiruv) — `queue.manage`siz shifokor faqat `ticket.appointment.doctorId === user.id` bo'lsa chaqiradi (403 aks holda). Testlar: yangi `apps/api/tests/integration/ui-r4-queue-call.test.ts` (Doctor permset: o'z bemori 200, begona 403; Receptionist hammasi), web `src/features/queue`.

## Lane D — Kassa

### D.1 UI-R5 Kassa (Tier T3 `sonnet`·`high`, risky — pul)
Backend: migratsiya **0049** `cashier_transactions.card_provider text NULL` (`terminal|click|payme|other`, faqat `payment_method='card'` bo'lsa; aks holda 400), create schema/DTO, kunlik xulosaga karta sub-turlari bo'yicha bo'linish; refund ayiriladi (P13 `netCashTotal` bilan bir xil). Web: `PosPanel.tsx`, `CartTable.tsx`, `DailySummaryCard.tsx`, `ReceiptModal.tsx` kanvas `Cashier` bo'yicha: narx qulflangan (MO-02), naqdda qaytim, usullar naqd/karta(+sub-tur)/o'tkazma, fiskal chek holati (NoOp → «Yuborilmagan»), chek serverdan, xulosa tarjima qilingan (FU-16: «cash · payment» o'rniga t()). Testlar: yangi `apps/api/tests/integration/ui-r5-card-provider.test.ts` (real DB: card+click saqlanadi, cash+provider 400, xulosa bo'linishi, refund), web `src/features/cashier`.

---

## Ijro
- Lane'lar: `scripts/wf-lane.sh prep ui1-a 2 --db`, `ui1-b 3`, `ui1-c 4`, `ui1-d 5` (har biri `bun install` + o'z bazasi). 4 yozuvchi parallel.
- Har vazifa: implementer → test-runner → reviewer (skrinshot majburiy, `screenshotsViewed`) → risky bo'lsa verifier.
- Integratsiya: controller lane'larni birlashtiradi, `packages/i18n/src/{uz,ru}.json` konfliktlarini JSON birlashtirish bilan hal qiladi, `generate:contract` bir marta, to'liq gate (API + web + ui), **rollar bo'yicha o'z vizual tekshiruvi**, merge.
