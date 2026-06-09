# Arxitektura Overview

> Yaxlit manzara: redesign'dan keyingi tizim qanday qurilgan. Bu hujjat **navigatsiya** beradi — qaror tafsilotlari RFC'larda ([`docs/rfcs/`](./rfcs/)), konvensiyalar [`CLAUDE.md`](../CLAUDE.md)'da, mahsulot tarixi [`CONCEPT.md`](../CONCEPT.md)'da.

**Sana:** 2026-06-09 · **Status:** redesign asoslari qotirildi (RFC 001–008 Accepted)

---

## 1. Pozitsiya

**Kengaytiriladigan klinika boshqaruv platformasi**, stomatologiya **birinchi vertikal**. Multi-tenant + multi-branch SaaS, Web + Desktop (Electron), uz/ru. UX yuragi — **rolga moslashuvchi ish maydoni** (6 rol).

⚠️ "Kengaytiriladigan" = dental seam'lar ajratilgan, lekin vertikal-abstraksiya **qurilmagan** (DEFER) — [RFC-0001](./rfcs/0001-extensibility-vertical-model.md).

---

## 2. Yuqori darajadagi manzara

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT  — Web (Vite+React+Mantine) / Desktop (Electron) │
│  Shell (topbar + rol-adaptive sidebar) → feature'lar     │
│  TanStack Query · Zustand · packages/ui (teal DS)        │
└───────────────────────────┬─────────────────────────────┘
                            │  api-client (OpenAPI-generated, RFC-0002)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  API  — Bun + Hono (+ @hono/zod-openapi)                 │
│  Middleware: auth (JWT) · RLS (tx + SET LOCAL) · perm    │
│  Modullar (factory service'lar)                          │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌──────────────┬──────────────┬───────────────────────────┐
│ PostgreSQL   │   Redis      │   MinIO                    │
│ + RLS        │ (cache,BullMQ)│  (rasm/fayl)              │
└──────────────┴──────────────┴───────────────────────────┘
```

---

## 3. Backend

**Mavjud (M1–M5) modullar:** auth, tenants, branches, users, roles, permissions, patients, medical-records, appointments, queue, services, cashier, clinical (visit-notes/treatment-plans/tooth-charts/diagnoses), prescriptions, consent, lab-orders, patient-images, audit (yozish).

**Yangi (redesign) modullar:** `reports` (R3, [RFC-0006](./rfcs/0006-reporting-aggregation.md)), bemor balansi (R3, [RFC-0005](./rfcs/0005-patient-balance-ledger.md)), audit-read (R3), `inventory`/`expenses`/`payroll` (R4, [RFC-0007](./rfcs/0007-erp-modules-data-model.md)), `notifications` (R4, [RFC-0008](./rfcs/0008-notifications.md)).

**Naqsh (CLAUDE.md):** factory funksiyalar DI · `tenantScopedQuery` · RLS belt-and-suspenders · OpenAPI single source of truth ([RFC-0002 §4](./rfcs/0002-frontend-architecture.md)) · audit har mutatsiyada.

---

## 4. Frontend ([RFC-0002](./rfcs/0002-frontend-architecture.md))

- **Monorepo:** `apps/web` + `packages/{ui, api-client, core, i18n, odontogram}`.
- **Struktura:** `app/` (router/providers) · `shell/` (topbar+sidebar, [RFC-0004](./rfcs/0004-app-shell-navigation.md)) · `features/<feature>/` (backend modullariga oyna) · `pages/` (yupqa entry).
- **Data:** TanStack Query (faqat api-client orqali) · **State:** Zustand (auth, ui/shell) — server state faqat Query'da.
- **Dizayn-tizim:** `packages/ui` teal primitivlari, Mantine theme tokenlarga moslangan, dark mode ([RFC-0003](./rfcs/0003-design-system-theming.md)).
- **Rol-adaptive shell:** deklarativ nav-config, `hasPermission` filtr, rol landing, ikki qatlam ruxsat ([RFC-0004](./rfcs/0004-app-shell-navigation.md)).

---

## 5. Ma'lumot & multi-tenant

- **Shared DB + `tenant_id`** har tenant-scoped jadvalda + **Postgres RLS** (transaction-per-request `SET LOCAL app.current_tenant_id`).
- **Cross-tenant user identity:** `users` platform darajasida (tenant_id yo'q), `user_assignments` orqali tenant/branch/rolga bog'lanadi. JWT'da `active_tenant_id` + `permissions[]`.
- **Bemor tenant-scoped** (hech qachon tenantlar orasida ulanmaydi).
- Batafsil: CLAUDE.md §3.1–3.4.

---

## 6. Vertikal-neytral core vs dental seam ([RFC-0001](./rfcs/0001-extensibility-vertical-model.md))

- **Core (neytral, abstraksiyasiz):** patients, appointments, queue, cashier, services, users/auth/roles, audit, branches, reports, inventory/expenses/payroll.
- **Dental seam (ajratilgan, olib tashlanadigan):** clinical (odontogram/tooth-charts), lab-orders, diagnoses (ICD-10), `packages/odontogram`, bemor kartasidagi dental tab'lar.
- **Qoida:** bog'liqlik bir tomonlama — seam → core, core ⇏ seam. Vertikal registry/provider/gating **yo'q**.

---

## 7. Cross-cutting

| Soha | Holat / RFC |
|---|---|
| Auth / RBAC | Permission-based, JWT, workspace switcher (CLAUDE.md §3.3–3.4) |
| Audit log | Yozish ✅ (M1+); o'qish R3 |
| Bemor balansi | cashier_transactions'dan computed ([RFC-0005](./rfcs/0005-patient-balance-ledger.md)) |
| Hisobot/KPI | query-time `reports` moduli ([RFC-0006](./rfcs/0006-reporting-aggregation.md)) |
| i18n | uz/ru, har matn `t()` (packages/i18n) |
| Fiscal (Soliq) | NoOp scaffold → real keyin (CONCEPT §4.7) |
| Notifications | kanal abstraksiya + Eskiz, R4 ([RFC-0008](./rfcs/0008-notifications.md)) |
| Desktop | Electron web'ni wrap qiladi (CLAUDE.md §3.5) |

---

## 8. Hujjatlar xaritasi

- **Qaror tafsilotlari:** [`docs/rfcs/`](./rfcs/) (RFC 001–008)
- **Konvensiyalar / qoidalar:** [`CLAUDE.md`](../CLAUDE.md)
- **UX/IA (rollar, ekranlar, navigatsiya):** [`docs/ux-ia-concept.md`](./ux-ia-concept.md)
- **Dizayn ↔ backend gap:** [`docs/design-architecture-gap-analysis.md`](./design-architecture-gap-analysis.md)
- **Mahsulot tarixi (historical):** [`CONCEPT.md`](../CONCEPT.md)
- **Roadmap / epiklar:** Obsidian `05-Redesign.md` + Linear (Dental Service — Redesign)
