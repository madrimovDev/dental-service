# Yakunlash qoldiqlari (2026-11-12) — Implementation Plan

> Ijro: `docs/ORCHESTRATION-GUIDE.md`. 5 parallel lane. Kanvas: `docs/design/ui-redesign-2026-11/canvas/*.dc.html` (render: `bun scripts/ui/canvas-shot.ts <Name>`). Oldingi QA: `docs/qa/2026-11-11-post-ui-verification.json`.

**Goal:** «hali to'liq emas» qismini yopish — FU-41 (Branch Manager huquqlari), FU-15 (telefonni Telegram orqali tasdiqlash), FU-24 kanvas qoldiqlari, lab buyurtma sahifasi, Sozlamalar/Xodimlar/Tish xaritasi kanvas farqlari, kichik FU'lar.

**Foydalanuvchi qarorlari (2026-11-12):** BM shabloniga kerakli huquqlar qo'shiladi (P5 qoidasi yumshatilmaydi); telefon tasdig'i Telegram'ga bog'lanadi.

## Global Constraints

- Migratsiya raqamlari qat'iy: **bm → 0055**, **phone → 0056**, **pat → 0057** (kerak bo'lsa). Boshqa lane migratsiya yaratmaydi.
- i18n namespace'lar: bm `roles.*`/`staffCards.*`; phone `phoneVerify.*`; pat `patients.*`/`patientImport.*`; cal `appointments.*`/`services.*`/`reports.*`/`expenses.*`; labui `labOrders.*`/`settings.*`/`staffCards.*` (bm bilan to'qnashsa `staffPanel.*`)/`odontogram.*`. Ikkala til (uz+ru).
- Yangi permission kodi — `packages/core/src/permissions.ts` katalogi + `role-templates.ts`; hech qachon hardcode emas.
- Rol-bo'yicha test majburiy (real cheklangan permset, `@owner` emas).
- generate:contract YURGIZILMAYDI (controller integratsiyada); yangi endpoint web'da vaqtincha `customInstance` + `// TODO(generate)`.
- Telefon har doim `@dental/core` `normalizePhone` orqali.

## Review Focus

1. BM superset bo'lgach BM **shifokor bo'lib qolmasligi** (yozilish shifokorlar ro'yxati, FU-17 fallback, navbat) — bm.
2. BM hech qachon **Tenant Admin**ni bera olmaydi (403 `role.escalation`) — bm.
3. FU-15: hujumchi klinika (vaqtinchalik parolni biladi) **boshqa klinika taklifini qabul qila olmaydi**; bot yo'q bo'lsa — **yopiq** (aniq xabar, jim o'tkazib yuborish emas) — phone.
4. Excel import: dublikat telefon yangi bemor yaratmaydi, noto'g'ri qator butun importni buzmaydi, formula-injection — pat.
5. Lab buyurtma sahifasiga o'tish (modal o'rniga) mavjud yaratish/tahrirlash oqimini sindirmaydi; Technician 403 shovqini yo'q — labui.

---

## Lane bm — FU-41 Branch Manager huquqlari (T3, risky)
1. `role-templates.ts`: Branch Manager = Receptionist ∪ Doctor ∪ Doctor+Assistant ∪ Nurse ∪ Accountant ∪ Technician permission'larining **birlashmasi** (+ hozirgi BM). Tenant Admin'ning tenant-darajali huquqlari (masalan `tenant.manage`, `role.manage`, owner'ga xos) qo'shilmaydi — Tenant Admin P5 bo'yicha berib bo'lmas qoladi. `role-templates.test.ts`ga qulf: «BM ⊇ har bir filial shabloni», «BM ⊉ Tenant Admin».
2. **Shifokor aniqlash** endi permission bo'yicha emas: migratsiya **0055** `roles.is_practitioner boolean NOT NULL DEFAULT false`; `doctor` va `doctor_assistant` templateKey'li mavjud rollar uchun `true` (backfill), shablon seed'da ham. `listDoctors` (`appointments.service.ts:~590`), FU-17 `listBranchDoctorsWithoutSchedule`, schedule/availability va boshqa `'medical_record.edit'` bo'yicha shifokor qidiruvlari (grep: `permissions.code, 'medical_record.edit'`) — `roles.is_practitioner = true` ga. Rol tahrirlash formasida «Shifokor (yozilish qabul qiladi)» belgisi (`roles.manage` bilan), API `POST/PATCH /api/roles` schema'sida `isPractitioner`.
3. Mavjud tenantlardagi tizim BM rollari uchun 0055 ichida backfill: `role_permissions`ga yetishmayotgan permission'lar (templateKey `branch_manager`, `is_system`).
4. Testlar: `tests/integration/fx-grantable-roles.test.ts` yangilanadi (BM endi Receptionist/Doctor/Nurse/Accountant/Technician'ni oladi, Tenant Admin yo'q, invite 201/403), yangi `tests/integration/fu41-practitioner-flag.test.ts` (BM shifokorlar ro'yxatida yo'q; Doctor bor; custom rol `isPractitioner:true` bilan bor), `p5-role-escalation.test.ts`, `p10-default-work-hours.test.ts`.

## Lane phone — FU-15 telefonni Telegram orqali tasdiqlash (T4, risky)
**Tahdid:** klinika A platformada hali yo'q telefon uchun hisob yaratadi (vaqtinchalik parolni biladi); keyin klinika B shu telefonni taklif qilsa, A shu hisob bilan kirib B taklifini qabul qiladi → B ma'lumotiga kiradi.
1. Migratsiya **0056**: `users.phone_verified_at timestamptz NULL`; `phone_verifications` (platform-level, RLS'siz — `users` kabi; `check:rls` istisnolar ro'yxatiga): `id, user_id, tenant_id (qaysi bot), token_hash, expires_at (15 daq), consumed_at, created_at`.
2. Gate — **taklifni qabul qilish** (`POST /api/auth/invitations/{id}/accept`), login emas: `phone_verified_at IS NULL` bo'lsa 403 `phone.verification_required`. Birinchi tenantdagi oddiy ish (o'z klinikasi) to'silmaydi.
3. `POST /api/auth/phone-verification/start { invitationId }` → taklif qilgan tenantning boti bo'yicha bir martalik token (SHA-256 saqlanadi) va `deepLink = https://t.me/<botUsername>?start=pv_<token>`. Bot sozlanmagan / ishlamayapti → 409 `phone.verification_unavailable` (web: «Bu klinikada Telegram bot sozlanmagan — klinika administratoriga murojaat qiling»). Rate-limit (mavjud limiter naqshi).
4. Bot (`apps/api/src/lib/telegram/phone-verify.ts`, sof funksiya + manager ulanishi): `/start pv_<token>` → «Raqamni ulashish» tugmasi → contact: **`contact.user_id === ctx.from.id`** (P8) va `normalizePhone(contact.phone_number) === users.phone` bo'lsa `phone_verified_at = now()`, token consumed; aks holda rad xabari, hech narsa o'zgarmaydi. Token muddati/qayta ishlatish → rad. Bemor bog'lash oqimiga (P8) aralashmaydi (`pv_` prefiksi).
5. `GET /api/auth/me`da `phoneVerified: boolean`. Web: takliflar sahifasida (`/invitations` yoki mavjud accept UI) tasdiqlanmagan bo'lsa «Telegram orqali tasdiqlash» tugmasi → deepLink ochiladi → 3 s polling `me` → tasdiqlangach «Qabul qilish» faollashadi.
6. Owner parol reset qilganda yoki telefon o'zgarganda `phone_verified_at = NULL`.
7. Testlar: yangi `tests/integration/fu15-phone-verification.test.ts` (tasdiqlanmagan accept 403; boshqa Telegram foydalanuvchisining kontakti rad; boshqa raqam rad; muddati o'tgan/qayta token rad; bot yo'q → 409; tasdiqdan keyin accept 200; reset → qayta talab), `p4b-invite-consent` testi (mavjud nomi bo'yicha grep), `p8-telegram-contact.test.ts`, web `src/features/auth`.

## Lane pat — Bemorlar kanvas qoldiqlari + kichik xavfsizlik (T3)
1. **Qarzdorlar chip** (Patients kanvas): bemorlar ro'yxatida «Qarzdorlar» filtri → `GET /api/patients?debt=true` (balans < 0; mavjud balans so'rovi bilan, N+1'siz).
2. **«Keyingi tashrif» ustuni**: ro'yxat DTO'siga `nextAppointmentAt` (bitta LATERAL/subquery, `appointment.view` bo'lmasa `null`).
3. **Excel import**: yangi permission `patient.import` (Tenant Admin, BM); web'da `.xlsx/.csv` brauzerda o'qiladi (`xlsx` SheetJS paketi `apps/web`ga — `bun add` faqat shu lane'da ruxsat, lockfile commit), ustun moslash → oldindan ko'rish (yangi / dublikat / xato) → `POST /api/patients/import { rows[] }` (≤ 1000 qator): telefon `normalizePhone`, mavjud telefon → `skipped_duplicate`, xato qator → `errors[]` (qolganlari import qilinadi), bitta audit yozuvi (`patient.import`, soni). Natija modal.
4. **FU-21**: `PATCH /patients/{id}` `patient.view_pii`siz PII maydonlari (telefon, manzil, pasport va h.k. — mavjud mask ro'yxati) → 403. **FU-23**: `phone-check` `view_pii`siz faqat `count`. **FU-33**: 1C/CSV eksportda `=,+,-,@` bilan boshlanuvchi qiymatlar `'` prefiksi.
5. Testlar: yangi `tests/integration/fu24-patients-import.test.ts` (dublikat, xato qator, 1001 qator 400, Receptionist 403, formula), `fu21-pii-patch.test.ts`, mavjud 1C eksport testi (grep), web `src/features/patients`.

## Lane cal — Kalendar/xizmatlar qoldiqlari + kichik FU'lar (T2)
1. **Drag «ushlab turish»** (Calendar kanvas): kalendarda yozilishni sudrab boshqa vaqt/shifokorga ko'chirish → tasdiq (`UndoToast` bilan) → mavjud `PATCH /appointments/{id}`; 409 bo'lsa joyiga qaytadi va xabar. Klaviatura alternativasi (mavjud «Ko'chirish» amali) saqlanadi.
2. **Narx chip'lari** (Booking/Cashier kanvas — qaysi ekranda ekanini kanvasdan aniqlang): xizmat tanlashda narx chip'i (filial narxi).
3. **FU-30**: Hisobotlar «Xarajat va sof foyda» savoli `GET /api/reports/pnl`ga ulanadi. **FU-31**: hisobot filial dropdown'i faqat `report.view` bergan filiallar. **FU-42**: `/expenses` haqiqiy pagination. **FU-43**: 40P01 → umumiy `conflict.slot_busy` matni. **FU-44**: `apps/desktop` `migrate-on-start` xatosi `LOGS_DIR`ga yoziladi (dialog'dan oldin).
4. Testlar: web `src/features/appointments src/features/reports src/features/expenses src/features/cashier`, API `tests/integration/fx-concurrency-409.test.ts`, desktop `src/migrate-on-start.test.ts`.

## Lane labui — Lab buyurtma sahifasi + Sozlamalar/Xodimlar/Tish xaritasi (T3)
Avval kanvas (`LabOrder`, `Settings`, `Staff`, `Odontogram`) va hozirgi ilovani solishtiring — **mavjud bo'lganini qayta qurmang**, faqat yetishmayotganini.
1. **Lab buyurtma alohida sahifa** `/patients/:id/lab-orders/new` va `/lab-orders/:id` (modal o'rniga): kanvasdagi bo'limlar (lab tanlash — hozircha erkin `labName` + oldingi lablar ro'yxati, tishlar, rang/shade, muddat, fayllar, remake, «Laboratoriya nimani ko'radi» bloki — portalgacha matn). Mavjud API'dan foydalanadi.
2. **Sozlamalar chap navigatsiyasi** (Settings kanvas): bo'limlar (Klinika, Filiallar, Xodimlar, Rollar, Integratsiyalar, Litsenziya, Zaxira, Qurilmalar…) holat belgilari bilan; har bo'lim faqat ruxsat bo'lsa.
3. **Xodimlar rol-kartalari paneli** (Staff kanvas) — jadval yonida rol tavsifi kartalari (agar UI-3 qurgan bo'lsa — faqat farqlarni tuzatish).
4. **Tish xaritasi**: tish tanlanganda tashxis qidiruvi + davolash taklifi paneli (mavjud tashxis qidiruvi va reja qo'shish API'si bilan).
5. Testlar: web `src/features/clinical src/features/settings src/features/lab-orders` (mavjud papka nomlari bo'yicha), build. Vizual: kanvas va ilova PNG'lari light+dark.

---

## Ijro
- `scripts/wf-lane.sh prep <lane> <idx> --db`: bm 2, phone 3, pat 4, cal 5, labui 6. Verifier: bm, phone, pat.
- Integratsiya: i18n-merge, drizzle snapshot zanjiri, generate:contract, shim'lar → generated, gate, **controller vizual o'tishi** (BM xodim taklifi UI'dan; vizit→kassa→chek bemor nomi; Excel import; lab sahifa; FU-15 oqimi), merge.
- **FU-32 (filial oflayn)** — qurilmaydi: kanvasda faqat `ConnectionStatus` holati (UI-0 da qurilgan); bitta server modelida filial-darajali signal yo'q.
