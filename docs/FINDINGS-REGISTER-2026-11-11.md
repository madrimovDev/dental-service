# Topilmalar reyestri va ishlar ro'yxati — 2026-11-11

> [`FEATURE-RESEARCH-2026-11-11.md`](./FEATURE-RESEARCH-2026-11-11.md) ning to'liq ilovasi. Unda 9 ta domen agenti va controller tekshiruvlarida topilgan **barcha** topilmalar keltirilgan, har biriga qilinadigan ish biriktirilgan. Ustuvor topilmalar (P1–P18) asosiy hujjatda; bu yerda ular ID bilan havola qilinadi.
>
> **Ustunlar:**
> - **J** — jiddiylik: C (Critical), H (High), M (Medium), L (Low).
> - **D** — dalil darajasi:
>   - ✅✅ — controller ishga tushirib tasdiqlagan (probe);
>   - ✅ — controller kodni o'qib tasdiqlagan;
>   - 📄 — agent koddan tasdiqlagan;
>   - ❔ — ehtimoliy, runtime'da tekshirish kerak.
>
> **Holat:** hech biri tuzatilmagan (2026-11-11), P3 dan tashqari — ✅ `592ed7a` da yopilgan (real `Job.validateOptions` testi bilan). Yakunlash tartibi va qarorlar: [`superpowers/specs/2026-11-11-completion-roadmap-design.md`](./superpowers/specs/2026-11-11-completion-roadmap-design.md).

---

## 0. Ustuvor (P) — ishlar

| ID | J | Qisqa | Qilinadigan ish | Tartib |
|---|---|---|---|---|
| P1 ✅ | C | RLS tx 500 da COMMIT (yopildi — P bosqichi 1) | `rlsMiddleware`: `await next()` dan keyin `c.error` bo'lsa throw (rollback); route'da yozib throw qiladigan HTTP regressiya testi | 1 |
| P2 🟡 | C | desktop yangilanishda migratsiya yo'q | har startda idempotent `api.exe migrate` (API'dan oldin); 0043 to'qnashuvida tushunarli dialog | 3 |
| P17 ✅ | C | bulutda uploads volume yo'q, backup MinIO'ga (yopildi — P bosqichi 3; ⚠️ Docker image build va volume saqlanishi amalda yurgizilmagan — infra bosqichida tekshiriladi) | `docker-compose.prod.yml`ga `uploads` volume + `UPLOADS_DIR`; `backup.sh`ni lokal uploads'ga qaratish; MinIO'ni compose'dan olib tashlash | 3 |
| P3 ✅ | H | reminder jobId `:` (yopildi — `592ed7a`) | `queue.ts` fix'ini commit qilish + real `Queue.add` kontrakt testi | 2 |
| P4 ✅ | H | Redis side-effect tx ichida (yopildi — P bosqichi 1; `onAfterCommit` + 2,5 s timeout) | enqueue/remove'ni commit'dan keyin best-effort (try/catch + log) yoki outbox; status-only qayta faollashganda re-enqueue | 2 |
| P5 ✅ | H | rol eskalatsiyasi (yopildi — bosqich 4: invite/add/update/reactivate + roles create/setPermissions; `role.escalation` 403) | invite/addAssignment/updateAssignment: berilayotgan rol permission'lari chaqiruvchinikining qism-to'plami bo'lishi shart (owner istisno); test | 4 |
| P6 ✅ | H | tenantlararo parol tiklash (yopildi — bosqich 4 + 4b: faqat owner, vaqtinchalik parol + `pwc`, mavjud foydalanuvchini taklif qilish rozilik bilan (`accepted_at`), kutilayotgan taklif hech qayerda a'zolik emas) | target boshqa tenantda owner yoki undan yuqori rolga ega bo'lsa rad etish (yoki faqat shu tenantga a'zo foydalanuvchiga ruxsat); test | 4 |
| P7 ✅ | H | POS items + begona reja (yopildi — bosqich 4) | `items` rejimida `treatmentPlanId`ni rad etish, `patientId`ni DB'dan tekshirish; test | 4 |
| P8 ✅ | H | Telegram kontakt egaligi (yopildi — bosqich 4) | `contact.user_id === ctx.from.id` talab qilish; mavjud `telegramChatId`ni jim ustiga yozmaslik | 4 |
| P9 ✅ | H | NoOp → recall `sent` | NoOp `{ok:false, reason:'not_configured'}` qaytarsin; recall `pending` qoladi, outcome `skipped_no_channel` | 5 |
| P10 ✅ | H | yangi tenantda bron yo'q | provisioning/register filialga default `workHours` yozsin + Filial formasiga ish soati UI + doktor jadvali bo'sh bo'lsa wizard'da tushunarli xabar | 5 |
| P11 ✅ | H❔ | rasmlar Bearer'siz | avval brauzerda tasdiqlash; keyin blob-fetch (`api-client` + `URL.createObjectURL`) yoki qisqa muddatli imzolangan URL; `/uploads`ga `patient_image.view` + audit | 5 |
| P12 ✅ | H | Zod `.partial()` default | update schema'larni default'siz qurish (visit-notes, consent template va boshqa `.partial()` joylarini grep qilish); HTTP test | 5 |
| P13 ✅ | H | Accountant kassa refund'ni qo'shadi | `type==='refund'` ayirilsin (DailySummaryCard bilan bir xil formula, umumiy helper) | 5 |
| P14 🟡 | H | NSIS config'ni qayta yozadi | `${isUpdated}` bo'lsa dialog va yozish o'tkazib yuborilsin; mavjud config merge qilinsin | 3 |
| P15 🟡 | H | supervision yo'q | child exit → backoff bilan restart + tray holati/xabar; Windows'da graceful stop (`pg_ctl stop`, API `/shutdown`); `before-quit` `preventDefault` + await | 6 |
| P16 🟠 | H | Supervisor HTTP, backupsiz, renew yo'q (renew ✅ bosqich 2, backup ✅ bosqich 3; TLS/domen — bosqich 12) | domen + TLS (prod Caddyfile); `pg_dump` cron + off-host; RSA private key zaxira tartibi; `PATCH /admin/licenses/:id` (expiresAt/grace) + UI | 6 |
| P18 ✅ | H | offline grace `expiresAt`dan (yopildi — P bosqichi 2: `expiresAt`+7, to'liq blok, banner/blok ekrani, renew; jonli tasdiqlangan; desktop UI Windows'da tekshirilmagan) | Q1/Q2 qaroridan keyin: grace = oxirgi muvaffaqiyatli heartbeat'dan yoki hujjatni kodga moslash; muddat tugaganda qoladigan modullar ro'yxati | 3 |

---

## 1. Identity & Access

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| ID-01 | M | Refresh token Bearer sifatida qabul qilinadi (`typ` claim yo'q); perm'siz endpoint'larda 7 kun access, `requirePermission`da TypeError → 500 | `lib/jwt.ts:82-90`, `middleware/auth.ts:35` | ✅ | `typ: 'access'/'refresh'` claim + `verifyAccess`da tekshirish; alohida secret ixtiyoriy |
| ID-02 | M | `refresh`/`switchWorkspace` `users.deletedAt`ni tekshirmaydi | `auth.service.ts:553,620` | 📄 | ikkalasiga `isNull(deletedAt)` |
| ID-03 | M | Branch Manager'da `user.invite` bor, `role.view` yo'q → rol Select bo'sh (RBAC gap) | `UsersSettingsScreen.tsx:43,245`, `role-templates.ts:96-137` | 📄 | tor `GET /users/assignable-roles` (`user.invite` bilan, P5 filtri bilan) |
| ID-04 | M | Vaqtinchalik parol `logger.warn`da ochiq (invite) | `users.service.ts:111-114` | 📄 | log'dan olib tashlash |
| ID-05 | M | Admin reset yangi parolni log'ga yozadi | `users.service.ts:390-393` | 📄 | log'dan olib tashlash |
| ID-06 | M | Assignment PATCH UI yo'q; `user.deactivate` o'lik permission | `permissions.ts:121` | 📄 | rol almashtirish/faolsizlantirish UI yoki permission'ni olib tashlash |
| ID-07 | M | `updateAssignment` `roleId`/`branchId` tenantga tegishliligini tekshirmaydi (FK RLS'ni chetlab o'tadi), dublikat guard yo'q | `users.service.ts:264-294` | 📄 | CLI-429 tekshiruvini qo'llash |
| ID-08 | M | Tenant Admin boshqa Tenant Admin parolini tiklaydi | `users.service.ts:323+` | 📄 | P5 bilan bir xil «yuqori rol» qoidasi |
| ID-09 | M | Biriktirilgan rolni o'chirish → FK 23503 → 500 | `roles.service.ts:141-160` | 📄 | oldindan tekshirish → 409 `role.in_use` |
| ID-10 | M | `setPermissions` noma'lum kodlarni jim tashlaydi, audit so'ralganini yozadi | `roles.service.ts:104-137` | 📄 | noma'lum kod → 400; audit saqlangan ro'yxatni yozsin |
| ID-11 | M | Hamma rol «Sozlamalar»ni ko'radi (`tenant.view`); 403'da forma default qiymatlarni haqiqiydek ko'rsatadi | `nav-config.ts:186`, `TenantSettingsScreen.tsx:65-87` | 📄 | ekranni `tenant_settings.view` bilan gate qilish; 403'da StateView |
| ID-12 | M | Owner-only «egalikni o'tkazish» kartasi Tenant Admin'ga ko'rinadi | `TenantSettingsScreen.tsx:309` | 📄 | `@owner` tekshiruvi |
| ID-13 | M | `vertical: z.string()` — noma'lum qiymat feature'larni jim yopadi | `tenant-settings.schema.ts:80` | 📄 | `z.enum(VERTICALS)` |
| ID-14 | M | Audit `before/after`da shifrlangan kredensial ciphertext'i va ish haqi | `tenant-settings.service.ts:113-122`, `audit.mapper.ts:12` | 📄 | audit yozishda maxfiy maydonlarni redakt qilish |
| ID-15 | M | Audit «Kim» ustunida owner UUID bo'lib ko'rinadi, filtrda yo'q | `AuditScreen.tsx:68-97` | 📄 | `/audit` ro'yxatiga `users` JOIN (`/recent` kabi) |
| ID-16 | M | `login.success/failed` `tenant_id=NULL` → hech kim ko'rmaydi | `auth.routes.ts:193`, RLS 0001 | 📄 | platform-darajasidagi ko'rish yo'li yoki tenant kontekstida ham yozish |
| ID-17 | L | Login timing enumeration | `auth.service.ts:296` | 📄 | dummy `verifyPassword` |
| ID-18 | L | Login schema API `min(12)`, web `min(1)` | `auth.schema.ts:18` | 📄 | login'da `min(1)` |
| ID-19 | L | `login.failed` auditida xom telefon | — | 📄 | maskalash |
| ID-20 | L | 0 ruxsatli rol workspace'dan «tushib qoladi» | `auth.service.ts:639` | 📄 | farqlash |
| ID-21 | L | `logout`/`switch-workspace`/`change-password` audit yo'q | — | 📄 | audit qo'shish |
| ID-22 | L | Refresh token localStorage'da | `auth-store.ts` | 📄 | (kelajak) httpOnly cookie |
| ID-23 | L | `change-password`/`switch-workspace` rate-limit'siz | — | 📄 | limit |
| ID-24 | L | `branchId`siz switch → `perms=[]` noaniq holat | `auth.service.ts:504` | 📄 | majburiy branch yoki tushunarli xato |
| ID-25 | L | `roleKey = assignments[0]` ORDER BY'siz | `auth.service.ts:238` | 📄 | deterministik tartib |
| ID-26 | L | JWT `atob` base64url'siz (2 nusxa) | `select-workspace.page.tsx:46`, `api.ts:38` | 📄 | umumiy helper |
| ID-27 | L | `invite` mavjud userni `deletedAt`siz qidiradi | `users.service.ts:90` | 📄 | filtr |
| ID-28 | L | Xodimlar ro'yxatida owner yo'q | `listAssignments` | 📄 | owner qatorini qo'shish |
| ID-29 | L | `mustChangePassword` yo'q | — | 📄 | flag + majburiy almashtirish |
| ID-30 | L | Profil: audit yo'q, Zod xabarlari i18n'siz, til o'zgartirish API yo'q | `profile.page.tsx` | 📄 | — |
| ID-31 | L | `isSystem` bo'sh bloki — tizim rollari erkin tahrirlanadi | `roles.service.ts:80-83` | 📄 | qaror: ruxsat yoki bloklash |
| ID-32 | L | Rollar ekrani `permission.view`/`user.view`siz bo'sh | `RolesSettingsScreen.tsx:26` | 📄 | — |
| ID-33 | L | `useUpsertRole` ikki so'rov, atomik emas | — | 📄 | bitta endpoint |
| ID-34 | L | `transferOwnership` eski owner'ga assignment bermaydi | `tenants.service.ts:55` | ❔ | test + assignment yaratish |
| ID-35 | L | Filial telefoni kanonik emas | `branches.service.ts:34` | 📄 | `normalizePhone` |
| ID-36 | L | Filial xodim soni `user.view`siz 0 | `BranchesSettingsScreen.tsx:23` | 📄 | — |
| ID-37 | L | Integratsiya `hint` oxirgi 4 belgini ochadi (qasddan, B4) | — | 📄 | — |
| ID-38 | L | Integratsiya testi timeout'siz va rate-limit'siz | `integrations-tester.ts:31` | 📄 | `AbortSignal.timeout` |
| ID-39 | L | Audit `from`/`to` faqat ikkalasi bo'lsa ishlaydi | `audit.service.ts:20-28` | 📄 | alohida qo'llash |
| ID-40 | L | Audit action nomlari tarjimasiz va izchil emas | — | 📄 | i18n map |
| ID-41 | L | Slug 24-bit, to'qnashuvda 500 | `auth.service.ts:119` | 📄 | retry |
| ID-42 | L | Staff profile PUT har doim payroll-guard'ni ishga tushiradi | `users.schema.ts:37` | 📄 | maydonlarni ixtiyoriy qilish |
| ID-T | — | **Testlar yo'q:** refresh, logout, replay-detect, change-password, roles CRUD, admin reset, transfer-ownership | — | 📄 | integration testlar |

## 2. Bemorlar

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| PT-01 | M | PATCH javobi PII'ni maskalamaydi | `patients.service.ts:450`, `routes.ts:208` | 📄 | `maskPii` qo'llash |
| PT-02 | M | Emergency contact telefoni maskalanmaydi | `patients.mapper.ts:141` | 📄 | maskalash |
| PT-03 | M | Qidiruv maskalangan telefon/pasport uchun oracle | `patients.search.ts:28-33` | 📄 | `view_pii`siz phone/passport bo'yicha qidirishni o'chirish |
| PT-04 | M | Tahrir formasi maskalangan `'***'`ni qayta yozadi | `GeneralTab.tsx:157-217` | 📄 | faqat o'zgargan maydonlarni yuborish; `view_pii`siz PII maydonlari read-only |
| PT-05 | M | Tahrir formasida sug'urta/tags/source yo'q | `GeneralTab.tsx:224-285` | 📄 | maydonlar qo'shish |
| PT-06 | M | `anamnez`/`bloodType` tozalanmaydi | `MedicalTab.tsx:138,152`, `schema.ts:84,88` | 📄 | nullable + `null` yuborish |
| PT-07 | M | Balans formulasi ikki nusxa (paritet testi yo'q) | `patients.service.ts:124-221` va `270-341` | 📄 | bitta funksiya yoki paritet testi |
| PT-08 | M | Maskalash uchun test yo'q | — | 📄 | rol-bo'yicha test |
| PT-09 | L | `%`/`_` escape yo'q; `90 123` topilmaydi | `patients.search.ts:24-32` | 📄 | escape + raqam normalizatsiyasi |
| PT-10 | L | Unarchive yo'q; arxivlashda qarz/yozilish tekshiruvi yo'q | `service.ts:454` | 📄 | — |
| PT-11 | L | `source`/`tags` nullable emas | `schema.ts:71` | 📄 | — |
| PT-12 | L | `todayIsoDate()` UTC | `schema.ts:42` | 📄 | Tashkent sanasi |
| PT-13 | L | `0901234567` → `+0901234567` | `core/phone.ts` | 📄 | 10 xonali `0…` ni ham normalizatsiya |
| PT-14 | L | Supervisor `phone.ts` qo'lda nusxa | — | 📄 | seam test bor |
| PT-15 | L | Payments tab: `tx.status` xom, pagination yo'q | `PaymentsTab.tsx:91` | 📄 | i18n |
| PT-16 | L | `testResults` UI yo'q; bo'sh PATCH no-change audit yozadi; record yo'q → 404 | `MedicalTab.tsx`, `service.ts:510-530` | 📄 | — |
| PT-17 | L | Arxivlangan bemor qarindosh sifatida bog'lanadi | `service.ts:623` | 📄 | — |
| PT-18 | L | Emergency contact PATCH yo'q; asosiy kontakt o'chirilsa yangisi tayinlanmaydi | `service.ts:798` | 📄 | — |
| PT-19 | L | Balans/strike mavjud bo'lmagan bemor uchun 404 emas | `service.ts:267`, `no-show-strikes.service.ts:34` | 📄 | 404 |
| PT-20 | L | Balans `patient.view` bilan, Payments tab `cashier.view` bilan — nomuvofiq | — | 📄 | qaror |
| PT-21 | L | `/no-show-strikes` desktop modul gate'siz | `no-show-strikes.routes.ts:19` | ✅ | `requireModuleInDesktop('patients')` |

## 3. Yozilish va xabarlar

> ⚠️ Bu domen agenti «500 = rollback» deb yozgan. P1 bo'yicha haqiqatda **commit** bo'ladi — quyidagi ta'sirlar shunga ko'ra tuzatilgan.

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| SC-01 | M | Kalendar ismlari faqat birinchi 100 bemordan olinadi | `CalendarScreen.tsx:92` | 📄 | yozilish DTO'ga bemor ismini qo'shish (JOIN) |
| SC-02 | M | `useAppointments` page/pageSize yubormaydi → >100 yozilish jim kesiladi | `appointments.api.ts:16` | 📄 | pagination yoki diapazon bo'yicha to'liq yuklash |
| SC-03 | M | Kalendarda reschedule/confirm/no-show/complete UI yo'q | `appointments.api.ts` | 📄 | status menyusi + drag-reschedule |
| SC-04 | M | Doctor `PATCH {status:'cancelled'}` bilan `appointment.cancel`ni chetlab o'tadi | `appointments.schema.ts:30`, `role-templates.ts:152` | 📄 | PATCH'da `cancelled` → `appointment.cancel` talab qilish |
| SC-05 | M | Cancel route `not_found` → 400 | `appointments.routes.ts:248` | 📄 | 404 |
| SC-06 | M | Status-only qayta faollashganda eslatma qo'yilmaydi | `appointments.service.ts:507` | 📄 | re-enqueue |
| SC-07 | M | Availability o'tgan slotlarni beradi → `time.in_past` umumiy xato | `schedule.availability.ts`, wizard `:45` | 📄 | `now` parametri + xabar |
| SC-08 | M | Wizard i18n literal | `NewAppointmentWizard.tsx:37-44` | ✅ | uz/ru kalitlari |
| SC-09 | M | Queue→appt `{ok:false}` yutiladi → yozilish hech qachon `completed` bo'lmaydi | `queue.service.ts:225-232` | 📄 | natijani tekshirish, foydalanuvchiga ogohlantirish |
| SC-10 | M | Doctor `queue.manage`siz — o'z bemorini chaqira/yakunlay olmaydi | `role-templates.ts:155`, `QueueBoard.tsx:56` | 📄 | qaror: Doctor'ga `queue.manage` yoki tor endpoint |
| SC-11 | M | `sweepNoShows` cron'ga ulanmagan | `queue.routes.ts:193` | 📄 | kunlik job |
| SC-12 | M | Kanal sozlanmagan recall `contacted` (P9) + `contacted` ro'yxatda ko'rinmaydi | `recalls.repository.ts:46` | 📄 | status filtri UI |
| SC-13 | M❔ | Recall cron `tz`siz — Tashkent zonali OS'da 06:00 `sendHour`dan oldin → hech qachon yuborilmaydi | `recall-scheduler.ts:20` | ❔ | `repeat.tz: 'Asia/Tashkent'` va soatni moslash |
| SC-14 | M | <24 soat qolgan yozilishga eslatma yo'q | `reminder-delay.ts` | 📄 | qaror: darhol yuborish yoki qisqa lead |
| SC-15 | M❔ | `removeOnFail: 100` + bir xil jobId → keyingi `add` e'tiborsiz | `app.ts:236` | ❔ | `add`dan oldin failed job'ni o'chirish |
| SC-16 | M | `telegram:reload` commit'dan oldin publish | `tenant-settings.service.ts:132` | 📄 | commit'dan keyin |
| SC-17 | M | `notifyInTx`/recall worker HTTP `fetch` tx ichida va timeout'siz | `notifications.service.ts:57-71`, `recall-worker.ts:207` | 📄 | timeout + tx'dan tashqariga |
| SC-18 | M | Har SMS uchun yangi Eskiz login | `tenant-channel.ts:47` | 📄 | per-tenant token kesh |
| SC-19 | L | `no_show`/`completed` slotni band qiladi | EXCLUDE, `checkConflict` | 📄 | qaror |
| SC-20 | L | Ish jadvali segmentlari ustma-ust, mavjud yozilishlar bilan ziddiyat tekshirilmaydi; time-off ham | `schedule.service.ts:33` | 📄 | ogohlantirish |
| SC-21 | L | Owner-doktor jadval tanlay olmaydi | `useDoctors` | 📄 | — |
| SC-22 | L | Queue `usePatientsAll` 100 cheklov | `QueueBoard.tsx:41` | 📄 | DTO'ga ism |
| SC-23 | L | `checkInCandidates` missed ticket'li bemorni qayta check-in qilmaydi | — | 📄 | — |
| SC-24 | L | Recall: `channel` doim `'sms'`; PATCH `scheduledAppointmentId` tekshirilmaydi; `GET /recalls` pagination'siz | — | 📄 | — |
| SC-25 | L | 42P10 fallback aborted tx ichida yiqiladi (faqat 0031'siz muhit) | `recalls.repository.ts:152` | 📄 | SAVEPOINT |
| SC-26 | L | Recall `send` o'tib tx rollback bo'lsa SMS qayta ketadi | `recall-worker.ts` | 📄 | idempotentlik kaliti |
| SC-27 | L | Favqulodda kontakt ichki izohni SMS'da oladi | `reminder-worker.ts:141` | 📄 | body'ni ajratish |
| SC-28 | L | Kanal yo'q bo'lsa ham doktorga in-app yozuv; worker `attempts=1` | — | 📄 | — |
| SC-29 | L | Eskiz `from: '4546'` hardcoded | `eskiz.ts:34` | 📄 | sozlama |
| SC-30 | L | Xato `err.message` (Telegram URL'ida token) logga tushishi mumkin | `recall-worker.ts:224` | ❔ | redakt |
| SC-31 | L | Bot matnlari uz literal | `telegram-bot-manager.ts` | 📄 | i18n |
| SC-32 | L | `markRead` mavjud bo'lmagan id → 200 | — | 📄 | 404 |
| SC-33 | L | `/schedule`, `/recalls` desktop modul gate'siz | `app.ts` | 📄 | qaror (MODULE_MAP) |
| SC-34 | L | Bir nechta bot-manager → Telegram 409 (gate bor) | — | 📄 | — |

## 4. Klinik

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| CL-01 | M | Stage `toothNumbers` FDI tekshiruvisiz odontogrammaga yoziladi | `treatment-plans.schema.ts:34` | 📄 | `isValidFdi` |
| CL-02 | M | CLI-487/488 UI yo'q (`labOrderId`, `resultingToothState`) | web grep | 📄 | StageRow'ga maydonlar |
| CL-03 | M | `/uploads`da `patient_image.view`, modul gate va audit yo'q | `routes/uploads.ts` | 📄 | qo'shish (P11 bilan) |
| CL-04 | M | `/rx` route `medical_record.view`, API `prescription.view` (CLI-439 B3 ochiq) | `clinical.routes.tsx:17` | 📄 | route perm'ni tuzatish |
| CL-05 | L | Auto-snapshot `general` vertikalda ham, uz matn DB'ga | `tooth-charts.service.ts:89,123` | 📄 | feature tekshiruvi + i18n kalit |
| CL-06 | L | Reja avto-`completed` bo'lmaydi | — | 📄 | qaror |
| CL-07 | L | Yaratilgandan keyin bosqich qo'shib/narx o'zgartirib bo'lmaydi | `updateTreatmentPlanSchema` | 📄 | — |
| CL-08 | L | Stage audit faqat `{status, acceptance}` | `treatment-plans.service.ts:363` | 📄 | to'liq diff |
| CL-09 | L | `cancelled` lab-order bosqichni bloklaydi (UI'da uzish yo'q) | — | 📄 | CL-02 bilan |
| CL-10 | L | Stage orqali yopilganda stock yechilmaydi | — | 📄 | hujjatlashtirish |
| CL-11 | L | `visit-notes` ro'yxati `patientId`siz va pagination'siz | — | 📄 | — |
| CL-12 | L | Vizit shablonlari UI yo'q | `clinical.api.ts` | 📄 | — |
| CL-13 | L | ICD-10 katalogi 100 dan oshsa web kesadi | `diagnoses.repository.ts:20` | 📄 | server qidiruvi |
| CL-14 | L | `useAllPrescriptions`, `overdue` pagination'siz | — | 📄 | — |
| CL-15 | L | Nurse/Receptionist konsent imzolata olmaydi; imzo faqat ism | — | 📄 | qaror |
| CL-16 | L | Upload: MIME mijoz da'vosi, 30 MB xotiraga to'liq yuklanadi, `toothNumbers` FDI emas | — | 📄 | — |

## 5. Pul

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| MO-01 | M | POS `paidAmount` `net`ga bog'lanmagan, non-plan qarzni yopish yo'li yo'q | `cashier.service.ts:360` | 📄 | qarzni to'lash oqimi (non-plan allocation) |
| MO-02 | M | UI `unitPrice` tahrirlanadi, server e'tiborsiz qoldiradi; chek client savatidan chiziladi | `CartTable.tsx:77`, `ReceiptModal.tsx:177` | 📄 | narx inputini read-only; chek serverdan |
| MO-03 | M | `paid=0` sotuvni bekor qilib bo'lmaydi; `cashier.void` o'lik | `cashier.service.ts:509` | 📄 | void endpoint |
| MO-04 | M | Fiscal `fetch` timeout'siz, tx ichida, stage qulflari ostida | `fiscal/index.ts:52`, `cashier.service.ts:432` | 📄 | timeout + outbox |
| MO-05 | M | Refund fiscal chekni bekor qilmaydi (`cancelReceipt` yo'q) | `packages/fiscal` | 📄 | interfeysga qo'shish |
| MO-06 | M | Narx sanasi UTC | `services.service.ts:45,179,224` | 📄 | Tashkent sanasi |
| MO-07 | M | Kategoriya `update` dublikat → 500; case nomuvofiq | `service-categories.service.ts:53` | 📄 | 409 |
| MO-08 | M | Komissiya *joriy* reja doktoriga | `payroll.service.ts:84-91` | 📄 | to'lov paytidagi doktorni saqlash |
| MO-09 | M | Payroll filial bo'yicha ajratilmaydi | — | 📄 | qaror |
| MO-10 | L | `serviceName` client'dan keladi | `cashier.service.ts:379` | 📄 | serverdan |
| MO-11 | L | 2 kasrdan ortiq miqdor rad etilmaydi | — | ❔ | `multipleOf(0.01)` |
| MO-12 | L | Overpay guard skipped/cancelled stage'ni hisobga olmaydi; float solishtirish | `cashier.service.ts:402` | 📄 | sentlarda |
| MO-13 | L | To'liq refund qilingan tranzaksiyada refund tugmasi ko'rinadi | `cashier.mappers.ts:116` | 📄 | `remaining>0` |
| MO-14 | L | Payroll hook audit'siz | `payroll.service.ts:445` | 📄 | audit |
| MO-15 | L | Balans 2 nusxa; `planBalance` noma'lum id → 404 emas | — | 📄 | — |
| MO-16 | L | POS'da `other` to'lov usuli yo'q; split payment yo'q | `PosPanel.tsx:85` | 📄 | — |
| MO-17 | L | Fiscal xatoda `fiscalId=null` jim; `fiscal_provider` doim `'noop'` | — | 📄 | — |
| MO-18 | L | Kunlik kassa default sanasi UTC; kassir bo'yicha ajratish yo'q; har ko'rishda audit | `cashier.routes.ts:238` | 📄 | — |
| MO-19 | L | `setPrice` bir kunda 2 marta → teskari interval; parallel → 2 ochiq narx; o'chirilgan xizmatga narx | `services.service.ts:177` | 📄 | EXCLUDE/CHECK |
| MO-20 | L | `code` duplikat → 500 ❔; `list` pagination'siz | — | ❔ | — |
| MO-21 | L | Kategoriya create poygasi → 500 | — | 📄 | `ON CONFLICT` |
| MO-22 | L | Payroll: proratsiya yo'q; hech bir davr qamramagan refund clawback'i yo'qoladi | — | ❔ | — |
| MO-23 | L | Xarajat: UTC default sana; kategoriya/filialni tozalab bo'lmaydi; kategoriya ro'yxati `expense.manage` talab qiladi | `ExpenseFormModal.tsx:19`, `expenses.routes.ts:65` | 📄 | — |
| MO-T | — | **Testlar yo'q:** parallel to'lov/refund (lock poygasi), `items+treatmentPlanId`, `paid>net` | — | 📄 | — |

## 6. Ombor, hisobot, dashboard

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| IR-01 | M | `createItem` boshlang'ich qoldiq uchun ledger qatori yo'q | `stock.service.ts:114` | 📄 | `in` movement yozish |
| IR-02 | M | `expiringBatches` sarflangan/muddati o'tgan partiyalarni abadiy qaytaradi, filial filtri yo'q | `stock.service.ts:532` | 📄 | — |
| IR-03 | M | Margin `AVG(costPerUnit)` qty-vaznsiz, disclaimer yo'q | `reports.service.ts:505` | 📄 | vaznli o'rtacha |
| IR-04 | M | Nurse → `GET /services` 403 (BOM tab) | `StockScreen` | 📄 | tor lookup |
| IR-05 | M | `Σ byService ≠ total` (refund davri) | `reports.service.ts:116` | 📄 | hujjatlashtirish/izchillik |
| IR-06 | M | Hisobot/KPI branch scoping server tomonda majburlanmaydi | `reportRangeSchema` | 📄 | assignment filiallariga cheklash |
| IR-07 | M | Capacity faqat yozilishi bor doktorlarni sanaydi | `reports.service.ts:341` | 📄 | `doctor_schedules`dan |
| IR-08 | M | Retention formulasi noodatiy | `reports.aggregations.ts:30` | 📄 | qaror |
| IR-09 | M | 1C CSV `;` escape qilinmaydi | `reports.export.ts:84` | 📄 | escape |
| IR-10 | M | Accountant `useDoctors` 403 → doktor nomlari o'rniga id | `ReportsScreen.tsx:161` | 📄 | tor endpoint |
| IR-11 | M | `useDefaultPeriod` UTC | `dashboard.api.ts:16` | 📄 | `toLocalDate` |
| IR-12 | M | Dashboard KPI branch'siz (Accountant'da filial va tenant aralash) | `ManagerDashboard`, `AccountantDashboard` | 📄 | — |
| IR-13 | M | `OnboardingChecklist` hook'lari perm tekshiruvidan oldin (BM 403) | `OnboardingChecklist.tsx:20` | 📄 | gate'ni yuqoriga |
| IR-14 | M❔ | Onboarding qadamlari doim «bajarilgan» | `onboarding.ts:22,36` | ❔ | — |
| IR-15 | L | `getItem` branch tekshiruvisiz; item o'chirish yo'q | `stock.service.ts:102` | 📄 | — |
| IR-16 | L | Item/batch yo'q → 500; BOM dublikat → 500 ❔ | `stock.service.ts:231` | 📄 | 404/409 |
| IR-17 | L | Movements pagination UI/total yo'q | — | 📄 | — |
| IR-18 | L | BOM deduction N+1, filial mosligi tekshirilmaydi | `stock.service.ts:371` | 📄 | — |
| IR-19 | L | Low-stock matni uz hardcoded | `stock.service.ts:73` | 📄 | i18n |
| IR-20 | L | `byDoctor` plan'siz → null; status/weekday i18n yo'q | `ReportsScreen.tsx:153` | 📄 | — |
| IR-21 | L | `key={p.serviceName}` to'qnashuv (CLI-473) | `ReportsScreen.tsx:519` | 📄 | `serviceId` |
| IR-22 | L | Recall «converted» `scheduled`ni ham sanaydi | — | 📄 | qaror |
| IR-23 | L | 1C/eksport: xom kodlar, sarlavhalar hardcoded, `branchId` UUID, refetch xatosi ushlanmaydi | `reports.export.ts` | 📄 | — |
| IR-24 | L | Receptionist dashboard'da bemor `'—'`; «haftalik» sarlavha ostida 30 kunlik ma'lumot; `fmtTime` `uz-UZ` | — | 📄 | — |
| IR-25 | L | `ReportsScreen` `canFilterBranch` hamma `report.view` egasiga | `:135` | 📄 | IR-06 bilan |
| IR-T | — | **Testlar yo'q:** Doctor/Assistant/Technician/Generic dashboard, rol-bo'yicha RBAC | — | 📄 | — |

## 7. Desktop va litsenziya

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| DT-01 🟡 | M-H | Tray ikonka paketga kirmaydi (`assets/` `files`da yo'q) | `electron-builder.yml:20` | ✅ | `files`ga `assets/**` |
| DT-02 🟡 | H | Port 80 default (Windows'da band/admin), sabab foydalanuvchiga ko'rinmaydi | `config.ts:17` | 📄 | yuqori port + port-band diagnostika |
| DT-03 🟡 | M | Firewall qoidasi yo'q (TCP 80, UDP 47890) | `installer.nsh` | 📄 | `netsh advfirewall` |
| DT-04 | M | Postgres tayyorligi 3 s fallback; yarim initdb keyin first-run deb hisoblanmaydi | `process-manager.ts:152` | 📄 | `pg_isready` |
| DT-05 | M | Port 5433/6380 to'qnashuvi faqat log'da | — | 📄 | oldindan tekshirish |
| DT-06 | M | `getLocalIp` birinchi IPv4 (Hyper-V/WSL/VPN) | `discovery.ts:28` | 📄 | default route interfeysi |
| DT-07 | M | UDP socket'larda `error` handler yo'q → uncaught | `discovery.ts:52,91` | 📄 | handler |
| DT-08 | M | Dialog bekor qilinsa reconnect loop to'xtaydi | `main.ts:445` | 📄 | qayta boshlash |
| DT-09 | M | Aktivatsiya/heartbeat/verify-reset `fetch` timeout'siz | `license-client.ts:41` | 📄 | timeout |
| DT-10 | M | Desktop rate-limit: hamma `unknown` bucket; web `rate_limited`ni bilmaydi | `rate-limit.ts:42` | 📄 | desktop'da socket IP; i18n |
| DT-11 | M | Fingerprint in-flight dedup yo'q (sovuq startda 4× WMI) | `license.ts:76` | 📄 | Promise kesh + pre-warm |
| DT-12 | M❔ | Bootstrap gate 2 s timeout fingerprint bilan poyga | `license-status.ts:48` | ❔ | — |
| DT-13 | M❔ | `uuid/serial` barqaror emas yoki umumiy (`To Be Filled By O.E.M.`) | — | ❔ | Windows'da tekshirish |
| DT-14 | M | Heartbeat yangi `.lic`ni imzo tekshiruvisiz yozadi | `license-heartbeat-scheduler.ts:56` | 📄 | `isLicenseValid` keyin yozish |
| DT-15 | M | O'qilmaydigan `.lic` → `LICENSE_NOT_FOUND`, sabab va yo'l yo'q | `license-middleware.ts` | 📄 | alohida kod + UI |
| DT-16 | H❔ | `needsVendor` holatida forma yashirin — prepare-reinstall'dan keyin `.lic`ni qo'lda o'chirish kerak bo'lishi mumkin | `activate.page.tsx:69` | ❔ | Windows'da tekshirish; «qayta aktivatsiya» tugmasi |
| DT-17 | M | Owner parol reset refresh token'larni revoke qilmaydi | `reset-owner-password.ts` | 📄 | revoke |
| DT-18 | M | `applyServerUrl` health-check'dan oldin saqlaydi | `settings-ipc.ts:137` | 📄 | tartibni almashtirish |
| DT-19 | M | Backup yo'q (`postgres\data` + `uploads`) | — | 📄 | Q5 |
| DT-20 | M | Imzosiz installer, update HTTP orqali | — | 📄 | code-signing + TLS |
| DT-21 | L | `runMigrations` `spawnSync` UI'ni qotiradi | `first-run.ts` | 📄 | async + progress |
| DT-22 | L | `getOrCreateDbPassword` hardcoded fallback | `first-run.ts:123` | 📄 | — |
| DT-23 | L | `initdb --locale=C` — kirill saralash/ILIKE ❔ | — | ❔ | tekshirish |
| DT-24 | L | `config.json` admin yaratgan bo'lsa `writeConfig` try/catch'siz | `main.ts:398` | ❔ | — |
| DT-25 | L | Heartbeat signali `WEB_DIST_DIR`, gating `DENTAL_LOCAL_DESKTOP` | — | 📄 | bitta signal |
| DT-26 | L | `getActiveModules` har so'rovda diskka anchor yozadi | `license.ts:211` | 📄 | throttle |
| DT-27 | L | Anchor faqat oldinga (o'lik CMOS'da qotib qoladi) | — | ❔ | — |
| DT-28 | L | WHITELIST `startsWith` keng | `license-middleware.ts:32` | 📄 | aniq moslik |
| DT-29 | L | Tray: `connectedClients`/`licenseInfo` to'ldirilmaydi; «Qayta ishga tushirish» yo'q | `main.ts` | 📄 | — |
| DT-30 | L | `validateServerUrl` 169.254/IPv6 rad etadi | — | 📄 | — |
| DT-31 | L | `bootstrap-status` LAN'da `hasLicense/hasTenant`ni ochadi | — | 📄 | qabul qilingan |

## 8. Supervisor

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| SV-01 | M | Admin JWT 7 kun, revoke/logout/rol/parol almashtirish yo'q, localStorage | `auth.routes.ts`, `lib/api.ts:8` | 📄 | qisqa TTL + revoke |
| SV-02 | M | Admin amallari auditida admin ID yo'q (create, deactivate, modules, reactivate) | `clinics.routes.ts:261`, `modules.routes.ts:29` | 📄 | `createdBy` |
| SV-03 | M | Public `/v1/activate|heartbeat|provisioned|reactivate` rate-limit'siz | `licenses.routes.ts:54` | 📄 | limit |
| SV-04 | M | Admin UI `ALL_MODULES` backend lug'atiga mos emas | `ClinicDetailPage.tsx:21-37` | 📄 | backend'dan olish |
| SV-05 | M | Tayyorlangan kredensialni bekor qilib bo'lmaydi; parol ochiq matnda GET'da | `licenses.service.ts:268` | 📄 | bekor qilish tugmasi |
| SV-06 | M | Landing faqat `Caddyfile.ip`da; prod compose volume'siz | `infra/supervisor` | 📄 | prod'ga ko'chirish |
| SV-07 | M | `.env.production` `.gitignore`da aniq yo'q | `.gitignore` | 📄 | qo'shish |
| SV-08 | L | `JWT_SECRET`/seed parol kuchi majburlanmaydi; login timing | `index.ts:5` | 📄 | — |
| SV-09 | L | `expiresAt: z.string()` → Invalid Date 500 | `clinics.routes.ts` | 📄 | `z.iso.datetime()` |
| SV-10 | L | Telefon to'qnashuvi tekshirilmaydi | — | 📄 | — |
| SV-11 | L | Fingerprint bog'lash atomik emas (parallel activate) | `licenses.service.ts:128` | ❔ | `UPDATE … WHERE fingerprint IS NULL` |
| SV-12 | L | `branchName ?? 'Bosh filial'` jim fallback | — | 📄 | — |
| SV-13 | L | Grace UI'dan o'zgarmaydi; «Reactivate» nomi chalg'ituvchi | `ClinicDetailPage.tsx:60,76` | 📄 | — |
| SV-14 | L | `modules` allowlist'siz | `modules.routes.ts` | 📄 | enum |
| SV-15 | L | `license_events` cheksiz o'sadi | — | 📄 | retention |
| SV-16 | L | `/v1/provisioned`, `verifyReset` `isActive` tekshirmaydi; reset `fingerprint` ustuni o'lik | `licenses.service.ts:379` | 📄 | — |
| SV-17 | L | `prepareReinstall` faol bo'lmagan litsenziyani ham tayyorlaydi | — | 📄 | ogohlantirish |
| SV-18 | L | Skript default IP repo'da; `/bins` browse ochiq; api healthcheck yo'q; in-memory rate-limit | — | 📄 | — |

## 9. Platforma

| ID | J | Topilma | Joy | D | Ish |
|---|---|---|---|---|---|
| PL-01 | M | `check-rls-coverage` faylning faqat birinchi `pgTable`ini oladi (5 fayl × 2-jadval) | `scripts/check-rls-coverage.ts:36` | ✅ | barcha `pgTable`larni olish; 2-jadvallarni tekshirish |
| PL-02 | M | App roliga `TRUNCATE` grant | `db/migrate.ts:95,105` | 📄 | olib tashlash (testlar uchun alohida rol) |
| PL-03 | M❔ | CI superuser `DATABASE_URL` → integration testlar RLS'ni sinamaydi | `ci.yml:39` | ❔ | app-rol bilan test |
| PL-04 | M | CI'da OpenAPI contract-drift tekshiruvi yo'q | `ci.yml` | 📄 | `generate:contract` + `git diff --exit-code` |
| PL-05 | M | Rate-limit `X-Forwarded-For`ga ishonadi | `rate-limit.ts:42`, `audit-logger.ts:36` | 📄 | trusted-proxy sozlamasi |
| PL-06 | M | `/metrics` autentifikatsiyasiz (desktop'da LAN'ga ochiq) | `app.ts:154` | 📄 | token yoki faqat localhost |
| PL-07 | M | i18n parity testi yo'q (hozir 1208=1208) | `packages/i18n` | 📄 | test |
| PL-08 | M❔ | CI `startup_failure` (eski qayd) | — | ❔ | tekshirish |
| PL-09 | L | `APP_ROLE_PASSWORD` default | `migrate.ts:66` | 📄 | prod'da majburiy |
| PL-10 | L | Raw `fetch` `activate`/`reset-owner-password` sahifalarida (CLAUDE.md'da istisno yozilmagan) | — | 📄 | hujjatlashtirish |
| PL-11 | L | Markaziy domain-error → status mapper yo'q | — | 📄 | — |
| PL-12 | L | Mutation toast'ida server `error.message` xom | `query-client.ts` | 📄 | kod → i18n |
| PL-13 | L | 4xx'da ham `retry: 1` | `query-client.ts` | 📄 | 4xx'da retry yo'q |
| PL-14 | L | CI `MINIO_*` eskirgan; prod `minio:latest` pinlanmagan | `ci.yml:41`, compose | 📄 | tozalash |
| PL-15 | L | Pre-commit to'liq typecheck (sekin) | `.githooks` | 📄 | — |
| PL-16 | L | Hardcoded `'Русский'` (endonim), `DesignSystemPage` `Yangi` | — | 📄 | — |

## 10. Tashqi texnik (lab)

To'liq: [`LAB-TECHNICIAN-ACCESS-2026-11-11.md`](./LAB-TECHNICIAN-ACCESS-2026-11-11.md). **Qaror:** C varianti (lab portali) — dizayn jarayonida.

| ID | J | Topilma | Ish |
|---|---|---|---|
| LB-01 | M | Technician boshqa lablarning buyurtmalarini ko'radi (`labName` erkin matn) | C dizayni (`labs` obyekti) |
| LB-02 | M | Technician'da `patient.view` — butun bemor ro'yxati | **darhol:** shablondan olib tashlash + tor endpoint |
| LB-03 | M | Technician buyurtma yaratadi, narxni o'zgartiradi, `delivered` qiladi | rolga bog'langan o'tishlar |
| LB-04 | M | Desktop'da tashqi texnik kira olmaydi | C + D1 relay |
| LB-05 | L | Buyurtmaga fayl yo'q; xabarnoma yo'q; `branchId` yo'q | C dizayni |

---

## 11. Yig'ma ishlar ro'yxati (bosqichlar)

| Bosqich | Mazmun | ID'lar |
|---|---|---|
| **1. Ma'lumot yaxlitligi (darhol)** | P1 + regressiya testi | P1 |
| **2. Yozilish oqimi** | P3 commit + kontrakt testi; side-effect'larni commit'dan keyin | P3, P4, SC-06, SC-15, SC-16, SC-17 |
| **3. Reliz oldidan (desktop/cloud)** | migratsiya, NSIS, uploads volume + backup, grace qarori, tray ikonka, port | P2, P14, P17, P18, DT-01, DT-02, DT-03 |
| **4. Xavfsizlik** | rol eskalatsiyasi, tenantlararo reset, POS reja, Telegram, refresh `typ`, parol loglari, technician `patient.view` | P5, P6, P7, P8, ID-01, ID-04, ID-05, ID-08, LB-02, PL-02, PL-05, PL-06 |
| **5. Foydalanuvchi oqimlari** | recall NoOp, workHours, rasmlar, Zod partial, Accountant kassa, RBAC gap'lar | P9–P13, ID-03, ID-11, ID-12, IR-04, IR-10, IR-13, CL-04, SC-04, SC-10 |
| **6. Ishonchlilik/operatsiya** | supervision, Supervisor TLS/backup/renew/audit | P15, P16, SV-01…SV-07, DT-04…DT-18 |
| **7. Sifat va qarz** | PII maskalash, pagination/100 chegaralari, UTC sanalar, i18n, testlar | PT-*, SC-01/02/22, MO-06, IR-11, MO-23, PL-04, PL-07, *-T |
| **8. Mahsulot (rejalashtirish)** | Lab portali (C + D1) | LB-* |
| **9. UI qayta dizayni** | Kanvasdagi 24 ta ekranni kodda qurish (UI-0 → UI-4) | UI-* (§12) |

---

## 12. UI qayta dizayni — ishlar (kanvas → kod)

> **Manba:** kanvas https://claude.ai/artifact/71dFMTtcyyMFE5yZhGSDZ3 · repo nusxasi [`docs/design/ui-redesign-2026-11/canvas/`](./design/ui-redesign-2026-11/canvas/).
> **To'liq spetsifikatsiya:** [`docs/superpowers/specs/2026-11-11-ui-redesign-design.md`](./superpowers/specs/2026-11-11-ui-redesign-design.md) — har ekran uchun kod fayllari, backend ishi va qabul mezonlari.
> **Holat:** dizayn tayyor, kod yozilmagan. Har bosqichdan oldin `superpowers:writing-plans`.

| ID | Bosqich | Ekran (artboard) | Oldin bajarilishi shart |
|---|---|---|---|
| UI-00 | UI-0 | Tokenlar (`Tokens.dc.html`): 15px matn, kontrast, 44/60px | — |
| UI-01 | UI-0 | Komponentlar (`Components.dc.html`): StatusPill 6 ma‘no, AlertTier, CriticalActionDialog, UndoToast, StateView.forbidden, ConnectionStatus, UpdateBanner | — |
| UI-02 | UI-0 | Rolga moslashuvchi menyu (`Sidebar.dc.html`) | — |
| UI-R1 | UI-1 | Bugun — registrator (`Main.dc.html`) | P10; T2 bilan `booking_requests` |
| UI-R2 | UI-1 | Kalendar (`Calendar.dc.html`) | SC-01/02/03; kreslo modeli (qaror) |
| UI-R3 | UI-1 | Yangi yozilish (`Booking.dc.html`) | SC-07, P10 |
| UI-R4 | UI-1 | Navbat (`Queue.dc.html`) | SC-09, SC-10 (qaror) |
| UI-R5 | UI-1 | Kassa (`Cashier.dc.html`) | P7, P13, MO-02, QR to‘lov usuli |
| UI-R6 | UI-1 | Bemorlar (`Patients.dc.html`) | PT-01…04, dublikat tekshiruvi |
| UI-D1 | UI-2 | Mening kunim (`DoctorDay.dc.html`) | — |
| UI-D2 | UI-2 | Bemor kartasi (`Patient.dc.html`) | P11, anamnez `confirmedAt` |
| UI-D3 | UI-2 | Tish xaritasi (`Odontogram.dc.html`) | CL-01, tashxis qidiruvi |
| UI-D4 | UI-2 | Vizit yozuvi (`VisitNote.dc.html`) | **P12**, CL-12 |
| UI-D5 | UI-2 | Lab buyurtma (`LabOrder.dc.html`) | lab_orders sxemasi (shade, due, files, remake) |
| UI-M1 | UI-3 | Rahbar bosh sahifasi (`OwnerDashboard.dc.html`) | P13, zaxira nusxa holati |
| UI-M2 | UI-3 | Hisobotlar (`Reports.dc.html`) | IR-06 |
| UI-M3 | UI-3 | Sozlamalar (`Settings.dc.html`) | P10, P9, P16 (renew) |
| UI-M4 | UI-3 | Xodimlar (`Staff.dc.html`) | **P5**, ID-04/05/06/28/29 |
| UI-M5 | UI-3 | Ombor (`Stock.dc.html`) | IR-01, IR-02 |
| UI-M6 | UI-3 | Xarajat va ish haqi (`Finance.dc.html`) | — |
| UI-T1 | UI-4 | Laboratoriya portali (`LabPortal.dc.html`) | lab portali spetsifikatsiyasi (C) |
| UI-T2 | UI-4 | Telegram bot (`TelegramBot.dc.html`) | **P8** |
| UI-T3 | UI-4 | Desktop holatlari (`Desktop.dc.html`) | **P2, P14, P15**, DT-01/02/03/18 |

---

## 13. P bosqichi 1 (2026-11-11) dan keyingi follow-up'lar

| ID | J | Qisqa | Qilinadigan ish |
|---|---|---|---|
| FU-01 | M❔ | 23P01 → 409 amalda 500 bo'lishi mumkin | verifier: tx ichida savepoint'siz ushlangan DB xatosidan keyin COMMIT yiqilib klientga 500 boradi (eski xulq, regressiya emas). `appointments-patient-overlap` testi `patient_busy` kutadi va o'tadi — **real route orqali tasdiqlash kerak**; tasdiqlansa insert'ni savepoint (`tx.transaction`) ichiga olish |
| FU-02 | M | Ichma-ich `rlsMiddleware` (`/api` prefiksi) | `expenses`/`clinical`/`patient-images` bare `/api`ga `app.use('*', auth, rls)` bilan ulangan → har so'rov 2–3 tranzaksiya (pool bosimi) va ichki `afterCommit` ro'yxati tashqi commit'dan oldin ishlaydi. Hozir u modullarda afterCommit yo'q. Yechim: rls'ni idempotent qilish (allaqachon `db` tx bo'lsa qayta ochmaslik) |
| FU-03 | L | tx ichidagi boshqa side-effect'lar | `notifications.notifyInTx` SMS'ni tx ichida yuboradi (`stock.service.ts:70` low-stock) — 500 bo'lsa SMS ketadi, yozuv rollback. `onAfterCommit`ga ko'chirish |
| FU-04 | L | Yangi qoida | throw (shu jumladan `HTTPException`/`ZodError` 4xx) endi yozuvlarni rollback qiladi. 4xx'da audit/strike qatori saqlanishi kerak bo'lgan kod `fail()` **qaytarishi** shart, throw emas |

> 🟡 = kod tayyor, Windows'da tekshirilmagan (P bosqichi 2, 2026-11-11). Tekshiruv ro'yxati: `docs/DESKTOP-WINDOWS-BUILD-TEST.md` §4b.

## 14. P bosqichi 2 dan keyingi follow-up'lar

| ID | J | Qisqa | Qilinadigan ish |
|---|---|---|---|
| FU-05 | L | `/api/license/recheck` ochiq | auth'siz (blok ekrani uchun), 6/daqiqa per-IP rate limit bilan. LAN ichida suiiste'mol = Supervisor'ga heartbeat oqimi; kerak bo'lsa global limit |
| FU-06 | L | P2 restore oxirgi chora | DROP+CREATE+`pg_restore --single-transaction`: tiklash ham yiqilsa baza bo'sh qoladi (dump fayli saqlanadi, dialogda yo'li ko'rsatiladi) — qo'lda tiklash runbook'i kerak |
| FU-07 | L | `mock.module` oqishi o'syapti | `license*.test.ts` va `cli-358` endi har biri o'z bun jarayonida yurgizilishi kerak (test skripti darajasida ajratish) |

## 15. P bosqichi 4 dan keyingi follow-up'lar

| ID | J | Qisqa | Qilinadigan ish |
|---|---|---|---|
| FU-08 ✅ | H | Rozisiz invite → hisobni egallash (P6 qoldig'i) — bosqich 4b da yopildi | 👤 qaror: mavjud platforma foydalanuvchisini taklif qilish «kutilmoqda» holatida, foydalanuvchi qabul qilgach a'zo — **bosqich 4b** |
| FU-09 | L | `user.manage` egasi yuqori huquqli xodimning tayinlovini o'chira/filialini o'zgartira oladi | eskalatsiya emas, lekin «yuqoridagini o'chirish»; kerak bo'lsa `assertCanGrant`ni remove/branch-change'ga ham |
| FU-10 | L | Reset qilingan xodimning mavjud access token'i ≤15 daqiqa `pwc`siz | Redis denylist (JWT staleness qarori) |

## 16. P bosqichi 5 dan keyingi follow-up'lar

| ID | J | Qisqa | Qilinadigan ish |
|---|---|---|---|
| FU-11 | L | NoOp tenant'da har recall scan'da `skipped_no_channel` log qatori | dedupe yoki faqat holat o'zgarganda yozish |
| FU-12 | L | Eskiz bor, bemor telefoni yo'q → `skipped_no_channel` (avval `no_phone`) | outcome tartibini aniqlashtirish (diagnostika) |
| FU-13 | L | Filial formasida ochilish < yopilish validatsiyasi yo'q; `doctor_on_time_off` matni hardcoded | UI-3 (Sozlamalar) bilan |
| FU-14 | M | P11 haqiqiy brauzer/Electron'da tekshirilmagan (jsdom + API) | UI-2 (Bemor kartasi) Playwright sinovida |

## 17. Brauzer sinovi (2026-11-11, haqiqiy Chromium, API web'ni o'zi serve qiladi — real CSP)

✅ Tasdiqlandi: majburiy parol almashtirish; B klinika takliflar kartasi; bemor kartasida rasm (`blob:`, real CSP) — **P11 ✅**; `/uploads` Accountant 403 / Doktor 200 / auth'siz 401; Branch Manager → Tenant Admin 403; yangi klinikada bo'sh slot + bron 201 (**P10**); Accountant kunlik kassa 150 000 − 50 000 = 100 000 (**P13**).
Sinov 3 ta haqiqiy nuqson topdi (hammasi tuzatildi, testlar bilan): (1) jadvali yo'q doktorga bron qilib bo'lmasdi — P10 testi doktor jadvalini qo'lda qo'shib yashirgan edi; (2) bitta workspace'li foydalanuvchi taklif kartasini ko'rmasdi (avto-redirect); (3) tenant-wide xodim/owner `abid=null` → kunlik kassa bo'sh (switch-workspace endi standart filial tanlaydi).

| ID | J | Qisqa | Qilinadigan ish |
|---|---|---|---|
| FU-15 | M | Telefonni oldindan ro'yxatdan o'tkazish (P6 qoldiq xavfi) | klinika platformada hali yo'q telefon uchun hisob yaratib, vaqtinchalik parolni bilib qoladi; keyin o'sha odam boshqa klinika taklifini olsa, birinchi klinika uning nomidan kirib qabul qilishi mumkin. Yopish = telefon egaligini tasdiqlash (SMS/Telegram OTP) — 👤 qaror kerak |
| FU-16 | L | Kassa xulosasi «cash · payment» tarjimasiz | UI-1 Kassa ekrani bilan |
| FU-17 | L | Filial bo'yicha availability (FreeSlotsCard) jadvalsiz doktorni ko'rsatmaydi | single-doctor availability'dagi fallback filial-darajasiga ham |

