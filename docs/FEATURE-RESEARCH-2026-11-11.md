# Feature tadqiqoti — 2026-11-11

> **Usul.** Loyiha 9 ta domenga ajratildi. Har domenni alohida o'qish-rejimli agent kod bo'yicha kuzatdi: route → service → repository → jadval va ekran → hook. Agentlar kodni o'zgartirmadi, DB/Docker ishga tushirmadi. Eng jiddiy topilmalarni controller **qayta tekshirdi**. **Bu hisobot kod o'zgartirmaydi.**
>
> **Holat (tadqiqot paytida):** `main` = `origin/main` + 1 (`117b587 wip` — fingerprint keshi, push qilinmagan) + commit qilinmagan `apps/api/src/lib/queue.ts` (reminder jobId `:` → `-`).
> Tekshiruv natijalari:
> - typecheck: 16/16 o'tdi.
> - biome: exit 0 (46 warning).
> - `check:rls`: 38 jadval.
> - web vitest: 118 fayl, 539 test o'tdi.
> - `license.test.ts`: 21/21 o'tdi.
> - API integration, desktop va supervisor testlari **ishga tushirilmadi** (infra ko'tarilmagan).
>
> **Dalil belgilari:**
> - ✅✅ — controller ishga tushirib tasdiqladi (probe);
> - ✅ — controller kodni o'qib tasdiqladi;
> - 📄 — agent koddan tasdiqladi (controller qayta tekshirmagan);
> - ❔ — ehtimoliy (runtime/Windows'da tekshirish kerak).

---

> 📋 **Barcha topilmalar (≈250 ta, ID + joy + qilinadigan ish):** [`FINDINGS-REGISTER-2026-11-11.md`](./FINDINGS-REGISTER-2026-11-11.md). Tashqi texnik tadqiqoti: [`LAB-TECHNICIAN-ACCESS-2026-11-11.md`](./LAB-TECHNICIAN-ACCESS-2026-11-11.md).

## 1. Ustuvor topilmalar (birinchi navbatda)

| # | Jiddiylik | Topilma | Joy | Dalil |
|---|---|---|---|---|
| P1 | **Critical** | **500 xatoda RLS tranzaksiyasi COMMIT bo'ladi.** `app.onError` o'rnatilgani uchun Hono handler xatosini o'zi ushlaydi va `await next()` throw qilmaydi. Natijada `rlsMiddleware`dagi `catch → rollback` hech qachon ishlamaydi. Handler qisman yozib bo'lib yiqilsa, yarim ma'lumot bazada qoladi. 25 modulning hammasiga taalluqli. | `apps/api/src/middleware/rls.ts:32-42`, `app.ts:340` | ✅✅ Hono 4.12.18 probe: parent va sub-app holatida `catch fired = false`, status 500 |
| P2 | **Critical** (desktop) | **Yangilanishda migratsiyalar ishga tushmaydi.** `runMigrations` faqat first-run'da chaqiriladi. Yangi versiya eski sxema ustida boot bo'ladi. | `apps/desktop/src/main.ts:286-293` | ✅ |
| P3 | **High** | **Reminder jobId `appointment:<uuid>`ni BullMQ 5.78 rad etadi.** `enqueueReminder` tx ichida catch'siz chaqiriladi. P1 tufayli natija rollback emas: **yozilish saqlanadi, foydalanuvchi 500 ko'radi**, qayta urinsa 409 `doctor_busy` oladi. Eslatma esa hech qachon qo'yilmaydi. Bug `be7b7fd` (2026-06-21) dan beri mavjud. Fix commit qilinmagan, regressiya testi yo'q. | `lib/queue.ts:30`, `appointments.service.ts:331,513` | ✅ (BullMQ manbasi) |
| P4 | **High** | Redis/BullMQ side-effect'lari tx ichida catch'siz. Redis ishlamasa **har qanday cancel/no_show** (`removeReminder` shartsiz), queue `missed` va `sweepNoShows` 500 qaytaradi. P1 tufayli DB o'zgarishi esa commit bo'lib qoladi. | `appointments.service.ts:510,524`, `queue.service.ts:232,422`, `app.ts:219-249` | 📄 |
| P5 | **High** | **Rol eskalatsiyasi.** `invite`/`addAssignment` rolning chaqiruvchi huquqidan oshmasligini tekshirmaydi. `user.invite`ga ega Branch Manager API orqali o'ziga Tenant Admin rolini biriktira oladi. | `users.service.ts:68,212` | ✅ |
| P6 | **High** (cloud) | **Tenantlararo parol tiklash.** `resetUserPassword` faqat *faol* tenant owner'ini himoya qiladi. Users platform darajasida, shuning uchun A klinika admini B klinikaning owner'i/admini parolini tiklashi mumkin (agar u A'da xodim bo'lsa). | `users.service.ts:334-363` | ✅ |
| P7 | **High** | **POS `items` rejimida `treatmentPlanId`/`patientId` tekshirilmaydi** (CLI-460 faqat `allocations` yo'lini yopgan). Erkin sotuvni istalgan rejaga bog'lash mumkin: u bemor balansidan chiqib ketadi va boshqa doktorga komissiya yoziladi. | `cashier.service.ts:303-343` | ✅ |
| P8 | **High** | **Telegram kontakt egaligi tekshirilmaydi** (`contact.user_id !== ctx.from.id`). Begona telefonni yuborib bemorning chat'ini o'g'irlash va eslatma PHI'sini olish mumkin. | `telegram-bot-manager.ts:45-64` | ✅ |
| P9 | **High** | **Kanal sozlanmagan tenantda recall'lar «yuborildi» deb belgilanadi.** NoOp `ok:true` qaytaradi, natijada `recall_logs.outcome='sent'` va recall `contacted` bo'ladi, aslida hech narsa yuborilmagan. Standart holatda **barcha** due recall'lar jim yo'qoladi. | `packages/notifications/src/noop.ts:10`, `recall-worker.ts:185,213` | ✅ |
| P10 | **High** | **Yangi tenantda bron qilib bo'lmaydi.** Provisioning/register filialni `workHours=null` bilan yaratadi, web'da `workHours` UI umuman yo'q. Natija: availability `[]` va `POST /appointments` → 409 `outside_working_hours`. | `auth.service.ts:160-168`, web grep = 0 | ✅ |
| P11 | **High** | **Bemor rasmlari ko'rinmasligi ehtimoli.** `<img src="/uploads/...">` Bearer header yubormaydi, `/uploads` esa faqat `Authorization: Bearer` qabul qiladi (query/cookie yo'q) → 401. | `ImageCard.tsx:54`, `uploads.ts:31`, `middleware/auth.ts:23` | ✅ statik, ❔ brauzerda |
| P12 | **High** | **Zod 4 `.partial()` default'larni qo'llaydi.** `PATCH /visit-notes {freeNotes}` → `performedServices: []`, `assessmentDiagnoses: []`. Diagnozlar o'chadi va `reconcileStock` BOM'ni omborga to'liq qaytaradi. Consent template PATCH `isActive`ni qayta `true` qiladi. Web forma to'liq qiymat yuborgani uchun UI'da ko'rinmaydi. | `visit-notes.schema.ts:20`, `consent.schema.ts:14,18` | ✅✅ probe |
| P13 | **High** | **Hisobchi dashboard'i kunlik kassada refund'ni qo'shadi**, ayirmaydi. | `AccountantDashboard.tsx:128-135` + `cashier.service.ts:645` | ✅ |
| P14 | **High** (desktop) | NSIS har o'rnatishda, jumladan yangilashda ham, `config.json`ni `{"role":…}` bilan qayta yozadi: `serverPort`/`serverUrl` yo'qoladi, rol dialogi qayta chiqadi. | `apps/desktop/build/installer.nsh:8-21` | ✅ |
| P15 | **High** (desktop) | Child process (postgres/valkey/api) crash bo'lsa, avto-restart ham, UI signali ham yo'q (`getServerStatus` hech qayerda ishlatilmaydi). Windows'da `SIGTERM` = hard kill, `before-quit` kutilmaydi. | `process-manager.ts:83-97`, `main.ts:475` | 📄 |
| P17 | **Critical** (cloud) | **Bulutda bemor fayllari vaqtinchalik.** `s3.ts` hamma rejimda lokal fayl adapteriga delegatsiya qiladi (`UPLOADS_DIR`), lekin `docker-compose.prod.yml`da `api` uchun uploads volume'i yo'q. Konteyner qayta yaratilganda (har deploy'da) rasmlar yo'qoladi. `infra/backup.sh` esa endi ishlatilmaydigan MinIO bucket'ini `mc mirror` qiladi, ya'ni fayllar backup'ga kirmaydi. | `lib/s3.ts:10`, `infra/docker-compose.prod.yml:26-60,198`, `infra/backup.sh:41-43` | ✅ |
| P18 | **High** (desktop) | **Offline grace dizayndan farq qiladi.** Spec (`08-Desktop-Offline-Supervisor-Design.md` §4) «30 kun internetsiz → faqat asosiy modullar» deydi. Kod boshqacha ishlaydi: grace **oxirgi heartbeat'dan emas, `expiresAt`dan** hisoblanadi (`now < expiresAt + grace`). Muddat tugaguncha internet umuman shart emas. Muddat + grace tugagach **barcha** gated modullar (bemor, yozilish, kassa, klinik…) 403 `LICENSE_NOT_FOUND` beradi, gate'siz modullar (ombor, xarajat, payroll, schedule) esa ishlashda davom etadi — «asosiy modullar»ning teskarisi. Supervisor'da renew endpoint'i yo'qligi (P16) bilan birga: har klinika `expiresAt+30` kunda **qattiq to'xtaydi** va mahsulot ichida chiqish yo'li yo'q. | `apps/api/src/lib/license.ts:171-175,211-233`, `license-middleware.ts:26-41` | ✅ |
| P16 | **High** (Supervisor) | Supervisor HTTP-only (IP rejim). Shu kanalda admin JWT, vaqtinchalik owner paroli va provisioning bloki ochiq yuradi. Supervisor DB va RSA private key uchun **backup yo'q**. Litsenziya muddatini uzaytirish (renew) endpoint'i/UI'si yo'q. | `infra/supervisor/Caddyfile.ip`, grep `pg_dump` = 0 | 📄 |

**O'rta darajadagi muhim topilmalar** (tafsilot domen bo'limlarida):
- Refresh token access o'rnida qabul qilinadi (`typ` claim yo'q). ✅
- `check-rls-coverage` ko'p jadvalli 5 ta schema faylining 2-jadvalini tekshirmaydi. ✅
- App roliga `TRUNCATE` grant berilgan.
- CI superuser DB URL bilan ishlaydi, RLS amalda sinalmaydi.
- Rate-limit `X-Forwarded-For`ga ishonadi. Desktop'da esa hamma bitta `unknown` bucket'ga tushadi.
- `/metrics` autentifikatsiyasiz.
- PII maskalash tizimli emas: PATCH javobi, emergency contact, qidiruv oracle'i, maskalangan qiymatni qayta yozish.
- Audit `before/after` maskalanmaydi: shifrlangan kredensial ciphertext'i, ish haqi.
- Fiscal `fetch` timeout'siz va stage qulflari ostida tx ichida.
- Kalendar va queue 100-bemor/100-yozilish chegarasida ma'lumotni jimgina yashiradi.

---

## 2. Takrorlanuvchi naqshlar (tizimli ildizlar)

1. **Tashqi side-effect DB tranzaksiyasi ichida, catch/timeout'siz.** Uchraydigan joylar: BullMQ enqueue/remove, Telegram/Eskiz `fetch` (`notifyInTx`), fiscal `fetch`, Redis `publish('telegram:reload')` (commit'dan oldin). P1 bilan birga bu xavf yanada oshadi: xato DB'ni ham rollback qilmaydi. **Yagona yechim naqshi:** commit'dan keyin best-effort yoki outbox, hamma `fetch`da `AbortSignal.timeout`.
2. **Spy-dep testlari real infra cheklovlarini yashiradi.** Misollar: BullMQ jobId, Hono `onError` semantikasi, Zod `.partial()` (servis to'g'ridan chaqirilgani uchun HTTP qatlami sinalmagan). Har bir adapter va schema uchun kamida bitta real HTTP/real-instance testi kerak.
3. **RBAC «ekran ↔ endpoint» bo'shlig'i** (CLI-153, M8, CLI-157, 07-08 dan keyin yana takrorlandi):
   - Branch Manager invite: `role.view` yo'q, rol Select'i bo'sh.
   - Hamma rol «Sozlamalar»ni ko'radi (`tenant.view`), lekin ekran `tenant_settings.view`/`user.view` talab qiladi. 403 bo'lganda default qiymatlar haqiqiy ma'lumotdek ko'rinadi (`vertical: 'dental'`).
   - Nurse → `GET /services` 403 (Stock BOM).
   - Accountant → `useDoctors` (`appointment.view` yo'q).
   - `OnboardingChecklist` hook'lari permission tekshiruvidan oldin chaqiriladi.
   - `/rx` route `medical_record.view` bilan, API esa `prescription.view` bilan himoyalangan (CLI-439 B3 hali ochiq).
   - Tenant Admin owner-only «egalikni o'tkazish» kartasini ko'radi.
   - Doctor `PATCH {status:'cancelled'}` bilan `appointment.cancel`ni chetlab o'tadi.
4. **Tashkent sanasi o'rniga UTC (`toISOString().slice(0,10)`).** Joylar:
   - `services.service.ts:45,179,224` (narx `validFrom`);
   - `ExpenseFormModal.tsx:19`;
   - `dashboard.api.ts:16` (`useDefaultPeriod`);
   - `cashier.routes.ts:238` (default sana);
   - `patients.schema.ts:42`;
   - recall cron `tz`siz (Windows desktop'da 06:00 mahalliy vaqt `sendHour` darvozasidan o'tmasligi ❔).

   Har birida Tashkent 00:00–05:00 oralig'ida bir kunlik siljish bo'ladi.
5. **Backend tayyor, UI yo'q (dormant):**
   - CLI-487/488 (stage↔lab gate, stage↔odontogram);
   - vizit shablonlari;
   - appointment reschedule/confirm/no-show/complete (faqat cancel bor);
   - assignment PATCH;
   - filial `workHours`;
   - `sweepNoShows` (cron ulanmagan);
   - `cashier.void`, `user.deactivate` — o'lik permission'lar.
6. **Ikki nusxali formulalar:**
   - bemor balansi (`patients.service` `list` va `balanceFor` + `cashier.billing`);
   - MODULE_MAP (supervisor-admin UI ro'yxati backend lug'atidan farq qiladi: `erp/inventory/branches` bor, `expenses/stock/notifications/schedule/recalls` yo'q).

---

## 3. Feature xaritasi

Yetuklik: 🟢 ishlaydi · 🟡 qisman · 🟠 scaffold/dormant · 🔴 asosiy oqim buzilgan.

| Domen | Feature | Yetuklik | Asosiy topilma |
|---|---|---|---|
| Identity | Login | 🟢 | timing enumeration; API `min(12)` ↔ web `min(1)` |
| | Refresh/logout/JWT | 🟢 | refresh=access (`typ` yo'q); `deletedAt` tekshirilmaydi; test yo'q |
| | Rate-limit | 🟢 | XFF'ga ishonadi; `change-password` limitsiz |
| | Workspace switch | 🟢 | `roleKey = assignments[0]` deterministik emas |
| | Filial switch | 🟢 | — |
| | Invite + xodimlar | 🟡 | **P5**; BM rol Select bo'sh; temp parol log'da ochiq |
| | Admin parol reset | 🟢 | **P6**; yangi parol log'da; test yo'q |
| | Profil/parol | 🟡 | audit yo'q; Zod xabarlari i18n'siz |
| | Rol builder | 🟢 | biriktirilgan rolni o'chirish → 500; `setPermissions` noma'lumni jim tashlaydi |
| | Tenant sozlamalari | 🟢 | `vertical` `z.string()` (enum emas); RBAC default-ko'rsatish |
| | Filiallar | 🟢 | telefon kanonik emas |
| | Integratsiyalar | 🟢/🟠 | audit'da ciphertext; Soliq/1C kartalari scaffold |
| | Audit ko'ruvchi | 🟡 | owner UUID bo'lib ko'rinadi; login hodisalari ko'rinmaydi; `from`/`to` bittasi bo'lsa filtr ishlamaydi |
| | Register-tenant | 🟢 | `workHours=null` (**P10**) |
| Bemorlar | Reyestr/qidiruv | 🟢 | `%`/`_` escape yo'q; PII qidiruv oracle'i |
| | Yaratish/tahrir | 🟡 | PATCH javobi maskalanmaydi; maskalangan qiymat qayta yoziladi; sug'urta/tags/source tahrirlanmaydi |
| | Telefon normalizatsiya | 🟢 | 10 xonali `0901…` → `+0901…` |
| | Bemor kartasi | 🟢 | payments `tx.status` xom ko'rsatiladi |
| | Tibbiy karta + tarix | 🟢 | `anamnez`/`bloodType`ni tozalab bo'lmaydi; `testResults` UI'si yo'q |
| | Qarindoshlar | 🟢 | arxivlangan bemor bog'lanadi |
| | Favqulodda kontakt | 🟡 | telefon maskalanmaydi; PATCH yo'q |
| | Balans | 🟢 | ikki nusxa formula |
| | No-show strikes | 🟢 | desktop modul gate yo'q |
| | PII maskalash | 🟡 | maskalash testi yo'q |
| Yozilish | Kalendar | 🟡 | 100 bemor/100 yozilish chegarasi; status UI faqat cancel |
| | Wizard + double-booking | 🔴 (yangi tenant) | **P10**; o'tgan slot → umumiy xato; i18n literal |
| | State machine | 🟡 | Doctor PATCH orqali cancel; qayta faollashganda eslatma qo'yilmaydi |
| | Doktor jadvali/time-off | 🟢 | ustma-ust segment/yozilish ziddiyati tekshirilmaydi |
| | Navbat ↔ yozilish | 🟡 | `{ok:false}` yutiladi → yozilish hech qachon `completed` bo'lmaydi; Doctor `queue.manage`siz; sweep cron yo'q |
| | Recall | 🟡 | **P9**; `contacted` ro'yxatda ko'rinmaydi; cron TZ ❔ |
| | Eslatmalar | 🔴 (fix commit qilinmagan) | **P3/P4**; <24 soat qolgan yozilishga eslatma yo'q |
| | Telegram bog'lash | 🟡 | **P8** |
| | SMS kanali | 🟢 | har SMS uchun alohida Eskiz login; `from: '4546'` hardcoded |
| | In-app bildirishnoma | 🟢 | 60 s polling |
| Klinik | Odontogram | 🟢 | `general` vertikalda ham auto-snapshot; uz matn DB'ga yoziladi |
| | Reja + bosqichlar | 🟢 | stage `toothNumbers` FDI tekshiruvisiz; reja avto-`completed` bo'lmaydi |
| | Stage↔lab (CLI-487) | 🟠 | UI yo'q |
| | Stage↔odontogram (CLI-488) | 🟠 | UI yo'q |
| | Vizit yozuvlari | 🟡 | **P12** |
| | Vizit shablonlari | 🟠 | faqat backend |
| | ICD-10 | 🟢 | katalog 100 dan oshsa web kesadi (latent) |
| | Retseptlar | 🟢 | `/rx` route permission mismatch |
| | Konsent | 🟢 | **P12** (`isActive`) |
| | Lab orders | 🟢 | `overdue` pagination'siz |
| | Bemor rasmlari | 🔴❔ | **P11**; `/uploads`da `patient_image.view` va audit yo'q |
| Pul | POS | 🟢 | **P7**; UI narx tahriri serverda e'tiborsiz qoladi |
| | Reja bo'yicha to'lov | 🟢 | parallel to'lov testi yo'q |
| | Refund | 🟢 | `paid=0` sotuvni bekor qilib bo'lmaydi; to'liq refund'dan keyin ham tugma ko'rinadi |
| | Balans | 🟢 | non-plan qarzni yopish yo'li yo'q |
| | To'lov usullari | 🟢 | POS'da `other` yo'q; split payment yo'q |
| | Fiscal | 🟠 | timeout yo'q, tx ichida; `cancelReceipt` yo'q |
| | Kunlik kassa | 🟡 | smena/kassir bo'yicha ajratish yo'q |
| | Xizmatlar/narxlar | 🟢 | UTC sana; bir kunda ikki `setPrice` → teskari interval |
| | Kategoriyalar | 🟢 | `update` dublikat → 500 |
| | Payroll | 🟢 | komissiya *joriy* reja doktoriga beriladi; filial bo'yicha ajratilmaydi |
| | Xarajatlar | 🟢 | UTC default sana |
| Ombor/hisobot | Stock items | 🟢 | boshlang'ich qoldiq ledger'ga yozilmaydi |
| | Harakatlar | 🟢 | item yo'q → 500; pagination UI yo'q |
| | Partiyalar | 🟡 | `expiringBatches` abadiy ogohlantiradi |
| | BOM auto-deduct | 🟢 | Nurse `GET /services` 403 |
| | Low-stock alert | 🟢 | matn uz hardcoded |
| | Daromad hisoboti | 🟢 | `Σ byService ≠ total` (refund davri); branch scoping server tomonda majburlanmaydi |
| | Qabul statistikasi | 🟢 | capacity faqat yozilishi bor doktorlarni sanaydi |
| | Dental analitika | 🟢 | retention formulasi noodatiy; margin qty-vaznsiz |
| | 1C eksport | 🟠 | `;` escape qilinmaydi; format provizional |
| | Rol dashboardlari | 🟡 | **P13**; UTC period; Receptionist'da bemor `'—'` |
| | Onboarding | 🟡 | 403 so'rovlar; qadamlar doim «bajarilgan» bo'lishi mumkin |
| Desktop | Installer | 🟡 | **P14**; tray ikonka paketga kirmaydi ✅; firewall qoidasi yo'q |
| | First-run | 🟢 | **P2**; `spawnSync` UI'ni qotiradi |
| | Process supervision | 🔴 | **P15**; port 80/5433/6380 to'qnashuvi faqat log'da |
| | LAN discovery | 🟡 | virtual adapter IP; UDP `error` handler yo'q; reconnect loop to'xtab qoladi |
| | Aktivatsiya | 🟢 | fetch timeout yo'q; bitta `unknown` bucket'da 5/soat |
| | Bootstrap gate | 🟢 | fingerprint sovuq start + 2 s timeout ❔ |
| | `.lic` + fingerprint | 🟢 | in-flight dedup yo'q; `uuid/serial` barqarorligi ❔ |
| | Heartbeat | 🟢 | yangi `.lic` imzo tekshiruvisiz yoziladi |
| | Modul gating | 🟢 | o'qilmaydigan `.lic` → `LICENSE_NOT_FOUND`, sabab ko'rsatilmaydi |
| | Reinstall tiklash | 🟢❔ | `needsVendor` holatida forma yashirin, `.lic`ni qo'lda o'chirish kerak bo'lishi mumkin |
| | Owner parol reset | 🟢 | refresh token'lar revoke qilinmaydi |
| | Auto-update | 🔴 | hech qachon sinalmagan + P2 + P14 |
| | Tray/IPC | 🟡 | `applyServerUrl` health-check'dan oldin saqlaydi |
| Supervisor | Admin auth | 🟡 | 7 kunlik revoke qilib bo'lmaydigan JWT localStorage'da; parol almashtirish yo'q |
| | Klinika CRUD | 🟡 | update/delete yo'q; audit'da admin ID yo'q |
| | `/v1/activate` + imzo | 🟢 | public `/v1/*` rate-limit'siz |
| | Muddat/grace/revoke | 🟡 | **renew yo'q** |
| | Modul entitlement | 🟡 | UI↔backend modul ro'yxati farq qiladi |
| | Provisioned/heartbeat | 🟢 | `license_events` cheksiz o'sadi |
| | Prepare-reinstall | 🟢 | tayyorlangan kredensialni bekor qilib bo'lmaydi |
| | Reset token | 🟢 | `fingerprint` ustuni o'lik |
| | Landing/reliz | 🟡 | faqat IP Caddyfile'da; installer imzosiz va HTTP orqali |
| | Deploy/infra | 🟡 | **P16** |
| Platforma | Tenant izolyatsiya | 🔴 | **P1** |
| | RLS lint/role | 🟡 | 2-jadval tekshirilmaydi; `TRUNCATE` grant; CI superuser |
| | OpenAPI pipeline | 🟢 | CI'da contract-drift tekshiruvi yo'q |
| | Xato boshqaruvi | 🟢 | markaziy domain-error mapper yo'q |
| | Kuzatuv | 🟡 | `/metrics` ochiq |
| | i18n | 🟢 | uz=ru=1208 kalit, lekin parity testi yo'q |
| | Web shell | 🟢 | 4xx'da ham `retry: 1` |
| | CI | 🟡 | `startup_failure` (eski holat, bugun tekshirilmadi); `MINIO_*` eskirgan |

---

## 4. Domenlar bo'yicha tafsilot

Quyida har domenning qisqartirilgan xulosasi berilgan. To'liq agent hisobotlari ushbu sessiya transkriptida qoldi. Bu yerda faqat ishlatish uchun kerakli qism keltirilgan.

### 4.1 Identity & Access
- **Arxitektura:** `/api/auth` app-level RLS'siz (auth har route'da alohida); boshqa modullar `authMiddleware + rlsMiddleware`. Owner = `['@owner']`; `OWNER_ONLY` = `tenant.delete`, `tenant.transfer_ownership`.
- **Kuchli tomonlar:**
  - refresh rotatsiya + replay'da butun zanjirni revoke qilish;
  - `workspace-branches` RBAC-safe;
  - filial o'chirish guard'i (CLI-428);
  - egalik o'tkazish parol bilan va faol a'zoga (CLI-442).
- **Testlar yo'q:** `refresh()`, `logout()`, `change-password`, roles CRUD, admin reset, replay-detect.
- **Qo'shimcha topilmalar:**
  - `logout`, `switch-workspace`, `change-password` audit yozmaydi;
  - `login.failed` auditida xom telefon (PII) yoziladi, `tenant_id=NULL` bo'lgani uchun hech kim ko'rmaydi;
  - `updateAssignment` `roleId`/`branchId` tenantga tegishliligini tekshirmaydi (FK RLS'ni chetlab o'tadi);
  - `roles.service.ts:80-83` — bo'sh `if (isSystem) {}` bloki: tizim rollari erkin tahrirlanadi.

### 4.2 Bemorlar
- Oldingi audit (07-08) tuzatishlari ushlab turibdi: H1, H2, H3, H5/H6, M5, M6, L1/L3/L4/L5/L7/L8.
- **Yangi sinf — PII maskalash faqat GET'da:**
  - `PATCH` javobi xom (`patients.service.ts:450` → `routes.ts:208`);
  - emergency contact telefoni ochiq (`patients.mapper.ts:141`);
  - qidiruv maskalangan telefon/pasportni tekshirishga imkon beradi (`patients.search.ts:28-33`);
  - `GeneralEditForm` maskalangan `'***'`ni passport/address'ga qayta yozadi (`GeneralTab.tsx:157-217`).

  Standart shablonlarda `edit` har doim `view_pii` bilan birga keladi, shuning uchun xavf custom rollar va Nurse/Technician/Accountant'ga tegishli. Maskalash testi yo'q.
- **Tozalash semantikasi:** CLI-455 faqat patient'ni tuzatgan. Medical record'da `anamnez`/`bloodType` nullable emas, FE `|| undefined` yuboradi.
- **Sug'urta (V3-5):** tahrir formasida yo'q, `patient.edit` egasi ko'rmaydi ham.

### 4.3 Yozilish va xabarlar
- **Tuzatish (controller):** agent P3/P4'da «tx rollback» deb yozgan. P1 bo'yicha **haqiqiy natija commit** (yozilish/cancel saqlanadi, javob 500). Reschedule'da: `remove` o'tadi, `add` yiqiladi → yangi vaqt DB'da saqlanadi, eslatma yo'q.
- **Queue→appt:** `queue.service.ts:225-232` `{ok:false}` natijasini tekshirmaydi. `scheduled→in_progress` qayta validatsiya (time-off/ish soati) 409 qaytarsa jim yutiladi, keyin `scheduled→completed` ham yutiladi → yozilish hech qachon `completed` bo'lmaydi, preventiv recall yaratilmaydi.
- **Recall:**
  - `recalls.repository.ts:152-156`: `42P10` fallback aborted tx ichida yiqiladi (faqat 0031 qo'llanmagan muhitda);
  - recall worker'da `send` o'tib, keyin tx rollback bo'lsa → SMS ertasi kuni qayta ketadi.
- **Eslatmalar:** `delay<=0` → <24 soat qolgan yozilishga eslatma yo'q. `removeOnFail: 100` + bir xil jobId → keyingi `add` dublikat sifatida e'tiborsiz qolishi mumkin ❔.

### 4.4 Klinik
- Barcha clinical route'larda `requireModuleInDesktop`. Clinical va patient-images uchun gate auth'dan keyin ishlaydi (hujjatlashtirilgan og'ish).
- `/uploads`: path traversal va cross-tenant tuzatilgan (CLI-405), **qayta ochilmasin**. Lekin `patient_image.view` va fayl o'qish auditi yo'q (§3.10).
- Bosqich orqali yopishda (`/treatment-stages`) stock yechilmaydi, faqat vizit `performedServices` yechadi. Hujjatlashtirish kerak.
- Konsent: bemor imzosi faqat ism matni (chizma/hash yo'q). Nurse/Receptionist imzolata olmaydi (qasddanligi tasdiqlanmagan).

### 4.5 Pul
- Tasdiqlangan va ushlab turgan tuzatishlar:
  - overpay guard (`FOR UPDATE` + stageId tartibi);
  - refund qulfi + kumulyativ guard;
  - sentlarda proporsional negatsiya;
  - CLI-479 (`NOT EXISTS`);
  - CLI-406 yagona-iz modeli;
  - CLI-443/444;
  - CLI-452;
  - payroll overlap (service + EXCLUDE).
- **Ochiq:**
  - payroll hook `payroll_adjustments`ni audit'siz yozadi;
  - plan overpay guard float bilan solishtiradi (POS sentlarda);
  - `serviceName` client'dan keladi (chekda o'zgartirish mumkin);
  - expenses `branchId` boshqa tenant filiali bo'lishi mumkin (FK RLS'siz, amalda past xavf).

### 4.6 Ombor, hisobot, dashboard
- Branch scoping hisobot va dashboard'da server tomonda majburlanmaydi: `branch_manager` butun tenant daromadini ko'radi.
- `ReportsScreen` `key={p.serviceName}` — CLI-473 aynan bir xil nomli xizmatlarni ajratadi, natijada React key to'qnashadi.
- Hisobot va 1C eksport'da xom ingliz kodlari (`payment`/`refund`/`cash`) va hardcoded sarlavhalar bor.

### 4.7 Desktop va litsenziya
- **Fingerprint keshi (`117b587`) to'g'ri:** faqat muvaffaqiyat keshlanadi, `globalThis` Symbol, imzo solishtiruvi har chaqiruvda saqlanadi. **Qo'shimcha:**
  - in-flight promise dedup yo'q — sovuq startda 4 ta parallel WMI;
  - pre-warm tavsiya etiladi.
- **Rate-limit:** desktop'da proxy yo'q → hamma `unknown` bucket'da. `activate` 5/soat: bir necha noto'g'ri kalit yoki tarmoq xatosidan keyin klinika 1 soatga bloklanadi. Web `rate_limited` kodini bilmaydi.
- **Heartbeat:** gate signali `WEB_DIST_DIR`, modul gating signali `DENTAL_LOCAL_DESKTOP`. Ikki xil signal, nomuvofiq.
- **Backup:** `postgres\data` + `uploads` — mijozda yagona nusxa, backup yo'q.

### 4.8 Supervisor
- Imzo canonicalization (ikkala nusxa + seam test) va prepare-reinstall/`provisionedAt` mantiqi to'g'ri hamda yaxshi test qilingan.
- `.gitignore`da `.env.production` aniq ignore qilinmagan (hozir repo'da yo'q).
- `/bins/*` `file_server browse` — katalog ro'yxati ochiq.
- `/v1/provisioned` va `verifyReset` `isActive`ni tekshirmaydi.

### 4.9 Platforma
- Raw `db` request yo'lida bypass qilinmaydi (izolyatsiya yadrosi toza; istisno — pre-auth `reset-owner-password`, platform jadvallari).
- Raw `fetch(`: `lib/api.ts` (hujjatlashtirilgan), `activate.page.tsx`, `reset-owner-password.page.tsx` (pre-auth, lekin CLAUDE.md'da istisno sifatida qayd etilmagan).
- `APP_ROLE_PASSWORD` default `'dental_app_local_dev'` (`migrate.ts:66`); desktop `getOrCreateDbPassword` fallback'i ham shu parol.

---

## 5. Tekshirilmagan / ochiq savollar

- Windows E2E natijalari hujjatlanmagan, lekin `117b587` izohlari real Windows o'lchoviga tayanadi. Natijalar runbook/CLAUDE.md'ga yozilishi kerak.
- P11 (rasmlar) — real brauzerda bitta rasm ochib tasdiqlash kerak.
- Recall cron TZ — Windows desktop'da (Tashkent zonasi) skan `sendHour` darvozasidan o'tadimi?
- Fingerprint `uuid/serial` barqarorligi turli Windows PC'larda (`To Be Filled By O.E.M.` holati).
- CI hozir ishlaydimi (`startup_failure` eski qayd).
- API integration to'plami joriy `main` ustida (infra ko'tarilgach). Qolgan 9 ta ma'lum yiqilish sinfi o'zgarmaganmi.

## 6. Offline va online rejimlar — loyiha qanday mo'ljallangan

**Javob: ha, ikkala rejim ham mo'ljallangan.** Bitta kod bazasi ikki xil deploy shakliga ega, lekin bu ikki rejim **bir-biri bilan sinxronlanmaydi**. Klinika ikkalasidan **bittasini** tanlaydi.

| | **Online (SaaS / bulut)** | **Offline (Local Desktop)** |
|---|---|---|
| Kimga | ko'p klinika, bitta markaziy server | bitta klinika, o'z kompyuterlari |
| Deploy | `infra/docker-compose.prod.yml`: Caddy+TLS, api, worker, web, Postgres, Redis | Electron `DentalService.exe` + bundled Postgres (5433) + Valkey (6380) + `api.exe` + web statik |
| Tenant | multi-tenant (RLS bilan izolyatsiya) | bitta tenant (provisioning orqali) |
| Tarmoq | internet orqali brauzer | LAN: bitta **server PC**, qolganlari **klient** (mDNS/UDP topish yoki qo'lda URL) |
| Ro'yxatdan o'tish | `/register-tenant` (self-service) | o'chirilgan (403); faqat Supervisor litsenziyasi bilan aktivatsiya |
| Litsenziya/modul | gate yo'q (`requireModuleInDesktop` no-op) | `.lic` (AES + RSA imzo + fingerprint), modul gating |
| Fayllar | lokal adapter (⚠️ P17: volume yo'q) | `C:\ProgramData\DentalService\uploads` |
| Backup | `infra/backup.sh` (⚠️ MinIO'ga qaratilgan, P17) | **yo'q** (spec'dagi S3 backup qurilmagan) |
| Yangilash | CI `deploy.yml` (image + migrate) | `electron-updater` (⚠️ hech qachon sinalmagan, P2/P14) |

**Offline rejimda internet qachon kerak:**

| Funksiya | Internet | Izoh |
|---|---|---|
| Kundalik ish (bemor, yozilish, kassa, klinik, ombor, hisobot) | **kerak emas** | hammasi LAN ichida |
| Birinchi aktivatsiya + provisioning | **kerak** (bir marta) | Supervisor `/v1/activate` |
| Heartbeat (4 soatda) | ixtiyoriy | muvaffaqiyatsiz bo'lsa faqat log yoziladi; keshlangan `.lic` ishlayveradi |
| Litsenziya muddati | — | ⚠️ P18: `expiresAt + grace` dan keyin to'xtaydi, internet bo'lsa ham (renew yo'q) |
| Owner parolini tiklash | **kerak** | Supervisor `/v1/verify-reset` |
| Mashina almashtirish / qayta o'rnatish | **kerak** | vendor `prepare-reinstall` + qayta aktivatsiya |
| Telegram / Eskiz SMS (eslatma, recall) | **kerak** | internet bo'lmasa xabar ketmaydi; ⚠️ NoOp/xatoda recall baribir `contacted` bo'lishi mumkin (P9) |
| Auto-update | **kerak** | `UPDATE_URL` sozlanmagan |
| Fiscal (Soliq) | **kerak** | hozir NoOp scaffold |

**Offline rejimning chegaralari:**
- **Server PC yagona nuqta.** U o'chsa, klientlar ishlay olmaydi: klientda lokal kesh yoki offline-first rejim yo'q, web UI ham serverdan yuklanadi.
- **Ma'lumotlar yagona nusxa:** `postgres\data` + `uploads`, backup yo'q. Disk buzilsa, Qaror #43 tiklanish yo'li faqat **bo'sh** klinikani qayta yaratadi, ma'lumotni tiklamaydi.
- **Sinxronlash yo'q:** desktop klinika bulutga ko'chira olmaydi, bulut bilan aralash ham ishlay olmaydi (grep: sync/replication kodi yo'q).

---

## 7. Keyingi tekshiruv rejasi

Statik tadqiqot tugadi. Endi topilmalarni **ishga tushirib** tasdiqlash va hali qaralmagan qismlarni tekshirish kerak. Tartib — xavf × tekshirish narxi bo'yicha.

### 7.1 Lokal, tez (Linux, infra ko'tariladi)
1. **Baza holati.** `docker compose up` (postgres + redis) → migrate → API integration to'plami joriy `main`da. Kutilgan: faqat ma'lum 9 ta yiqilish sinfi (`mock.module` oqishi + concurrent EXCLUDE).
2. **P1 regressiya testi.** Route ichida qator yozib keyin throw → 500 → qator bazada **qolmasligi** kerak. Hozir qoladi. Tuzatishdan oldin testni yozish.
3. **P3/P4.** Real `reminderQueue.add` bilan kontrakt testi (eski id throw qiladi, yangisi o'tadi). Redis to'xtatilganda cancel/no_show xulqi.
4. **P12.** HTTP darajasida `PATCH /visit-notes {freeNotes}` → `performedServices` saqlanib qolishi va ombor o'zgarmasligi.
5. **P7, P5, P6.** API orqali: (a) POS `items` + begona `treatmentPlanId`; (b) Branch Manager → Tenant Admin `roleId` bilan invite; (c) ikki tenantli foydalanuvchining parolini tiklash.
6. **RLS lint (P-o'rta).** Ko'p jadvalli 5 ta schema faylining 2-jadvallari `FORCE RLS`ga egami — SQL bilan bevosita `pg_class.relforcerowsecurity` tekshiruvi.

### 7.2 Brauzerda (Playwright, rol-bo'yicha — `@owner` EMAS)
7. **P11.** Bemor rasmini yuklash → kartada ko'rinadimi (401?).
8. **P10.** Yangi tenant → filial ish soatisiz yozilish yaratish.
9. **RBAC bo'shliqlari.** Branch Manager (invite, onboarding), Doctor (Sozlamalar ekrani, queue chaqirish, PATCH cancel), Nurse (Stock BOM), Accountant (hisobot doktor nomlari), Tenant Admin (egalik o'tkazish kartasi).
10. **P13** va dashboard UTC sanasi — Tashkent 00:00–05:00 holatini soatni surib sinash.

### 7.3 Windows PC'da (faqat jismoniy mashinada)
11. **Yangilash zanjiri (P2/P14).** 0.1.0 o'rnatib, yangi migratsiyali 0.1.1 bilan ustidan yangilash → sxema, `config.json`, rol dialogi.
12. **Offline ssenariylar (P18).** Internetni uzib bir necha kun ishlash; tizim soatini oldinga/orqaga surish (langar); `expiresAt` o'tgan litsenziya bilan nima ishlashi.
13. **Supervision (P15).** `postgres.exe`/`api.exe`ni Task Manager'dan o'ldirish → ilova xulqi; port 80 band bo'lgan holat; tray ikonka ko'rinadimi.
14. **LAN.** 2-PC klient topish (Hyper-V/VPN adapterli mashinada), firewall, server o'chganda klient xulqi.
15. **Fingerprint barqarorligi** bir necha qayta yuklashda; sovuq startda bootstrap gate (2 s timeout).
16. **Recall cron** Tashkent zonasidagi OS'da `sendHour` darvozasidan o'tadimi.

### 7.4 Bulut deploy (online rejim)
17. **P17.** Prod compose'da rasm yuklash → `docker compose up --force-recreate api` → fayl qoladimi; `backup.sh` nimani nusxalaydi.
18. **Kuzatuv yuzasi.** `/metrics` Caddy orqali tashqariga ochiqmi; `X-Forwarded-For` Caddy'da qayta yoziladimi (rate-limit P-o'rta).
19. **CI** hozir ishlaydimi (`startup_failure` eski qayd) va RLS'ni non-superuser bilan sinaydimi.

### 7.5 Hali umuman qaralmagan qismlar
- Performance: katta tenant (10k bemor, 100k yozilish) — indekslar, `list` endpoint'lari pagination'siz (services, recalls, visit-notes, overdue).
- Accessibility (WCAG) va dark mode kontrasti — oxirgi audit DS0 davrida.
- Ma'lumot migratsiyasi / import (mavjud klinikadan Excel/1C) — funksiya yo'q.
- Yuridik/compliance: tibbiy ma'lumot saqlash muddati, bemor ma'lumotini o'chirish/eksport qilish so'rovi.

---

## 8. Kutilayotgan qarorlar (foydalanuvchi)

| # | Savol | Nega muhim | Bog'liq |
|---|---|---|---|
| Q1 | **Offline grace** oxirgi muvaffaqiyatli heartbeat'dan hisoblansinmi (spec bo'yicha) yoki `expiresAt`dan (hozirgi kod)? | Birinchi litsenziya muddati tugashidan oldin hal qilinishi kerak | P18 |
| Q2 | Muddat/grace tugaganda **qaysi modullar ishlashda qolsin**? Spec «asosiy modullar» deydi, kod esa bemor/yozilish/kassani bloklaydi | Klinika kundalik ishining to'xtashi | P18 |
| Q3 | Supervisor'da **litsenziyani uzaytirish (renew)** qachon qo'shiladi? | Hozir muddat tugasa, chiqish yo'li faqat qo'lda SQL | P16 |
| Q4 | **Windows sinovi natijalari** — nima o'tdi, nima yiqildi? | Hujjatlar 08-07 holatida qolgan; `117b587` real o'lchovga tayanadi | §5 |
| Q5 | **Backup strategiyasi** (desktop: yo'q; bulut: MinIO'ga qaratilgan; Supervisor: yo'q) | Ma'lumot yo'qolsa tiklab bo'lmaydi | P16, P17 |
| Q6 | **Server PC yagona nuqta** — qabul qilinadimi yoki klient offline-first talab qilinadimi? | Server o'chsa klinika to'xtaydi | §6 |
| Q7 | **Tashqi texnik** (bir nechta klinika bilan ishlaydi) uchun qaysi yo'l? | Desktop'da hozir umuman kirish yo'q | [`LAB-TECHNICIAN-ACCESS-2026-11-11.md`](./LAB-TECHNICIAN-ACCESS-2026-11-11.md) |

**Keyingi qadam:** §7.1 (lokal tekshiruvlar) — infra (Postgres + Redis) ko'tarishga ruxsat kerak.

---

## 9. Tavsiya etilgan tartib

1. **P1** (RLS rollback) — boshqa topilmalarning og'irligini oshiradi. Middleware'da `c.error` tekshirib throw qilish + HTTP-darajali regressiya testi.
2. **P3** — commit qilinmagan fix + real `Queue.add` testi. **P4** — side-effect'larni commit'dan keyin bajarish.
3. **P2/P14** — birinchi real desktop yangilanishidan **oldin**: har startda idempotent migratsiya + NSIS `${isUpdated}` va config'ni saqlash.
   **P17** — bulutga real klinika qo'yilishidan **oldin**: uploads volume'i + backup'ni lokal uploads'ga qaratish.
   **P18 + renew** — birinchi litsenziya muddati tugashidan **oldin**: grace semantikasi bo'yicha qaror + Supervisor'da muddatni uzaytirish.
4. **P5/P6/P7/P8** — xavfsizlik va pul to'g'riligi.
5. **P10/P11/P12/P13/P9** — foydalanuvchi ko'radigan asosiy oqimlar.
6. **P15/P16** — ishonchlilik, backup, TLS, renew.
