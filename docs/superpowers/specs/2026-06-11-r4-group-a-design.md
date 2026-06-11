# R4 Guruh A — Xarajatlar + Qarindoshlar + Ombor: Design Spec (CLI-74/73/76)

- **Sana:** 2026-06-11
- **Epik:** R4 / Linear CLI-71 (M7 — Yangi ERP) ning 1-guruhi — **CLI-74** (xarajatlar), **CLI-73** (qarindoshlar), **CLI-76** (ombor)
- **Bog'liq:** [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md) §5 Bosqich C, RFC-0007 (ERP data model), RFC-0009 (modul arxitektura), Qaror #11 (cross-modul chegara patterni)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r4-group-a` (main'dan)

## Maqsad

R4 ning birinchi guruhi — backend'da yo'q 3 ta mustaqil modul. Har biri to'liq vertikal: yangi tenant-scoped jadval + modul (schema/service/routes, RFC-0009) + api-client + frontend feature + ekran. Hammasi RLS, `check:rls`, integration test.

## Umumiy konvensiyalar
- Har yangi jadval: `tenant_id UUID NOT NULL` + RLS policy (`migrations/rls/`) + `check:rls`.
- Yangi permissions `packages/core/src/permissions.ts` katalogiga + tegishli role-templates'ga seed.
- Modul: `apps/api/src/modules/<feature>/` (routes/service/schema [+repository/mapper trivial bo'lsa yengil]).
- api-client qo'lda (`types-<feature>.ts` + endpoints bloki + index re-export).
- Frontend `features/<feature>/` (api/keys/types/mappers/components) + `pages/`.

---

## A. Xarajatlar (CLI-74)

### Schema
- `expense_categories`: `id, tenantId, name, nameRu?, createdAt`. (tenant boshqaradi)
- `expenses`: `id, tenantId, branchId FK, categoryId FK→expense_categories, amount numeric(14,2), date date, note?, createdBy, createdAt`.
- RLS ikkalasiga.

### Backend — `expenses` moduli
- Kategoriya CRUD: `GET/POST/PATCH/DELETE /api/expense-categories` (`requirePermission('expense.manage')`).
- Xarajat CRUD: `GET /api/expenses?from&to&categoryId&branchId&page`, `POST/PATCH/DELETE` (`expense.view`/`expense.manage`).
- **Oylik svod:** `GET /api/expenses/summary?from&to&branchId` → kategoriya bo'yicha `GROUP BY` (Tashkent kun chegarasi). Sof helper kerak emas (SQL aggregate; lekin svod arifmetikasi bo'lsa helper).
- Audit: mutatsiyalar `audit_log`'ga.

### UI — buxgalter
- `features/expenses/`: xarajat ro'yxati (filtr: davr/kategoriya/filial) + oylik svod (kategoriya breakdown) + xarajat forma (zod4Resolver) + kategoriya boshqaruv modal/tab. `/expenses` route (`expense.view`). nav.expenses mavjud.

---

## B. Qarindoshlar (CLI-73)

### Schema
- `patient_relatives`: `id, tenantId, patientId FK, relativePatientId FK→patients, relationship text, createdAt`. Unique `(patientId, relativePatientId)`.
- Ikki yo'nalishli ko'rinish: A kartasida B, B kartasida A (so'rovda `patientId = X OR relativePatientId = X`). `relationship` — A→B nuqtai nazaridan yorliq (masalan "farzand"); teskari ko'rinishda yorliq xom ko'rsatiladi (v1; teskari-map R5).

### Backend
- patients moduliga sub-resurs: `GET /api/patients/:id/relatives`, `POST` (`{ relativePatientId, relationship }`), `DELETE /api/patients/:id/relatives/:relId`. `requirePermission('patient.edit')` (mavjud).
- Relatives so'rovi ikkala yo'nalishni qaytaradi (patient + relativePatient join, ism bilan).

### UI
- Bemor kartasida **"Oila" bo'limi** (yangi tab yoki Umumiy ichida): qarindoshlar ro'yxati + qarindosh qo'shish (bemor qidirib tanlash — mavjud patients search + munosabat input). `features/patients` kengaytmasi (yangi feature emas).

---

## C. Ombor (CLI-76) — eng katta

### Schema
- `stock_items`: `id, tenantId, branchId? FK, name, unit text, quantity numeric(14,2) default 0, minThreshold numeric(14,2) default 0, createdAt, updatedAt`.
- `stock_movements`: `id, tenantId, itemId FK, type enum('in','out','adjustment'), quantity numeric(14,2), reason text?, sourceVisitNoteId? FK→visit_notes (set null), createdBy, createdAt`.
- `service_materials` (BOM): `id, tenantId, serviceId FK→services, itemId FK→stock_items, qtyPerService numeric(14,2)`. Unique `(serviceId, itemId)`.
- RLS uchchaviga.
- **Joriy qoldiq:** `stock_items.quantity` ustun — har harakatda yangilanadi (materialized; o'qish arzon, ro'yxat tez). Movements — audit/tarix manbasi. (Drift xavfi: yangilash har doim movement bilan bir tx'da.)

### Backend — `stock` moduli
- `stock_items` CRUD + `stock_movements` yaratish (in/out/adjustment — qoldiqni bir tx'da yangilaydi) + `service_materials` (BOM) CRUD. Permission: `stock.view`/`stock.manage`.
- **Kam-qoldi:** `GET /api/stock/items` javobida `lowStock: quantity < minThreshold` (computed). Sof helper `isLowStock(qty, threshold)`.
- **Auto-deduction (cross-modul, vizit→ombor):**
  - Stock moduli `deductForServices(c, serviceIds: string[], sourceVisitNoteId: string): Promise<void>` eksport qiladi — har `serviceId` uchun `service_materials` BOM'ni o'qiydi, har material uchun `out` movement (`qtyPerService`) yaratadi + `stock_items.quantity` kamaytiradi, `sourceVisitNoteId` bilan teglaydi. `getDb(c)` (request-tx) — vizit insert bilan **atomik**.
  - **Inject (DI, toza chegara):** `clinical.service` deps'ga `deductStock?: (c, serviceIds, visitNoteId) => Promise<void>` qo'shiladi (ixtiyoriy). `createVisitNote` insert'dan keyin `await deps.deductStock?.(c, input.performedServices, note.id)`. `clinicalRoutes` (yoki app.ts) stock funksiyasini inject qiladi — clinical stock'ni **to'g'ridan import qilmaydi** (cycle yo'q; dep undefined bo'lsa graceful).
  - **Qarorlar:** deduction faqat vizit **create**'da (update re-deduct EMAS — manual adjustment qoplaydi; reconcile R5). **Manfiy qoldiqqa ruxsat** (klinik ishni bloklamaydi; UI ogohlantiradi). BOM topilmagan xizmat → o'tkazib yuboriladi (deduction yo'q).
- **Sof helper** `stock.calc.ts`: `isLowStock`, `applyMovement(currentQty, type, qty)` (yangi qoldiq) — unit test.

### UI — ombor + asistent
- `features/stock/`: ombor ro'yxati (qoldiq + kam-qoldi belgisi/rang) + harakatlar tarixi (item bo'yicha) + manual harakat forma (kirim/chiqim/tuzatish) + BOM boshqaruv (xizmat→material qty). `/stock` route (`stock.view`). nav.stock mavjud.
- Asistent "chiqim/sarf" — manual `out` movement formasi (shu ekranda).

---

## Parallel topologiya
```
Wave 1 (backend ∥): Xarajatlar ∥ Qarindoshlar ∥ Ombor (+ clinical deductStock hook) ∥ permissions+docs
  ── barrier: api-client (expenses/relatives/stock bloklari) ──
Wave 2 (frontend ∥): xarajat ekran ∥ qarindosh (bemor karta) ∥ ombor ekranlar
```
> Ombor backend `clinical.service.ts` + `clinical.routes.ts` ga tegadi (deductStock inject) — Guruh A'da clinical'ga teguvchi yagona agent (konflikt yo'q). Qarindosh backend `patients` moduliga tegadi — yagona. Migration generate faqat orkestrator apply qiladi (DB-contention oldini olish, R4-bk patterni).

## Test + Verifikatsiya
- **Sof helper unit:** `stock.calc` (isLowStock, applyMovement); xarajat svod (helper bo'lsa).
- **Integration (real DB, MAJBURIY):**
  - Xarajat oylik svod (kategoriya GROUP BY).
  - Qarindosh ikki yo'nalish (A kartasida B, B kartasida A ko'rinadi).
  - **Ombor auto-deduction** (eng muhim): BOM seed → `deductForServices` (yoki soxta-Context orqali `createVisitNote`) → material `quantity` to'g'ri kamayadi, `out` movement `sourceVisitNoteId` bilan yoziladi, manfiyga ruxsat.
- `bun --filter @dental/api typecheck` + `@dental/api-client` + `@dental/web typecheck` + api/web suite + `check:rls` (3-4 yangi jadval policy).

## Yangi permissions
`expense.view`, `expense.manage`, `stock.view`, `stock.manage` — `packages/core/src/permissions.ts` + role-templates seed (Buxgalter→expense.*, Menejer→expense+stock, Asistent→stock.view+manage[chiqim], Doctor+Assistant→stock.view). Owner implicit hammasi.

## Ochiq mayda nuqtalar (plan'da)
- `stock_items.branchId` — filial bo'yicha ombor yoki tenant-global? Taklif: nullable branchId (null = tenant-global; aks holda filial ombori). Plan'da qotiriladi.
- BOM `qtyPerService` birligi item.unit bilan mos deb qabul qilinadi (validatsiya yo'q v1).
- Qarindosh teskari munosabat yorlig'i (A→B "ota", B→A avtomatik "farzand"?) — v1 da xom `relationship` ikkala yo'nalishda; avto-teskari R5.
- Deduction idempotensiya: `sourceVisitNoteId` teg — agar kelajakda reconcile kerak bo'lsa shu orqali (v1 create-only).
