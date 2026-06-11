# Claude Code — Project Context

Bu fayl Claude Code uchun loyiha konteksti. Har yangi sessiyada birinchi o'qiladi.

> ⚠️ **REDESIGN FAOL (2026-06-09).** Loyiha "Dental SaaS" → **kengaytiriladigan klinika platformasi + rolga moslashuvchi UX** ga qayta yo'naltirildi. M1–M5 yadro qurilgan va saqlanadi (gibrid: ko'chiriladi, qayta qurilmaydi).
> **Joriy reja:** Obsidian `05-Redesign.md` + Linear (Dental Service — Redesign, team CLI) — milestone'lar M0–M8 (R0–R5 + Foundation + OpenAPI). Quyidagi **§8 Phasing eskirgan** (eski M1–M7) — 05-Redesign'ga qarang.
> **Progress (2026-06-11):** ✅ R0 (poydevor) + R1 (shell) + **R2 (7 ekran re-skin + Billing poydevori)** TUGADI. 🔧 **R3 davom etmoqda** — main'da: ✅ **CLI-67 bemor balansi** + ✅ **CLI-68 reports moduli** (query-time agregatsiya backend: revenue/appointmentStats/doctorWorkload/planCompletion, RFC-0006). Qurilmoqda — **prezentatsiya qatlami**: CLI-21 (rol landing — JWT `roleKey` = birlamchi rol templateKey, last-used emas; `ux-ia-concept.md` §8), CLI-66 (6 rol dashboard'i), CLI-69 (reports ekran + CSV/Excel eksport), CLI-70 (audit-log o'qish + UI). Billing poydevori (`treatment_stage_payments` allocation + computed balans, Qaror #11) R3 balansiga asos (plan-inclusive, Qaror #13).
> **Arxitektura qarorlari:** `docs/rfcs/` (RFC 001–010) + `docs/architecture.md` + Obsidian `01-Qarorlar.md` (#11 billing, #12 zod4Resolver, #13 R3 balansi).

**Joriy arxitektura:** [`docs/architecture.md`](./docs/architecture.md) + [`docs/rfcs/`](./docs/rfcs/) (RFC 001–010) · UX/IA: [`docs/ux-ia-concept.md`](./docs/ux-ia-concept.md)
Konsept (⚠️ historical, dental-only): [`CONCEPT.md`](./CONCEPT.md) — redesign bilan almashtirildi (2026-06-09)
Qarorlar tarixi: `~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md`

---

## 1. Loyiha qisqacha

**Dental Service** — O'zbekistondagi stomatologiya klinikalari uchun **SaaS** boshqaruv tizimi.

- **Multi-tenant** (har klinika alohida tenant) + **multi-branch** (har tenant bir necha filialga ega)
- **Web + Desktop** (Electron) — bitta React codebase
- Tillar: **O'zbek (Lotin, default)** + **Russkiy**
- Maqsad mijoz: 1-10 doktorli klinikalar O'zbekistonda

---

## 2. Tech Stack (faqat shu)

| Soha | Texnologiya |
|---|---|
| Runtime (backend) | **Bun** |
| Web framework | **Hono** |
| ORM | **Drizzle** + Drizzle Kit migrations |
| Validation | **Zod** |
| OpenAPI | `@hono/zod-openapi` |
| DB | **PostgreSQL 16** (RLS bilan) |
| Cache / Queue | **Redis** + **BullMQ** |
| File storage | **MinIO** (S3 API) |
| Frontend build | **Vite** |
| Frontend framework | **React 18** + **React Router 6+** |
| UI library | **Mantine v7+** (yangi versiya, CSS Modules) |
| State (server) | **TanStack Query** |
| State (client) | **Zustand** |
| Forms | **`@mantine/form` + Zod resolver** |
| i18n | `react-i18next` |
| Desktop | **Electron 28+** (web frontend'ni wrap qiladi) |
| Telegram bot | **Telegraf** (alohida `apps/telegram-bot`) |
| Monorepo | **Bun workspaces** + **Turborepo** |
| Lint/Format | Biome (yoki ESLint+Prettier) |
| Tests | **Vitest** |

**Eslatma:** Bu stack qattiq belgilangan. Boshqa alternativalarni taklif qilma (NestJS, Next.js, Prisma, MUI/Chakra) — bular allaqachon ko'rib chiqilgan va rad etilgan.

---

## 3. ⚠️ Arxitektura — kod yozishdan oldin O'QING

### 3.1 Cross-tenant user identity (KRITIK)

**Foydalanuvchi platform darajasida**, tenant darajasida emas.

- `users` jadvalida **`tenant_id` YO'Q**.
- `users.email` va `users.phone` **platform bo'yicha unique**.
- Bir foydalanuvchi bir nechta tenantda a'zo bo'lishi mumkin (`user_assignments` orqali).
- Login dan keyin frontend "workspace switcher" ko'rsatadi — foydalanuvchi qaysi (tenant, branch) kontekstda ishlashni tanlaydi.
- JWT da: `user_id`, `active_tenant_id`, `active_branch_id`, `permissions[]`.
- Workspace almashtirilganda — yangi JWT chiqariladi.

**Buni esda tuting:**
- Hech qachon `users.tenant_id` deb qidirma — yo'q
- Foydalanuvchi qaysi tenantda ekanligini bilish uchun `user_assignments` ga qara
- Joriy kontekst — JWT'dan `active_tenant_id`

### 3.2 Bemor — tenant-scoped, USER-scoped emas

Bitta jismoniy bemor Klinika A da va Klinika B da bo'lsa — **ikkita alohida bemor yozuvi**. Hech qachon ulanmaydi.

- `patients.tenant_id` har row da
- Hech qachon "bemorni boshqa klinikaga ulash" funksiyasi qo'shilmaydi
- Bir doktor ikki klinikada ishlasa — har klinikada alohida bemor ro'yxatini ko'radi

### 3.3 Permission-based RBAC

- **Permissions** (kod misoli: `patient.view`, `cashier.refund`) — **platform tomonidan belgilanadi**. Hech qachon tenant tomonidan qo'shilmaydi.
- **Roles** — **tenant tomonidan yaratiladi/tahrirlanadi**, mavjud permissions'lardan yig'iladi.
- Yangi tenant uchun **system role templates** seed qilinadi: `Tenant Admin`, `Branch Manager`, `Doctor`, `Doctor + Assistant`, `Nurse`, `Receptionist`, `Accountant`, `Technician`.
- **Tenant Owner — implicit superuser**. Kodda hardcoded check (`user.id === tenant.owner_user_id`). `role_permissions` jadvalida saqlanmaydi.

**Yangi endpoint yozganda:**
```ts
app.delete('/patients/:id',
  requirePermission('patient.delete'),
  async (c) => { ... }
);
```

Yangi permission code kerak bo'lsa — `permissions` katalogiga qo'sh va seed migration yangila. Hech qachon code ichida hardcode qilma.

### 3.4 Multi-tenant izolyatsiya — RLS-only + CI lint (RFC-0009)

**Himoya modeli:**

1. **Postgres RLS (yagona runtime qatlam)** — har tenant-scoped jadvalda `FORCE ROW LEVEL SECURITY` yoqilgan; policy `WHERE tenant_id = current_setting('app.current_tenant_id')`. Hono middleware har auth'langan request da **transaction ochib** `SET LOCAL app.current_tenant_id = '...'` chaqiradi. Service/repository `db` ni `getDb(c)` (`apps/api/src/db/scoped.ts`) orqali oladi — transaction-bound, hech qachon to'g'ridan import qilmaydi. **Query'da explicit `WHERE tenant_id` YOZILMAYDI** — RLS filtrlaydi.

2. **`check-rls-coverage` CI lint (kompilyatsiya-vaqti kafolat)** — har tenant-scoped jadval `FORCE RLS`'ga ega ekanini majburlaydi. Bu — qo'lda per-query `tenantScopedQuery` helper o'rniga (helper **ishlatilmaydi**, bekor qilindi).

**Hech qachon RLS ni o'tib ketma.** Agar query qila olmasang, RLS o'rnatilganmi yoki yo'qmi, tekshir. Cross-tenant query qilish uchun maxsus admin tool kerak bo'lsa — alohida service account yarat.

### 3.5 Factory funksiyalar DI

**NestJS dekoratorlari yoki DI konteyner YO'Q.** Hammasi factory funksiyalar:

```ts
// modules/patients/patients.service.ts
import type { Database } from '@/db';
import type { Logger } from '@/lib/logger';

export const createPatientService = (deps: { db: Database; logger: Logger }) => {
  const findById = async (tenantId: string, patientId: string) => {
    return deps.db.query.patients.findFirst({
      where: (p, { and, eq }) => and(eq(p.tenantId, tenantId), eq(p.id, patientId)),
    });
  };

  const create = async (tenantId: string, data: CreatePatientDto) => {
    return deps.db.insert(patients).values({ ...data, tenantId }).returning();
  };

  return { findById, create };
};

// modules/patients/patients.routes.ts
import { createPatientService } from './patients.service';

export const patientsRoutes = (deps: ServiceDeps) => {
  const app = new Hono();
  const service = createPatientService(deps);

  app.get('/:id', requirePermission('patient.view'), async (c) => {
    const tenantId = c.get('activeTenantId');
    const result = await service.findById(tenantId, c.req.param('id'));
    return c.json(result);
  });

  return app;
};
```

### 3.6 OpenAPI — single source of truth

```
Zod schemalar → @hono/zod-openapi → OpenAPI spec → packages/api-client (auto-generated)
```

- Backend route'ni `@hono/zod-openapi` orqali ro'yxatdan o'tkaz
- `bun run generate:openapi` — OpenAPI spec yaratadi
- `bun run generate:api-client` — `packages/api-client` da typed React hooks generate qiladi
- Frontend faqat `api-client` ni import qiladi — manual fetch yozma

### 3.7 Soliq scaffold pattern (Phase 2 da boshlanadi)

```ts
// packages/fiscal/src/types.ts
export interface FiscalProvider {
  createReceipt(payment: Payment): Promise<FiscalReceipt>;
  cancelReceipt(receiptId: string): Promise<void>;
}

// packages/fiscal/src/noop.ts (default — Phase 2)
export const createNoOpFiscalProvider = (): FiscalProvider => ({
  createReceipt: async (payment) => ({
    id: crypto.randomUUID(),
    fiscalId: null,  // soliqqa yuborilmagan
    status: 'pending',
    payment,
  }),
  cancelReceipt: async () => {},
});

// packages/fiscal/src/soliq.ts (real — Phase 3)
export const createSoliqFiscalProvider = (config: SoliqConfig): FiscalProvider => { ... };
```

Cashier service shu interface ga bog'liq, implementation almashganda business kod o'zgarmaydi.

### 3.8 Notification kanal abstraksiyasi

```ts
interface NotificationChannel {
  send(user: User, message: NotificationMessage): Promise<NotificationResult>;
}
```

- Phase 1: `SmsChannel` (Eskiz)
- Phase 2: `TelegramChannel` qo'shiladi
- `NotificationService` foydalanuvchining bog'langan kanallariga yuboradi (Telegram > SMS prioritet, dublikatsiyasiz)

### 3.9 i18n — barcha string `t()` orqali

- Hech qachon UI da hardcoded matn yozma
- Tarjima fayllari `packages/i18n` da: `uz.json`, `ru.json`
- Yangi matn qo'shganda — ikkala fayl ham yangilan
- DB ichidagi kontent (xizmat nomi, diagnoz nomi) — `name_uz`, `name_ru` ustunlar

### 3.10 Audit log

Har permission-protected mutation operatsiya `audit_log` ga yoziladi:
```
who (user_id), when, action, resource_type, resource_id, before (JSON), after (JSON), tenant_id, branch_id, ip, user_agent
```

Sensitive read (masalan, `medical_record.view`) ham yoziladi (lekin tarkibi yoziladi emas, faqat ko'rilgani).

---

## 4. Loyiha strukturasi

```
dental-service/
├── apps/
│   ├── api/               # Bun + Hono backend
│   ├── web/               # Vite + React + Mantine (browser)
│   ├── desktop/           # Electron (web ni wrap qiladi)
│   └── telegram-bot/      # Telegraf bot (Phase 2)
├── packages/
│   ├── ui/                # Custom dental React komponentlar
│   ├── core/              # Shared types, Zod schemalar
│   ├── db-schema/         # Drizzle schemalar
│   ├── api-client/        # OpenAPI'dan auto-generated client
│   ├── i18n/              # uz/ru tarjimalar
│   ├── odontogram/        # FDI engine + UI komponent (Phase 2)
│   ├── fiscal/            # Soliq scaffold (Phase 2+)
│   └── notifications/     # SMS/Telegram channel abstractions
├── infra/                 # Docker Compose, Caddyfile
├── docs/                  # Texnik dokumentatsiya
├── .github/workflows/     # CI/CD
├── turbo.json
├── bun.lockb
├── package.json
├── tsconfig.base.json
├── CONCEPT.md
└── CLAUDE.md              # Bu fayl
```

**Backend feature folder pattern (`apps/api/src/modules/<feature>/`) — 6 fayl qatlamli (RFC-0009):**
```
<feature>/
├── <feature>.routes.ts       # HTTP: OpenAPIHono createRoute + middleware + ok/fail
├── <feature>.service.ts      # Biznes mantiq: factory(deps); repository+mapper orkestratsiya; audit
├── <feature>.repository.ts   # Ma'lumotga kirish: Drizzle, getDb(c) (RLS-bound), biznes mantiqsiz
├── <feature>.schema.ts       # Zod DTO (request/response) — zod-openapi OpenAPI manbasi
├── <feature>.mapper.ts       # Transformatsiya: DB row ↔ DTO (PII mask, javob shakli)
└── index.ts                  # Public eksport (routes factory)
```
> Qatlam: `routes → service → repository`; `mapper` sof transformatsiya. Trivial CRUD'da repository/mapper yengil. Mavjud 4-fayl modullar bosqichma-bosqich konvergatsiya qiladi (zod-openapi migratsiyasi bilan, CLI-92). Tafsilot: [`docs/rfcs/0009-backend-module-architecture.md`](./docs/rfcs/0009-backend-module-architecture.md).

---

## 5. Conventions

### Naming
- **DB columns:** `snake_case` (Drizzle camelCase ↔ snake_case avtomatik)
- **TypeScript:** `camelCase` o'zgaruvchilar, `PascalCase` types/components
- **Files:** `kebab-case` (`patient-service.ts`)
- **Permissions:** `resource.action` (`patient.view`, `cashier.refund`)
- **Folders:** `kebab-case` (`treatment-plans`)

### Imports
- Path alias: `@/` → `apps/api/src/` (api ichida), `@dental/...` → packages
- Workspace dependencies: `"@dental/core": "workspace:*"` package.json'da
- External > workspace > relative ortaltibida import

### Database
- Har tenant-scoped jadval `tenant_id UUID NOT NULL` boshlanadi
- Har tenant-scoped jadvalda RLS yoqilgan
- Indexes har `tenant_id` ustunida
- Migrations: `drizzle-kit generate` → review → commit
- Hech qachon RAW SQL ishlatma agar Drizzle qila olsa
- Soft delete: `deleted_at TIMESTAMPTZ NULL` (deletion needed bo'lganda)

### API
- REST style: `GET /patients`, `POST /patients`, `GET /patients/:id`, `PATCH /patients/:id`, `DELETE /patients/:id`
- Pagination: `?page=1&pageSize=20`
- Filter: `?status=active&doctorId=...`
- Response: `{ data: ..., meta: { page, pageSize, total } }`
- Errors: `{ error: { code, message, details? } }` + HTTP status

### Frontend (feature-folder qatlamli — RFC-0010)
- **Feature struktura** `apps/web/src/features/<feature>/`: `index` · `<f>.api.ts` (Query hooks) · `<f>.keys.ts` (query-key factory) · `<f>.schema.ts` (Zod form) · `<f>.mappers.ts` (DTO↔view-model, MAJBURIY) · `<f>.types.ts` · `components/`
- **Qatlam:** `components → api.ts (hooks) → generated api-client`. Komponent api-client'ni bevosita chaqirmaydi.
- **Pages** `apps/web/src/pages/` — yupqa route entry (feature screen'ni ulaydi)
- **Shared:** `packages/ui` (dizayn-tizim primitivlari) → `apps/web/src/components` (ilova-shared) → feature `components/`
- Server state — TanStack Query (faqat feature hooks orqali); query-key `[feature, scope, params]`
- Client state — Zustand (global `stores/`: auth, ui/shell); server data dublirlanmaydi
- Forms — `@mantine/form` + **`zod4Resolver`** (`mantine-form-zod-resolver`). ⚠️ Loyiha **Zod 4** — plain `zodResolver` `error.errors`ni (v3) o'qib invalid submit'da CRASH qiladi; doim `zod4Resolver` (`.issues`) ishlat (Qaror #12).
- API tiplari — **generated `packages/api-client`** (OpenAPI, qo'lda emas; RFC-0002 §4)
- Hech qachon `fetch()` to'g'ridan-to'g'ri — generated `api-client` orqali
- Tafsilot: [`docs/rfcs/0010-frontend-feature-architecture.md`](./docs/rfcs/0010-frontend-feature-architecture.md)

### Testing
- Unit: `*.test.ts` har feature folder ichida
- Integration: `tests/integration/` — real DB (test container)
- E2E: Playwright — Phase 3 da

---

## 6. Common commands

> Loyiha hozir bo'sh — bu komandalar Phase 1 boshlanganda actual bo'ladi

```bash
# O'rnatish
bun install

# Development (barcha apps + watch mode)
turbo dev

# Faqat backend
bun --filter @dental/api dev

# Migrations
bun --filter @dental/api drizzle:generate   # Yangi migration
bun --filter @dental/api drizzle:migrate    # Apply

# OpenAPI client generate
bun run generate:openapi
bun run generate:api-client

# Tests
turbo test
turbo test --filter @dental/api

# Build
turbo build

# Docker (local dev infra)
docker compose -f infra/docker-compose.yml up -d  # Postgres, Redis, MinIO
docker compose -f infra/docker-compose.yml down
```

---

## 7. ⛔ Don't (umumiy xato qilishlardan)

⚠️ **JWT staleness:** Permission o'zgarishlari INSTANT EMAS. Maksimum 15 daqiqalik kechikish (JWT access expiry). Real-time revocation kerak bo'lsa — Redis denylist (M4+ qaror).

- ❌ **Hech qachon `users.tenant_id` izlama** — yo'q. Foydalanuvchi platform darajasida. `user_assignments` orqali tenantga bog'lanadi.
- ❌ **Bemorni tenantlar orasida ulamaslik** — `patient.tenant_id` qattiq scoping.
- ❌ **Drizzle middleware'ni o'tib ketma** — har query tenant_id bilan bo'lishi shart.
- ❌ **RLS ni o'chirma** — DB darajasidagi himoya kerakli.
- ❌ **Yangi permission code'ni hardcode qilma** — `permissions` katalogiga qo'sh.
- ❌ **NestJS dekorator yoki DI konteyner** — factory funksiyalar.
- ❌ **MUI / Chakra / Ant Design** — Mantine v7+.
- ❌ **Prisma** — Drizzle.
- ❌ **Next.js (App Router yoki Pages)** — Vite + React Router.
- ❌ **`fetch()` to'g'ridan-to'g'ri frontend da** — `api-client` orqali.
- ❌ **UI da hardcoded uz/ru matn** — har doim `t('keyword')`.
- ❌ **Decorator (`@Controller`, `@Inject`)** — Hono native.
- ❌ **Soliq integratsiyasini Phase 1 da real qilma** — `NoOpFiscalProvider` ishlat.
- ❌ **Patientlar uchun cross-tenant search** — yo'q va bo'lmaydi.

---

## 8. Phasing — qisqa esdalik

> ⚠️ **ESKIRGAN (2026-06-09 redesign).** Quyidagi Phase 1/M1–M7 — eski reja. M1–M5 qurildi, keyin redesign boshlandi. **Joriy reja: R0–R5 milestone'lar** (Obsidian `05-Redesign.md` + Linear). Bu bo'lim tarixiy esdalik sifatida qoldirilgan.

> **Revised:** Phase 1+2 birlashtirildi (real mijoz to'liq dental dasturni xohlagani sababli). Eski Phase 3 endi Phase 2.

**Phase 1 (v1 launch) — ~9-13 oy:** To'liq dental dasturi. ERP modullar + barcha klinik funksiyalar (odontogram FDI, davolash rejasi, vizit yozuvi, ICD-10, reseptlar, konsent, rasm, lab orders) + Desktop (Electron) + Soliq scaffold + Telegram bot + custom role builder UI + audit log UI + 1C export.

**Phase 2 — ~2-3 oy:** Performance + edge cases + onboarding + Soliq real integratsiya + Click/Payme (kerak bo'lsa) + ikkinchi beta to'lqin.

### Ichki milestone'lar (Phase 1 davomida)

| Milestone | Vaqt | Tarkib |
|---|---|---|
| M1 | ~10 hafta | Infratuzilma + auth + RBAC + workspace switcher |
| M2 | ~10 hafta | Bemor + xodim + audit log core |
| M3 | ~10 hafta | Yozilish + navbat + SMS + xizmatlar + kassa (sodda) |
| M4 | ~10 hafta | Klinik core: odontogram + davolash rejasi + vizit yozuvi + ICD-10 |
| M5 | ~8 hafta | Reseptlar + konsent + rasm + lab orders |
| M6 | ~10 hafta | Desktop + Soliq scaffold + Telegram bot |
| M7 | ~8 hafta | Role builder UI + audit log UI + 1C export + advanced reports + launch |

Har milestone oxirida — ichki demo + mijozga progress ko'rsatish (motivatsiya va feedback uchun).

To'liq tafsilot: `~/Документы/Obsidian Vault/Projects/dental-service/03-Phase-1.md`.

---

## 9. Jamoa

- **Solo developer** (foydalanuvchi) + **Claude Code** (AI assistant)
- Har qadamda inson sifat nazorati
- AI tezligi boilerplate / schema / komponent scaffolding da
- Decision-making, integration testing, deployment — inson

---

## 10. Memory pointers (Obsidian)

Loyihaga oid jonli hujjatlar:
- `~/Документы/Obsidian Vault/Projects/dental-service/00-Index.md` — index
- `~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md` — barcha 9 ta qaror tarixi
- `~/Документы/Obsidian Vault/Projects/dental-service/02-Savollar.md` — ochiq savollar, backlog

Yangi qaror qabul qilinganda — `01-Qarorlar.md` ga qo'shing va shu fayl (CLAUDE.md) ham yangilang.
