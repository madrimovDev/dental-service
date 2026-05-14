# Dental Service — Loyiha Konsepti

> O'zbekistondagi stomatologiya klinikalari uchun SaaS boshqaruv tizimi. Multi-tenant + multi-branch arxitektura. To'liq klinik ish jarayoni va biznes boshqaruvi bir tizimda.

**Versiya:** 0.1 (concept)
**Boshlangan:** 2026-05-14
**Status:** Rejalashtirilmoqda

---

## 1. Maqsad va vizyon

### Muammo

O'zbekistondagi stomatologiya klinikalarida bugungi kunda:
- Bemorlar ma'lumotlari **qog'ozda** yoki turli Excel fayllarda
- Yozilish — telefon qo'ng'iroq + qog'oz jurnal
- **Klinik tomon** (odontogram, davolash rejasi, rentgen) — ko'pchilik klinikalarda hech qanday tizim yo'q yoki eski/import qilingan dasturlar
- Kassa va soliqqa **alohida-alohida** tizimlar
- Filial va doktor ish vaqti — qog'oz/Excel
- Mijozlarga eslatma — qo'lda telefon qo'ng'iroq (no-show juda yuqori)

Mavjud yechimlar:
- Xorijiy dental software (Dentrix, OpenDental va h.k.) — O'zbekiston bozoriga moslashmagan, qimmat, Soliq.uz bilan integratsiya yo'q
- Rus 1C asosli dental — eski UI, mahalliylashtirilmagan, asosan buxgalteriya tomonida
- Universal CRM/ERPlar — stomatologiyaga xos klinik funksiyalar yo'q (odontogram, treatment plan)

### Yechim

**Dental Service** — O'zbekiston bozoriga moslashtirilgan, klinika hayotini boshidan oxirigacha qamrab oluvchi SaaS:
- Bir klinika **bir necha filialda** ishlay oladi
- Bir foydalanuvchi **bir nechta klinika va filialda** ishlay oladi (ko'p doktor yarim stavka bir nechta joyda)
- **Klinik + biznes** ikkala tomoni bir tizimda
- O'zbekistonga xos integratsiyalar (Soliq.uz, Eskiz SMS, kelajakda Click/Payme)
- O'zbek va Rus tillarida

### Vizyon

3 yil ichida O'zbekistondagi har 4 ta stomatologiya klinikadan 1 tasi Dental Service'dan foydalansin. Klinika rahbarlari "biznesimni telefonda ko'rib turishi", doktorlar "bemorni har vizitda eslab qolishi", bemorlar "ehtiyotsiz so'ralmagan" davolanishi mumkin bo'lsin.

---

## 2. Maqsadli mijozlar

### Birinchi to'lqin (Phase 1-2 mijozlari)
- **1-3 ta doktor bo'lgan kichik klinikalar** (Toshkent, Samarqand, Buxoro)
- Egasi yoki direktor — texnologiyaga ochiq
- Bugun qog'oz/Excel ishlatadi va asosiy zarurat his qiladi
- Beta-mijoz: chegirma yoki bepul ishlatish + faol feedback

### Ikkinchi to'lqin
- 4-10 doktor, 1-3 filialli o'rtacha klinikalar
- Tarmoq klinikalar (5+ filial)
- Lyuks/premium klinikalar (turistik shaharlarda)

### Maqsad mijoz BO'LMAYDI (hech bo'lmaganda dastlab)
- Davlat poliklinikalari — alohida byurokratiya
- Mobile/ko'chma dental xizmat — boshqa use case
- Faqat bitta doktorli xonadon klinikalar — tizim haddan tashqari katta

---

## 3. Asosiy funksiyalar

### 3.1 ERP / Boshqaruv

| Modul | Tafsilot |
|---|---|
| **Tenant boshqaruvi** | Klinika kompaniyasi sozlamalari, filiallar |
| **Hodimlar** | CRUD, rol, ish vaqti, ish haqi formulalari, multi-branch assignment |
| **Bemorlar** | Profil, PII, kontakt, qarindoshlar, suratlar |
| **Yozilish (appointment)** | Doktor kalendari, drag-drop, xizmatga qarab davomiylik |
| **Walk-in navbat** | Raqamli navbat, display board (Desktop) |
| **Xizmatlar katalogi** | Kod, nom, narx (filial bo'yicha), davomiylik, kategoriya |
| **Kassa** | To'lov qaydlash, chek, qaytarish, hisobot |
| **Ombor** | Materiallar, dori-darmonlar, sterilizatsiya hisobi |
| **Buxgalteriya** | Daromad, xarajat, ish haqi, soliq |
| **Hisobotlar** | Daromad, vrach bo'yicha, no-show, treatment completion |

### 3.2 Klinik (stomatologiyaga xos)

| Modul | Tafsilot |
|---|---|
| **Tibbiy karta** | Anamnez, allergiya, surunkali kasalliklar, qon guruhi |
| **Odontogram (FDI)** | Interaktiv tish kartasi (32 doimiy + 20 sut), yuza bo'yicha holatlar |
| **Davolash rejasi** | Multi-stage plan, narx, status, raqamli imzo |
| **Vizit yozuvi** | SOAP format + shablonlar |
| **Diagnoz katalog** | ICD-10 dental (K00–K14) + custom |
| **Reseptlar** | Yozish, chop, SMS yuborish |
| **Konsent** | Hujjat shablonlari + raqamli imzo |
| **Rasm** | Rentgen, panoramik, intraoral — upload, gallery, basic viewer |
| **Lab orders** | Texnik (laborant) workflow: material, rang, deadline, status |

### 3.3 Aloqalar

| Kanal | Phase | Maqsad |
|---|---|---|
| **SMS (Eskiz.uz)** | Phase 1 | Eslatma, OTP, marketing |
| **Telegram bot** | Phase 2 | Bemorlar va xodimlar notification, komandalar |
| **Email** | Phase 3 | Hisobotlar, sistem xabarnomalar |

### 3.4 Integratsiyalar

| Integratsiya | Phase | Tafsilot |
|---|---|---|
| **Eskiz.uz** | 1 | SMS shlyuz |
| **Soliq.uz onlayn-chek** | 2 (scaffold) → 3 (real) | Fiskal chek, qonuniy talab |
| **Telegram Bot API** | 2 | Telegraf |
| **1C export** | 2 | Excel/XML — buxgalter qo'lda yuklaydi |
| **Click/Payme** | 3 (kerak bo'lsa) | Onlayn to'lov |
| **OneID/MyID** | Backlog | Davlat ID — bemor pasport auto-fill |

---

## 4. Arxitektura

### 4.1 Yuqori darajadagi ko'rinish

```
┌──────────────────────────────────────────────────────────────┐
│                       BROWSER / DESKTOP                       │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│   │  Web (SPA)  │  │ Electron App │  │  Display Board   │    │
│   │  Mantine UI │  │ (same React) │  │  (queue ekran)   │    │
│   └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘    │
└──────────┼─────────────────┼──────────────────┼──────────────┘
           │                 │                  │
           ▼                 ▼                  ▼
    ┌────────────────────────────────────────────────────┐
    │                  REVERSE PROXY                      │
    │                    (Caddy + SSL)                    │
    └────────────────────┬───────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
    ┌─────────────────┐         ┌──────────────────┐
    │   Hono API      │         │  Telegram Bot    │
    │   (Bun runtime) │         │  (Telegraf)      │
    └────────┬────────┘         └────────┬─────────┘
             │                            │
             ▼                            ▼
    ┌────────────────────────────────────────────┐
    │              Service Layer                  │
    │   (factory funksiyalar, business logic)     │
    └─────┬──────────────┬──────────────┬────────┘
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌─────────────┐ ┌────────────┐
    │PostgreSQL│  │    Redis    │ │   MinIO    │
    │  + RLS   │  │   (cache,   │ │  (S3 store │
    │          │  │   BullMQ)   │ │  rasm uchun)│
    └──────────┘  └─────────────┘ └────────────┘
```

### 4.2 Multi-tenant SaaS + filiallar

**Iyerarxiya:**

```
Platform (bizning kompaniya)
  └─ Tenant (Klinika kompaniyasi / brendi)
        └─ Branch (Filial)
              └─ [Cabinet (Phase 3+)]
                    └─ Staff, Patient, Appointment, ...
```

**Multi-tenant strategiyasi:**
- **Shared DB + tenant_id ustun** (har row da)
- **Postgres Row-Level Security (RLS)** — DB darajasidagi himoya, transaction-per-request middleware `SET LOCAL app.current_tenant_id` o'rnatadi
- **`tenantScopedQuery` helper** — `apps/api/src/db/scoped.ts` hand-rolled, query'ga `WHERE tenant_id = ...` explicit qo'shadi. ⚠️ Drizzle'da query interceptor YO'Q
- **Belt and suspenders** — ikkala himoya birga ishlaydi (birining xatosi ikkinchisini buzmaydi)

### 4.3 Cross-tenant user identity

⚠️ **Bu eng muhim arxitektura qaror.**

```
users (platform level — NO tenant_id)
  ├─ User A
  │   ├─ Membership in Tenant 1 → Branches [1.1, 1.2]
  │   └─ Membership in Tenant 2 → Branches [2.3]
  └─ User B
      └─ Membership in Tenant 1 → Branches [1.1]
```

- **Email/telefon platform bo'yicha noyob**
- Login dan keyin **workspace switcher**: "Klinika A — Filial 1", "Klinika B — Filial 3"
- JWT da `active_tenant_id` + `active_branch_id` + `permissions[]` (joriy kontekstdagi)
- Workspace almashtirilganda — yangi JWT chiqariladi
- **Bemor ma'lumotlari tenant-scoped** — bitta jismoniy odam ikki klinikada = ikki bemor yozuvi (qonuniylik + tenant izolyatsiya)

### 4.4 Permission-based RBAC

**Konseptual:**
- **Permissions** (ruxsat kodlari) — **platform tomonidan belgilanadi**, hech qachon o'zgarmaydi
- **Roles** — **tenant tomonidan yaratiladi/tahrirlanadi**, mavjud permissionlardan yig'iladi
- **System role templates** — yangi tenant uchun seed: Doctor, Nurse, Receptionist, Branch Manager, Tenant Admin
- **Tenant Owner** — **implicit superuser** (kodda hardcoded, role_permissions da emas — o'zini lock qilib qo'yishidan oldini olish uchun)

**Permission misollari:**
```
patient.view          medical_record.view    appointment.create
patient.edit          medical_record.edit    appointment.cancel
patient.delete        odontogram.edit        cashier.refund
patient.view_pii      treatment_plan.create  inventory.consume
```

**User assignment:**
- `user_assignments` (user_id, tenant_id, branch_id NULLABLE, role_id, valid_from, valid_to)
- `branch_id = NULL` → tenant darajasidagi rol (masalan, Tenant Manager — barcha filiallarni ko'radi)
- Asistent/hamshira o'z hisobiga ega bo'lmasligi mumkin — doktor o'z roli ostida ularning ishlarini bajaradi

### 4.5 Web + Desktop — shared frontend

- Bitta **React codebase** (`apps/web` + `apps/desktop`)
- Web — brauzerda ishlaydi
- Desktop (Electron) — shu React'ni wrap qiladi + IPC orqali native imkoniyatlar
- Desktop-only funksiyalar: POS printer, Soliq fiskal modul, file system, lokal storage cache
- Build flagi (`IS_DESKTOP`) bilan UI da kerakli farqlar

### 4.6 Notification arxitekturasi

```ts
interface NotificationChannel {
  send(user: User, message: NotificationMessage): Promise<void>;
}

// Implementations:
// - SmsChannel (Eskiz) — Phase 1
// - TelegramChannel — Phase 2
// - EmailChannel — Phase 3

// NotificationService: foydalanuvchining afzal kanallarini aniqlaydi
// va dublikatsiyasiz yuboradi (Telegram > SMS, agar bog'langan bo'lsa)
```

### 4.7 Soliq scaffold pattern

```ts
interface FiscalProvider {
  createReceipt(payment: Payment): Promise<FiscalReceipt>;
  cancelReceipt(receiptId: string): Promise<void>;
}

// Phase 1-2: NoOpFiscalProvider — DB ga yozadi, soliqqa yubormaydi
// Phase 3: SoliqApiProvider — real soliq.uz API ga yuboradi
// Business kod o'zgarmaydi — faqat provider almashtiriladi
```

---

## 5. Tech Stack

### Backend (`apps/api`)
- **Runtime:** Bun
- **Framework:** Hono
- **ORM:** Drizzle + Drizzle Kit (migrations)
- **Validation:** Zod
- **OpenAPI:** `@hono/zod-openapi`
- **DI:** Factory funksiyalar (no decorators, no container)
- **DB:** PostgreSQL 16 (multi-tenant + RLS)
- **Cache/Queue:** Redis + BullMQ
- **File storage:** MinIO (S3-compatible)
- **Auth:** `hono/jwt` + refresh tokens

### Frontend (`apps/web` + `apps/desktop`)
- **Build:** Vite
- **Framework:** React 18
- **Router:** React Router 6+
- **UI:** Mantine v7+ (CSS Modules, performance)
- **DataTable:** `mantine-react-table`
- **Dates:** `@mantine/dates`
- **Forms:** `@mantine/form` + Zod resolver
- **State (server):** TanStack Query
- **State (client):** Zustand
- **i18n:** `react-i18next`
- **Icons:** `@tabler/icons-react`

### Desktop
- **Electron 28+**
- **electron-builder** (packaging)
- **electron-store** (local settings)
- IPC bridge: printer, fiskal, file system

### Telegram bot (`apps/telegram-bot`)
- **Telegraf**

### Monorepo & tooling
- **Bun workspaces** (package management)
- **Turborepo** (task orchestration)
- **TypeScript** project references
- **Biome** yoki **ESLint + Prettier**
- **Vitest** (testing)
- **Husky + lint-staged**

### DevOps
- **Docker + Docker Compose**
- **GitHub Actions** (CI/CD)
- **Caddy** (reverse proxy + auto-SSL)
- **VPS** (provider: loyiha tugashidan oldin)
- **Sentry** (error tracking)

---

## 6. Monorepo strukturasi

```
dental-service/
├── apps/
│   ├── api/                      # Bun + Hono backend
│   │   └── src/
│   │       ├── modules/          # Feature folders
│   │       │   ├── auth/
│   │       │   ├── tenants/
│   │       │   ├── branches/
│   │       │   ├── users/
│   │       │   ├── patients/
│   │       │   ├── appointments/
│   │       │   ├── queue/
│   │       │   ├── medical-records/
│   │       │   ├── odontogram/
│   │       │   ├── treatment-plans/
│   │       │   ├── visit-notes/
│   │       │   ├── services/
│   │       │   ├── cashier/
│   │       │   ├── inventory/
│   │       │   ├── lab-orders/
│   │       │   ├── prescriptions/
│   │       │   ├── consent/
│   │       │   ├── images/
│   │       │   ├── notifications/
│   │       │   ├── reports/
│   │       │   ├── audit/
│   │       │   └── ...
│   │       ├── middleware/
│   │       ├── lib/              # Helpers, types
│   │       ├── db/
│   │       │   ├── schema/       # Drizzle schemalar
│   │       │   └── migrations/
│   │       └── index.ts
│   ├── web/                      # Vite + React + Mantine
│   ├── desktop/                  # Electron shell (web ni wrap qiladi)
│   └── telegram-bot/             # Telegraf bot
├── packages/
│   ├── ui/                       # Shared React komponentlar
│   ├── core/                     # Shared types, business logic
│   ├── db-schema/                # Drizzle schemalar (api da ham bor — yoki shared paketda)
│   ├── api-client/               # OpenAPI'dan auto-generated typed client
│   ├── i18n/                     # uz/ru tarjima fayllari
│   ├── odontogram/               # FDI engine + React komponent
│   └── notifications/            # SMS/Telegram channel abstractions
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── Caddyfile
│   └── Dockerfile.*
├── docs/                         # Texnik dokumentatsiya
├── .github/
│   └── workflows/                # CI/CD
├── turbo.json
├── bun.lockb
├── package.json
├── tsconfig.base.json
├── CONCEPT.md                    # Bu fayl
└── CLAUDE.md                     # Claude Code uchun ish konteksti
```

---

## 7. Ma'lumotlar modeli — yuqori darajadagi ko'rinish

### Platform darajasi (tenant_id yo'q)

```
users               — email, phone, password_hash, full_name, preferred_language
permissions         — code, category, description (seed by platform)
audit_log_global    — platform-level events
```

### Tenant darajasi (har row da tenant_id)

```
tenants             — name, default_language, owner_user_id, subscription_status
tenant_settings     — per-tenant config
branches            — tenant_id, name, address, work_hours
roles               — tenant_id, name, is_template
role_permissions    — role_id ↔ permission_id
user_assignments    — user_id, tenant_id, branch_id (nullable), role_id, valid_from, valid_to
patients            — tenant_id, full_name, phone, passport, dob, allergies, ...
medical_records     — tenant_id, patient_id, anamnez, chronic_conditions
tooth_chart         — tenant_id, patient_id, snapshot_date, state (JSON per tooth)
treatment_plans     — tenant_id, patient_id, doctor_id, total_cost, status
treatment_stages    — plan_id, service_id, sequence, status, cost
visit_notes         — tenant_id, patient_id, doctor_id, appointment_id, SOAP fields
appointments        — tenant_id, branch_id, doctor_id, patient_id, start_time, end_time, status
queue_tickets       — tenant_id, branch_id, queue_number, patient_id, status
services            — tenant_id, code, name (uz/ru), category, duration
service_prices      — service_id, branch_id, price, valid_from
cashier_transactions — tenant_id, branch_id, patient_id, amount, type, status
cashier_receipts    — transaction_id, fiscal_provider, fiscal_id, ...
inventory_items     — tenant_id, branch_id (nullable for central), name, unit, stock
inventory_movements — item_id, qty, direction, reason, by_user_id
lab_orders          — tenant_id, patient_id, doctor_id, technician_id, tooth_numbers, material, status
prescriptions       — tenant_id, patient_id, doctor_id, medications (JSON)
consent_forms       — tenant_id, patient_id, template_id, signature_image, signed_at
images              — tenant_id, patient_id, type, file_url, metadata
notification_logs   — tenant_id, user_id, channel, status, sent_at
audit_log           — tenant_id, user_id, action, resource_type, resource_id, before, after
```

*Bu — yuqori darajadagi reja. To'liq schema Phase 1 boshlanganda Drizzle'da yoziladi.*

---

## 8. Phasing — qisqacha

> **Eslatma:** Dastlab Phase 1 + 2 + 3 ko'rinishida edi. **Real mijoz to'liq dental dasturni xohlagani sababli Phase 1 va 2 birlashtirildi.** Eski Phase 3 endi Phase 2.

### Phase 1 (v1 launch) — ~9-13 oy
To'liq dental boshqaruv tizimi. Mijoz Day 1 da to'liq mahsulotni qabul qiladi.

**ERP/Operatsion:** multi-tenant + RBAC + cross-tenant user + bemor + tibbiy karta + yozilish + walk-in navbat + SMS + xizmatlar + kassa + xodim + ombor + hisobotlar

**Klinik (stomatologiyaga xos):** odontogram (FDI) + davolash rejasi + vizit yozuvi (SOAP) + ICD-10 + reseptlar + konsent + rasm + lab orders

**Platforma/Integratsiya:** Web app + Desktop (Electron + POS printer) + Soliq scaffold (NoOp) + Telegram bot + 1C export

**UX/Admin:** custom role builder UI + audit log UI + workspace switcher + i18n (uz/ru)

### Phase 2 — ~2-3 oy (sayqal + real integratsiya)
- Performance optimization, edge cases, onboarding
- **Soliq.uz real integratsiya** (NoOp → SoliqApiProvider)
- Click/Payme (kerak bo'lsa, SaaS obuna uchun)
- Ikkinchi beta to'lqin (3-5 mijoz)

### Ichki milestonelar (Phase 1 davomida)

Tashqi launch faqat Phase 1 oxirida, lekin har 8-10 hafta ichki milestone:

| Milestone | Vaqt | Tarkib |
|---|---|---|
| M1 | ~10 hafta | Infratuzilma + auth + RBAC + workspace switcher |
| M2 | ~10 hafta | Bemor + xodim + audit log core |
| M3 | ~10 hafta | Yozilish + navbat + SMS + xizmatlar + kassa (sodda) |
| M4 | ~10 hafta | Klinik core: odontogram + davolash rejasi + vizit yozuvi + ICD-10 |
| M5 | ~8 hafta | Reseptlar + konsent + rasm + lab orders |
| M6 | ~10 hafta | Desktop + Soliq scaffold + Telegram bot |
| M7 | ~8 hafta | Role builder UI + audit log UI + 1C export + advanced reports + launch |

Batafsil reja: `~/Документы/Obsidian Vault/Projects/dental-service/03-Phase-1.md` (har milestone uchun feature list, API, DB, UI, acceptance criteria)

---

## 9. Hosting va deployment

### MVP davri
- **1 VPS** (4 vCPU / 8 GB RAM / 80 GB SSD) — taxminan €10-15/oy
- Hetzner Frankfurt yoki DigitalOcean Frankfurt — datacenter
- Docker Compose orqali: Bun API + Postgres + Redis + MinIO + Caddy
- Daily backup: snapshot + offsite (Backblaze B2 yoki Wasabi)

### O'sganda (3-10 ta tenant)
- Alohida DB server + alohida app server
- MinIO ham alohida disk
- Redis ham alohida (yoki shared)

### Enterprise / Mahalliylik
- O'zbekistondagi cloud (Uzcloud, mIT.uz) — agar qonun talab qilsa
- Yoki gibrid: DB UZ, compute Frankfurt

### Domain va SSL
- `app.dental.uz` (yoki shunga o'xshash brend) — asosiy klinika ilovasi
- Caddy avtomatik Let's Encrypt SSL
- Har tenant uchun subdomain (`klinika-a.dental.uz`) — Phase 3+ yoki bir xil domen + path-based

---

## 10. Ochiq masalalar / Backlog

### Filiallar bo'yicha (Q1 ning sub-savollari)
- 1.a Bemor filiallar orasida umumiymi (bitta tenant ichida)? — **dastlabki javob: Ha, tenant ichida umumiy**
- 1.b Xodim ko'p filialda ishlay oladimi? — **Ha, ✅ Q8 da hal qilindi**
- 1.c Ombor: har filialda alohidami yoki markaziy ombor + filiallar? — **Phase 1 da har filial alohida**
- 1.d Kassa filial bo'yicha, lekin tenant konsolidatsiya bormi? — **Ha, ikkalasini ko'rsatamiz**
- 1.e Buxgalteriya per-filial vs per-tenant — **ikkalasi ham**
- 1.f Narx-navo filial bo'yicha farqlimi? — **Ha, `service_prices` jadvali per-branch**

### Boshqa ochiq savollar
- Migration mavjud tizimdan (Excel, qog'oz) — onboarding tool kerakmi?
- Sug'urta (DMS) integratsiyasi — backlog
- Audit log retention — 1 yil (taklif)
- Backup RTO/RPO — 24 soat RPO, 8 soat RTO (taklif)
- Telegram bot v2 kommandalar: bemor uchun `/balans`, `/keyingi_vizit`, `/davolash_rejam`
- Mobil ilova (xodimlar, bemorlar) — backlog
- Loyalty / chegirma tizimi — backlog
- Marketing CRM funksiyalari — backlog
- SaaS obuna to'lovi modeli — Phase 3 da hal qilinadi

---

## 11. Yakuniy izoh

Bu konsept **qarorlar jurnali**ga asoslangan (`~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md` — 9 ta asosiy qaror muhokama qilingan va yozilgan).

**Keyingi qadam:** Phase 1 ni alohida fayl sifatida batafsil yozish — har feature uchun:
- Acceptance criteria
- API endpoints
- DB schema
- UI sahifalar
- Test scenarios
- Texnik qarzlar (technical debt) ro'yxati

Bu fayl loyiha davomida **jonli hujjat** sifatida saqlanadi — qarorlar o'zgarsa, shu yer ham yangilanadi.
