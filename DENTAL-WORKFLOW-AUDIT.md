# Dental Workflow Audit — dental-service

> Auditor roli: Senior PM / Dental PMS arxitektori · Sana: 2026-06-21 · Branch: `main`
> Usul: 4 parallel agent haqiqiy kodni o'qidi (schema + service + frontend), har da'vo fayl:satr bilan. **Faraz yo'q — faqat kodda mavjud narsa baholangan.**
> Til: kodda dental holatlar inglizcha enum, izoh o'zbekcha.

---

## 1. Executive Summary

Loyiha — **texnik jihatdan yaxshi qurilgan, lekin klinik/biznes jihatdan yarim tayyor** dental PMS. Arxitektura (multi-tenant RLS, OpenAPI, factory DI, audit) sanoat darajasida; ma'lumotlar modeli ko'p joyda o'ylangan (typed allergiya, tish-karta snapshot, BOM auto-deduction). **Lekin dental biznesining yuragi bo'lgan ikki narsa — Recall/Revisit tizimi va Shifokor jadvali (Doctor Schedule) — UMUMAN YO'Q**, va davolash rejasi↔sessiya↔billing zanjiri bir nechta joyda uzilgan.

Eng og'riqli haqiqat: ko'p funksiya **backend'da bor, frontend'da ulanmagan** (tish yuzasi, tishga diagnoz, vizit-shablon). Demo'da "ishlaydigan"dek ko'rinadi, real klinikada esa shifokor uni ishlata olmaydi. Bu — "feature theater": schema mavjudligi funksiya mavjudligini anglatmaydi.

**Verdict:** Kichik klinika uchun **cheklangan pilot**ga yaqin (chart + visit + billing yadrosi ishlaydi); ko'p-filialli markaz uchun **tayyor emas**. Tijoriy sotuvga chiqarish uchun hali erta.

---

## 2. Overall Score

| O'lcham | Ball | Izoh |
|---|---|---|
| Business Logic | **6/10** | Yadro bor, lekin `skipped` bosqich qarzga kiradi (moliyaviy bug), partial acceptance yo'q, status state-machine guard yo'q |
| Dental Workflow Compatibility | **5/10** | Chart/diagnosis/plan/billing bor; **Recall YO'Q, Doctor Schedule YO'Q, session↔stage uzilgan, per-surface UI yo'q** |
| Architecture | **8/10** | RLS, OpenAPI, factory DI, audit, modul qatlamlari — kuchli |
| Scalability | **6/10** | Multi-tenant RLS yaxshi; lekin deploy infra yo'q, worker in-process, patient branch-scoped emas |
| UX/UI Structure | **6/10** | Mantine + 11-tab karta + rol dashboard yaxshi; lekin per-surface/diagnosis/template UI ulanmagan |
| Data Model Design | **6/10** | Snapshot, typed allergiya, BOM — a'lo; lekin recall/schedule/supplier/expiry yo'q, surfaces ishlatilmaydi |
| Commercial Readiness | **3/10** | Deploy infra yo'q + xavfsizlik teshiklari (oldingi audit) + recall yo'q = sotib bo'lmaydi |

### 🎯 Umumiy ball: **5.6 / 10**

> Bu o'rtacha emas, **og'irlikli baho**: dental-workflow va commercial readiness eng muhim o'lchamlar va ular eng past. Texnik poydevor a'lo bo'lgani holda, mahsulot "dental klinika dasturi" sifatida hali yetuk emas.

---

## 3. Major Problems (eng og'ir muammolar)

1. **🔴 Recall / Revisit tizimi umuman yo'q.** Manba kodda `recall|revisit|checkup|periodic|nextVisit` — 0 natija. Hech bir jadvalda recall sana/interval ustuni yo'q. Davolash tugagach avtomatik qaytarish yo'q. **Stomatologiyada profilaktik qaytishlar (har 6 oy) daromadning eng barqaror qismidir** — bu yo'qligi biznes-model nuqtai nazaridan kritik.

2. **🔴 Shifokor jadvali (Doctor Schedule) yo'q.** Ish vaqti, smena, availability, dam olish, ta'til — hech qanday jadval yo'q. Natijada: bo'sh slotni ko'rsatib bo'lmaydi, ish vaqtidan tashqari (tungi 03:00) yozilishni bloklab bo'lmaydi, slot/davomiylik konsepti yo'q. `GET /appointments/doctors` faqat doktor ismlari ro'yxati.

3. **🔴 `skipped` bosqich qarzga kiradi (moliyaviy bug).** `balanceFor` (`patients.service.ts:172-181`) va `computePlanBalance` (`cashier.service.ts:322-329`) `stage.status`ni filtrlamaydi — rad etilgan/bekor qilingan bosqich ham bemor qarziga qo'shilib turadi. Real klinikada bu = noto'g'ri qarzlar.

4. **🟠 Davolash rejasi xizmat katalogidan uzilgan.** Bosqich narxi va nomi `PlanFormModal.tsx`'da qo'lda teriladi — `serviceId` umuman yuborilmaydi. `service_prices` katalogidan avto-to'ldirish yo'q. Narx terish xatosi xavfi, katalog bilan nomuvofiqlik.

5. **🟠 "Feature theater" — backend bor, frontend ulanmagan:**
   - **Tish yuzasi (surface):** DB+API to'liq qo'llaydi, lekin UI har doim `surface: 'whole'` jo'natadi (`OdontogramTab.tsx:62`) → per-yuza karies/plomba kiritib bo'lmaydi.
   - **Tishga diagnoz:** `diagnosisId` FK + schema bor, frontend doim `null` (`OdontogramTab.tsx:65`) → ICD-10 katalog tishga ulanmaydi.
   - **Vizit-shablon:** `visit_note_templates` jadval to'liq aniqlangan, lekin **API'da route/service umuman yo'q** → o'lik funksiya.

6. **🟠 Davolash sessiyasi ↔ bosqich bog'lanmagan.** `visit_notes` faqat `appointmentId`ga bog'lanadi, `stage_id` yo'q. Bosqich "bajarildi" faqat qo'lda Select bilan belgilanadi. Klinik ish (vizit) va reja/billing o'rtasida avtomatik aloqa yo'q.

7. **🟠 Reminder lifecycle buzuq.** Eslatma faqat appointment **create**'da enqueue qilinadi (`appointments.service.ts:112`), update'da yo'q → reschedule qilinsa eski vaqt uchun SMS otiladi; cancel'dan keyin ham SMS ketadi (`reminder-worker.ts:22` `appt.status` tekshirmaydi); SMS'da bemorga UTC ISO vaqt + hardcoded o'zbekcha matn.

---

## 4. Missing Features (mavjud emas)

| Yo'q narsa | Dental ahamiyati |
|---|---|
| **Recall / davriy tekshiruv** | Kritik — retention/profilaktika daromadi |
| **Doctor Schedule / availability / bo'sh slot** | Kritik — rejalashtirishning asosi |
| **Cost estimate (interaktiv smeta)** oqimi | Yuqori — bemorga davolashdan oldin narx taklifi |
| **Partial acceptance** (bosqich-darajali qabul/rad) | Yuqori — bemor ba'zi ishni rad etadi |
| **Tish yuzasi UI** (backend bor) | Yuqori — to'g'ri odontogram uchun shart |
| **Ombor: supplier / batch / expiry / cost** | Yuqori — muddati o'tgan material kuzatilmaydi |
| **Low-stock proaktiv alert** | O'rta — hozir faqat UI flag |
| **Qisman refund** | O'rta — faqat to'liq tranzaksiya qaytariladi |
| **Dental analitika** (procedure-mix, retention, recall samaradorligi) | O'rta — hozir asosan moliya/operatsion |
| **Erkin emergency contact** (qarindosh = bemor-link) | O'rta |
| **Real Soliq/fiscal, Telegram, Desktop, 1C** | Ataylab Phase 2 (gap emas) |

---

## 5. Architecture Concerns

- **Kuchli (qayta qurish shart emas):** Postgres RLS + `FORCE ROW LEVEL SECURITY` (29/29 jadval, CI lint kafolati, integration test bilan tasdiqlangan), factory-funksiya DI, OpenAPI single-source, audit log, transaction-per-request, argon2id, refresh rotation.
- **⚠️ Multi-branch izchilligi buzuq:** appointments/stock/reports branch-scoped, lekin **patients va treatment_plans branch-scoped EMAS** (`patients.service.ts`da `branchId` yo'q). Ko'p-filialli markazda bemorlar/rejalar filial bo'yicha segmentlanmaydi.
- **⚠️ Worker in-process** (`startReminderWorker()` API ichida) — N replica = N worker (dublikat ish yo'q, lekin resurs isrofi). Alohida process kerak.
- **⚠️ Status state-machine yo'q** — plan/stage statusi istalgan yo'nalishda o'zgaradi (masalan `draft → completed`), guard yo'q.
- **⚠️ Deploy infra ≈0** (oldingi PRODUCTION-READINESS.md auditiga qarang): Dockerfile, orkestratsiya, TLS, secret injection, backup yo'q.

---

## 6. Quick Wins (arzon, ta'siri yuqori)

1. **`skipped` bosqichni qarzdan chiqarish** — `balanceFor` + `computePlanBalance`'ga `stage.status NOT IN ('skipped')` filtri. Bir necha qatorlik fix, real moliyaviy xatoni tuzatadi.
2. **Reminder worker'da `appt.status` tekshiruvi** — `cancelled/no_show` bo'lsa SMS yubormaslik. Bir `if`.
3. **Appointment conflict off-by-one** — `gte(endTime, start)` → `gt(endTime, start)` (`appointments.service.ts:30`), back-to-back yozilishni ochadi.
4. **PlanFormModal'da `serviceId` ulash** — mavjud xizmat katalogidan Select; narx avto-to'ldirish. Frontend ulanishi (backend tayyor).
5. **Tishga diagnoz va yuza UI ulanishi** — backend allaqachon qabul qiladi; faqat `OdontogramTab.tsx`'dagi hardcoded `null`/`'whole'`ni almashtirish.
6. **Reminder SMS i18n + lokal vaqt** — `t()` + Tashkent TZ formatlash.

---

## 7. MVP Readiness

**Kichik bitta-filialli klinika uchun: ~70% — cheklangan pilot mumkin.**
Ishlaydi: bemor kartasi, appointment + navbat/check-in, tish kartasi (snapshot), SOAP vizit yozuvi, rasm/X-ray, multi-stage reja, qisman to'lov + qarz (skipped bug bilan), SMS eslatma (lifecycle nuqsonlari bilan).
Bloklaydi MVP'ni real ishlatishdan: skipped-stage qarz bug, reminder cancel'dan keyin SMS, doctor schedule yo'qligi (bo'sh slot ko'rsatilmaydi).

**Ko'p-filialli markaz uchun: ~45% — tayyor emas** (patient/plan branch-scoped emas, recall yo'q, doctor schedule yo'q).

---

## 8. Production Readiness

**~25-30% — production'ga chiqarib bo'lmaydi.** (Batafsil: `PRODUCTION-READINESS.md`.)
Kod sifati a'lo (typecheck/lint/build/test yashil, RLS tasdiqlangan), lekin:
- Deploy infratuzilmasi yo'q (Dockerfile/orkestratsiya/TLS/secret/backup)
- Kritik xavfsizlik teshiklari (MinIO anonim bucket, parol-reset ATO, rate-limiting yo'q)
- Dental-funksional bloklovchilar (recall, doctor schedule, skipped-stage qarz)

---

## 9. Recommended Roadmap

### V1 — "Real bitta-filialli klinika" (must-have to sell)
- 🔴 Skipped-stage qarz bug + reminder lifecycle (cancel/reschedule) fix
- 🔴 **Doctor Schedule moduli**: ish vaqti, availability, bo'sh slot ko'rsatish, slot/davomiylik
- 🔴 **Recall tizimi**: davolash tugagach / interval bo'yicha avto-recall, recall sana/interval ustuni, recall SMS
- 🟠 Treatment plan ↔ service katalog ulanishi (serviceId, avto-narx) + cost estimate ekrani
- 🟠 Tish yuzasi + tishga diagnoz UI ulanishi (backend tayyor)
- 🟠 Partial acceptance (bosqich-darajali accept/reject + state-machine guard)
- 🔴 Xavfsizlik fix (ATO, rate-limit, MinIO) + deploy infra (Dockerfile, TLS, backup)

### V2 — "Ko'p-filialli markaz + klinik chuqurlik"
- Patient/plan branch-scoping (yoki ataylab tenant-level bo'lsa — hujjatlash)
- Session ↔ stage bog'lash (vizit bosqichni avtomatik "bajarildi" qiladi)
- Vizit-shablon backend (o'lik jadvalni jonlantirish)
- Ombor: supplier/batch/expiry/cost + low-stock alert + manfiy-qoldiq guard
- Dental analitika: procedure-mix, retention, recall samaradorligi, no-show trend
- Tarixiy tish-karta snapshot ko'rish UI; qisman refund

### V3 — "Tijoriy yetuklik"
- Real Soliq/fiscal integratsiya, Telegram kanal/bot, Desktop (Electron), 1C export
- Insurance/sug'urta to'liq ish oqimi, lab-orders chuqurlashtirish
- Observability (Sentry, metrics), worker ajratish, performance (bundle splitting)

---

## Modul-bo'yicha holat jadvali (Gap Analysis)

| Modul | Status | Priority | Impact |
|---|---|---|---|
| Patient Management | Complete | Low | High |
| Appointment Scheduling | Partial (slot/duration yo'q, conflict bug) | High | High |
| **Doctor Schedule** | **Critical Missing** | **Critical** | **Very High** |
| Check-In & Queue | Complete | Low | Medium |
| Dental Chart (FDI) | Partial (per-surface UI yo'q, FDI validatsiya bo'sh) | High | High |
| Diagnosis (ICD-10) | Partial (tishga bog'lash UI yo'q, 44 diagnoz) | Medium | Medium |
| Treatment Planning | Partial (katalog uzilgan, partial-accept yo'q, session uzilgan) | High | Very High |
| Cost Estimate | Missing (alohida oqim yo'q) | High | High |
| Billing & Debt | Partial (skipped-stage qarz bug, qisman refund yo'q) | Critical | Very High |
| Medical Records / Visit Notes | Partial (template o'lik) | Medium | Medium |
| X-Ray & Image | Complete (vizitga bog'lanmaydi) | Low | Medium |
| Inventory | Partial (supplier/batch/expiry/cost yo'q) | High | High |
| **Recall & Reminder** | **Critical Missing** (faqat appointment reminder, u ham nuqsonli) | **Critical** | **Very High** |
| Reporting & Analytics | Partial (dental analitika yo'q) | Medium | Medium |
| Multi-branch | Partial (patient/plan scoped emas) | High | High |
| Deploy / Security infra | Critical Missing | Critical | Very High |
