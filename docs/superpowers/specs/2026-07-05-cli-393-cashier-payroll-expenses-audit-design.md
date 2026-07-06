# CLI-393 — Cashier/payroll/expenses o'qishlari audit_log'ga yozilishi (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-393 (Medium)
> **Scope:** `apps/api/src/modules/cashier/cashier.service.ts` (`cashier.view`), `apps/api/src/modules/payroll/payroll.service.ts` (`payroll.view`/`hr.view`), `apps/api/src/modules/expenses/expenses.service.ts` (`expense.view`) — faqat o'qish funksiyalari.
> **Bog'liqlik:** CLI-363/CLI-364 bilan konseptual bir xil naqsh (CLAUDE.md §3.10) — endi moliyaviy modullarga qo'llanadi. Alohida, mustaqil Linear ticket.

---

## 1. Maqsad (Goal)

CLI-363/364 klinik modullar (tooth-charts, visit-notes, treatment-plans, consent, prescriptions, lab-orders, patient-images)ning o'qishlarini audit qildi. Xuddi shu bo'shliq **moliyaviy** modullarda ham bor: `cashier.service.ts`ning `list`/`getById`/`dailySummary`/`planBalance`/`listPatientPlans`, `payroll.service.ts`ning `listRuns`/`getRun`, `expenses.service.ts`ning `list`/`getById` — barchasi `.view` permission bilan himoyalangan o'qish, lekin faqat mutation (`create`/`refund`/`createRun`/`finalizeRun`/CRUD) audit yozadi. Kassa/payroll/xarajat — eng sensitiv moliyaviy ma'lumot (kim qachon qaysi tranzaksiya/maosh/xarajatni ko'rgani), shuning uchun bu gap boshqalardan ham muhimroq.

## 2. Joriy holat — aniq o'qiladigan kod

**`cashier.service.ts`:**
- `list(c, query: ListTransactionsQuery)` (36-71-qatorlar) — `{branchId?, patientId?, from?, to?, page, pageSize}` filtr.
- `getById(c, id)` (73-84-qatorlar) — tranzaksiya + items.
- `dailySummary(c, branchId, dateStr)` (336-360-qatorlar) — kunlik yopish svodi (paymentMethod/type bo'yicha SUM+count).
- `planBalance(c, planId)` (363-396-qatorlar) — reja balansi (stage cost − allocation).
- `listPatientPlans(c, patientId)` (403-414-qatorlar) — bemorning rejalari (plan-billing selektor, CLI-155).
- (`create` 194-qator, `refund` 323-qator — mutatsiya, audit allaqachon bor, o'zgarmaydi.)

**`payroll.service.ts`:**
- `listRuns(c)` (111-114-qatorlar) — barcha payroll run'lar.
- `getRun(c, runId)` (116-128-qatorlar) — run + lines.
- (`createRun` 100-qator, `finalizeRun` 142-qator — mutatsiya, audit allaqachon bor, o'zgarmaydi.)

**`expenses.service.ts`:**
- `list(c, query: ListExpensesQuery)` (112-139-qatorlar) — `{categoryId?, branchId?, from?, to?, page, pageSize}` filtr.
- `getById(c, id)` (141-145-qatorlar) — bitta xarajat.
- (kategoriya CRUD + xarajat CRUD + `summary` — audit allaqachon bor yoki summary read-only agregat, scope tashqarisida — quyidagi §6 ga qarang.)

## 3. Yondashuv — naqsh (CLI-363/364'dan ko'chiriladi, o'zgarmaydi)

Bitta-yozuvli `getById`/`getRun` funksiyalar `patients.service.ts`ning `getMedicalRecord` naqshini takrorlaydi:
```ts
if (row) {
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: '<resource>',
    resourceId: id,
  });
}
```
— topilmasa audit ham yo'q, `before`/`after` yo'q.

Ko'p-yozuvli `list`/`listRuns`/`listPatientPlans` va aggregat `dailySummary`/`planBalance` funksiyalar har doim log qiladi (bo'sh natija ham ma'noli — "bu davrda operatsiya yo'q"):
```ts
await deps.audit.record(c, {
  action: 'viewed',
  resourceType: '<resource>',
  resourceId: <scoping-id-yoki-null>,
  after: { <filtr-metadata>, count: rows.length },
});
```

**`resourceId` tanlovi funksiya bo'yicha:**
- `cashier.list` → `query.patientId ?? null` (lab-orders/prescriptions naqshi bilan bir xil — patientId eng tabiiy scope).
- `cashier.getById` → `id`.
- `cashier.dailySummary` → `branchId` (yagona tabiiy scope — bitta filial, bitta kun).
- `cashier.planBalance` → `planId`.
- `cashier.listPatientPlans` → `patientId`.
- `payroll.listRuns` → `null` (tenant-wide, scoping parametri yo'q — consent `listTemplates`/lab-orders `overdue` naqshi).
- `payroll.getRun` → `runId`.
- `expenses.list` → `null` (categoryId/branchId — ikkalasi ham ixtiyoriy filtr, yagona tabiiy scope yo'q — consent `listTemplates` naqshi).
- `expenses.getById` → `id`.

## 4. Global constraint — audit faqat metadata, moliyaviy tarkib EMAS (CLAUDE.md §3.10)

Audit `'viewed'` chaqiruvi **hech qachon** moliyaviy summani yoki tarkibni yozmaydi:
- `cashierTransactions.totalAmount`/`paidAmount`/`discount`, `cashierTransactionItems` (xizmat narxi), `treatmentStagePayments.amount`, `payrollLines.baseSalary`/`commissionAmount`/`total`, `expenses.amount` — bularning HECH BIRI `after` maydoniga yozilmaydi.
- Ruxsat etilgan `after` tarkibi: `count` (nechta qator qaytdi), scoping parametrlar (`patientId`/`branchId`/`categoryId`/`date` — bular allaqachon so'rov query-string'ida ko'rinadi, sensitive emas).
- `dailySummary`/`planBalance` — bu ikkisi ayniqsa xavfli (aggregat pul summasi computed qiymat sifatida qaytadi), audit yozuvida faqat `resourceId` + `count`/`date` (stage-count), **hech qanday summa yo'q**.
- Bu naqsh CLI-364'dagi `patient-images` maxsus talabi bilan bir xil mulohaza — faqat u yerda PHI (rasm URL) himoyalangan edi, bu yerda moliyaviy summa.

## 5. Test strategiyasi

CLI-363/364 bilan bir xil: **mock/spy YO'Q**. Har modul uchun bitta yangi real-DB integration test fayli — real `createAuditLogger({ db })` + real service factory + `ctx()` helper (`db`/`activeTenantId`/`user`/`accessClaims` + `req.header`) + `db.transaction` ichida `SET LOCAL app.current_tenant_id`, so'ng `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlash. Bitta test fayli — bitta modulning barcha o'qish funksiyalarini qamrab oladi (CLI-363 `treatment-plans` faylining naqshi: bir faylda bir necha `test()` bloki).

Mavjud testlar (`cashier-plan-balance.test.ts`, `cashier-list-daterange.test.ts`, `payroll.test.ts`, `expenses.test.ts` — barchasi `noopAudit` bilan) yangi audit chaqiruvidan keyin ham yashil qolishi shart (`noopAudit.record` — no-op, xatti-harakatga ta'sir qilmaydi).

## 6. Scope tashqarisida (won't-fix bu ticketda)

- `expenses.service.ts`ning `summary(c, query)` (234-258-qator) — ticket tavsifida sanalmagan (faqat `list`/`getById` so'ralgan); u ham read bo'lsa-da, alohida keyingi ticketga qoldiriladi (scope creep oldini olish).
- `cashierTransactionItems` yoki `treatmentStagePayments`ning alohida audit'i — `getById`/`planBalance` ichida ular allaqachon parent resurs (`cashier_transaction`/`treatment_plan`) audit yozuvi orqali qamrab olinadi, alohida resourceType kerak emas.

## 7. DoD

- [ ] `cashier.service.ts`: `list`, `getById`, `dailySummary`, `planBalance`, `listPatientPlans` — barchasi `action: 'viewed'` audit yozadi (§3).
- [ ] `payroll.service.ts`: `listRuns`, `getRun` — `action: 'viewed'` audit yozadi (§3).
- [ ] `expenses.service.ts`: `list`, `getById` — `action: 'viewed'` audit yozadi (§3).
- [ ] Audit `after` maydonida HECH QANDAY moliyaviy summa/tarkib yo'q — faqat `count`/scoping parametr (§4).
- [ ] Har modul uchun real-DB integration test — `bun test --env-file=../../.env`.
- [ ] Mavjud testlar (`noopAudit` bilan) o'zgarishsiz yashil qoladi.
- [ ] Typecheck toza.
