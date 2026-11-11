# UI-4 — Tashqi (T2 Telegram bot, T3 Desktop holatlari) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`. **UI-T1 (lab portali) bu rejaga KIRMAYDI** — alohida brainstorm.

**Goal:** bemor Telegram bot orqali yoziladi, eslatmaga javob beradi, anketa to'ldiradi, chek/retsept oladi; registrator so'rovlarni «Bugun» ekranida tasdiqlaydi. Desktop o'rnatish/aktivatsiya/server topish/yangilanish holatlari kanvas bo'yicha.

**Architecture:** 2 lane. **A** Telegram: A.1 API (bot flow'lari, `booking_requests`, eslatma tugmalari, anketa, chek/retsept xabarlari, bemor tili) → A.2 web (R1 «Telegram so'rovlari» bloki + tasdiqlash). **B** Desktop holatlari (installer matni, `/activate` xatolari, server topilmadi oqimi, DT-18, UpdateBanner).

**Spec:** `docs/superpowers/specs/2026-11-11-ui-redesign-design.md` §2.4 (UI-T2, UI-T3), §0/§1; roadmap §4 («Telegram bot desktop'da»: anketa va bron so'rovi **bot ichidagi suhbat**, bemor uchun ochiq web sahifa YO'Q; ikkala rejimda bir xil). Kanvas: `TelegramBot.dc.html`, `Desktop.dc.html`. P8 (kontakt egaligi) allaqachon tuzatilgan — `linkPatientByContact` ishlatiladi.

## Global Constraints

- Bot per-tenant in-process (`apps/api/src/lib/telegram-bot-manager.ts`, Qaror #38). Yangi flow'lar alohida modullarda: `apps/api/src/lib/telegram/{booking,reminder-actions,questionnaire,notify}.ts`; Telegraf handler'lari sof funksiyalarni chaqiradi (testlanadigan qilib, P8 naqshi).
- Faqat **bog'langan** (telegramChatId) bemor bilan ishlanadi; boshqa chat — «Avval raqamingizni ulashing».
- **Bron so'rovi** (migratsiya **0053** `booking_requests`: tenant_id, branch_id, patient_id, doctor_id NULL, service_id NULL, requested_start timestamptz, status `pending|confirmed|declined|expired`, created_at, decided_by, decided_at, decline_reason; RLS + `check:rls`). Bot: filial → (ixtiyoriy) shifokor → kun → bo'sh slot (mavjud availability, P10 fallback bilan) → so'rov `pending`. Registrator `POST /api/booking-requests/{id}/confirm` (`appointment.create`) → appointment yaratadi (conflict bo'lsa 409, so'rov `pending` qoladi) va bemorga tasdiq xabari; `decline` sabab bilan → bemorga xabar. 24 soatdan eski `pending` → `expired` (mavjud worker naqshi).
- **Eslatma tugmalari**: 24 soatlik eslatma xabariga inline tugmalar `Kelaman` (status `confirmed`), `Boshqa vaqt` (bron oqimini qayta boshlaydi va eski yozilish uchun registratorga so'rov), `Bekor` (status `cancelled`, sabab `patient_telegram`). Callback faqat shu yozilish egasi chat'idan qabul qilinadi; tugma ikkinchi marta bosilsa — «Allaqachon qayd etildi».
- **Anketa** (bot ichida): 5–7 savol (allergiya, surunkali kasallik, qabul qilayotgan dorilar, homiladorlik (ixtiyoriy), oldingi og'riqsizlantirishga reaksiya); javoblar `medical_records`ga **qoralama** sifatida (`questionnaire_answers` jsonb + `questionnaire_at`, migratsiya 0053 ichida) — shifokor «Anamnezni tasdiqlash» (UI-D2) bilan tasdiqlaydi; avtomatik `allergies`ga yozilmaydi.
- **Chek va retsept xabari**: to'lov yaratilganda va retsept imzolanganda (mavjud `onAfterCommit`), bemorga matnli xulosa (PII minimal: summa, sana, chek raqami; retseptda dori nomlari va qabul tartibi).
- **Bemor tili**: `patients.preferred_language` (`uz|ru`, default tenant tili; migratsiya 0053) — bot xabarlari shu tilda (`packages/i18n` emas — bot matnlari `apps/api/src/lib/telegram/messages.ts` uz/ru lug'ati).
- Web A.2: `ReceptionistDashboard` Telegram bloki — `GET /api/booking-requests?status=pending` (`appointment.view`), har qatorda «Tasdiqlash»/«Rad etish» (sabab), KPI soni. i18n namespace `telegramRequests.*`.
- Lane B: o'zgarishlar desktop/installer/web `/activate` ichida; Windows-only — 🟡 + `windowsChecklist`. DT-18: klient server manzilini **faqat muvaffaqiyatli ulanishdan keyin** saqlaydi. `UpdateBanner` (UI-0) — yangilanish ish vaqtidan keyin (filial `workHours.close` dan keyin) yoki «Hozir o'rnatish»/«Kechqurun». Aktivatsiya xatolari kodi → oddiy til + keyingi qadam (`INVALID_KEY`, `FINGERPRINT_MISMATCH`, `NOT_ACTIVATED`, tarmoq xatosi, Supervisor javob bermadi).
- Migratsiya: **faqat lane A — 0053**.

## Review Focus

1. **Begona chat callback'i (boshqa bemorning yozilishi tugmasi) hech narsani o'zgartirmaydi** (A.1).
2. **Bron so'rovini tasdiqlashda slot band bo'lib qolgan bo'lsa 409, so'rov `pending` qoladi** (A.1).
3. **Anketa javoblari allergiyalarga avtomatik yozilmaydi, faqat qoralama** (A.1).
4. **Registrator so'rovlar ro'yxatida faqat o'z tenantini ko'radi; Accountant 403** (A.1/A.2).
5. **Klient noto'g'ri manzilni saqlamaydi** (DT-18) (B).

---

## Lane A — Telegram
### A.1 UI-T2 API (T3 `sonnet`·`high`, risky — PHI/bot)
Files: `apps/api/src/lib/telegram/*` (yangi), `telegram-bot-manager.ts` (ulash), migratsiya 0053 + RLS fayli, `apps/api/src/modules/booking-requests/*` (6-fayl naqshi, routes `/api/booking-requests`), reminder worker (inline tugmalar), cashier/prescription `onAfterCommit` xabarlari. Test: yangi `apps/api/tests/integration/ui-t2-telegram-flows.test.ts` (sof funksiyalar + real DB: bron → confirm 201/409, decline, callback egasi tekshiruvi, anketa qoralama, expired), mavjud `p8-telegram-contact.test.ts`, `telegram-bot-manager.test.ts`.
### A.2 UI-T2 web (T2 `sonnet`·`medium`)
`apps/web/src/features/dashboard/components/ReceptionistDashboard.tsx` Telegram bloki + KPI; `features/dashboard/reception.api.ts` (generated client — integratsiyada generatsiya; lane ichida `customInstance` + TODO). Test: web `src/features/dashboard`.

## Lane B — Desktop holatlari
### B.1 UI-T3 (T2 `sonnet`·`medium`, windowsOnly)
Files: `apps/desktop/build/installer.nsh` (Server/Klient izohi MessageBox matni), `server-url-prompt.ts` (DT-18: muvaffaqiyatda saqlash; «Qayta qidirish» + qo'lda manzil), `main.ts`/`auto-updater.ts` (yangilanish ish vaqtidan keyin; `UpdateBanner` uchun IPC holati), web `apps/web/src/features/auth/pages/activate.page.tsx` (xato kodlari → oddiy til + keyingi qadam), web `UpdateBanner` ulanishi (desktop IPC mavjud bo'lsa). Test: `apps/desktop/src/server-url-prompt.test.ts`, `auto-updater.test.ts`, `installer-nsh.test.ts`, web `src/features/auth/pages/activate.page.test.tsx`.

---

## Ijro
- `scripts/wf-lane.sh prep ui4-a 2 --db`, `ui4-b 3`. Verifier: A.1.
- Integratsiya: §5.5, `generate:contract`, gate (`turbo typecheck --force`, web build, API, web, desktop, check:rls), registrator rolida vizual (Telegram bloki), merge.
