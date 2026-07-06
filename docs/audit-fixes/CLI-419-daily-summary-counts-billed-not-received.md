# CLI-419 — Kunlik summary `totalAmount` (hisob-faktura)ni olingan pul deb sanaydi

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgartirilmagan). Audit: `AUDIT-2026-07-06.md` M6.
> **Bog'liqlik:** CLI-406 (`docs/audit-fixes/CLI-406-full-refund-double-subtract.md`) — void olib tashlangach, refund qatorlari `status='completed'` bo'lib refund kunida summary'ga kiradi.

## 1. Muammo va ildiz sabab

`cashier.service.ts:360-375` (`dailySummary`):
```ts
.select({
  paymentMethod: cashierTransactions.paymentMethod,
  type: cashierTransactions.type,
  total: sql<string>`SUM(${cashierTransactions.totalAmount})`,   // ← MUAMMO: billed
  count: count(),
})
.where(and(
  eq(cashierTransactions.branchId, branchId),
  between(cashierTransactions.createdAt, start, end),
  eq(cashierTransactions.status, 'completed'),
))
.groupBy(cashierTransactions.paymentMethod, cashierTransactions.type)
```

`totalAmount` = **hisob-faktura summasi** (netTotal, `create` da `:136`), `paidAmount` = **haqiqatda olingan naqd** (`:137`). POS sotuv kam to'langan bo'lishi mumkin (`paidAmount < totalAmount` = qarz). Kassa kunlik yopilishi **olingan naqd**ni ko'rsatishi kerak, hisob-fakturani emas.

Frontend `DailySummaryCard.tsx:12-28` bu `total`'ni "tushum" (kassa) sifatida ko'rsatadi:
```ts
function sumByMethod(summary, method) {
  return summary.breakdown.filter(b => b.type === 'payment' && b.paymentMethod === method)
    .reduce((acc, b) => acc + Number(b.total), 0);
}
```
Ya'ni: (1) kam to'langan sotuv **naqd** sifatida ortiqcha ko'rsatiladi; (2) refund'lar (`type !== 'payment'`) butunlay e'tiborsiz — kassa-chiqim ko'rsatilmaydi. Hisobotlar (`reports.service`) `signedPaidAmount` ishlatadi → summary bilan **mos kelmaydi**.

## 2. Dizayn qarori

**DECISION (task bilan berilgan):**
1. **Backend:** `SUM(totalAmount)` → `SUM(paidAmount)` (`:364`). `type`-bo'yicha guruh saqlanadi, shuning uchun refund qatorlari alohida chiqadi (`type='refund'`); frontend ularni naqd-chiqim sifatida ko'rsatishi mumkin.
2. **Frontend:** naqd-chiqimni **har metod bo'yicha** ayirish (refund cash → cash ulushidan, refund card → card ulushidan) VA ko'rinadigan kassa-chiqim qatori ko'rsatish. Faqat umumiy net'ni chiqarish yetarli EMAS — aks holda cash/card ulushlari ortiqcha qolaveradi.

**CLI-406 bilan bog'liqlik:** void olib tashlangach, refund qatori `status='completed'` (refund kunida yaratilgan) → `dailySummary`'ning `status='completed'` filtridan **o'tadi** va o'z kunida naqd-chiqim sifatida ko'rinadi. Asl sotuv esa o'z kunida (yaratilgan kun) to'liq naqd bilan qoladi — retroaktiv o'zgarish yo'q. Agar CLI-406 hali qo'llanmagan bo'lsa: full-refund asli void bo'lgani uchun summary'dan chiqadi (kam ta'sir), lekin refund kuni chiqim baribir ko'rinadi. Ikki ticket birga eng izchil natija beradi.

**Rad etilgan alternativa:** summary'da faqat net bitta raqam qaytarish (type/method breakdown'siz) — rad: kassir naqd/karta bo'yicha va chiqim bo'yicha detal ko'rishi kerak (kassa yopilishi jarayoni); breakdown UI'da allaqachon ishlatiladi.

## 3. Spec — xulq + edge case'lar + test case'lar

**Invariant:** kunlik summary `total` = o'sha metod+type uchun **haqiqatda harakatlangan naqd** (`paidAmount`), hisob-faktura emas. Sof kassa = Σ payment.paidAmount − Σ refund.paidAmount (metod bo'yicha ajratilgan).

Edge case'lar:
- **E1 — kam to'langan sotuv:** totalAmount=1,000,000, paidAmount=800,000 (cash). Summary cash payment `total` = **800,000** (hozir 1,000,000 ko'rsatadi — xato).
- **E2 — to'liq-refundlangan sotuv (refund kuni):** Iyun10 payment 1,000,000 (cash), Iyun12 refund. Iyun10 summary: cash payment 1,000,000. Iyun12 summary: cash refund qatori 1,000,000 (naqd-chiqim). Frontend Iyun12 sof kassa = −1,000,000 ko'rsatadi.
- **E3 — bir kunda sotuv + refund:** cash payment 1,000,000 + cash refund 400,000 → payment qatori 1,000,000, refund qatori 400,000; frontend sof cash = 600,000.
- **E4 — aralash metod:** cash payment 500,000 + card payment 300,000 + card refund 100,000 → cash ulush 500,000, card ulush 300,000−100,000=200,000.
- **E5 — refund yo'q:** faqat to'liq to'langan payment'lar → oldingi xulq (paidAmount=totalAmount).

Konkret test case'lar:
- **Backend** (`bun test`, `cli-419-daily-summary.test.ts`):
  1. `underpaid-sale-shows-received-cash`: totalAmount=1,000,000, paidAmount=800,000 → summary breakdown[payment,cash].total === "800000".
  2. `refund-shows-cash-out-on-refund-day`: refund kunidagi summary'da `type='refund'` qatori paidAmount bilan mavjud.
- **Frontend** (vitest, `DailySummaryCard.test.tsx` yoki mavjud test kengaytmasi):
  3. `net-cash-per-method`: breakdown payment cash 1,000,000 + refund cash 400,000 → ko'rsatilgan cash = 600,000; kassa-chiqim qatori 400,000 ko'rinadi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test (backend)** — `cli-419-daily-summary.test.ts` test #1: underpaid sotuv → `total === "800000"` kutiladi, hozir "1000000" — **qizil**.
2. **Impl (backend)** — `cashier.service.ts:364`:
   ```ts
   total: sql<string>`SUM(${cashierTransactions.paidAmount})`,  // totalAmount → paidAmount
   ```
   Qolgan query (guruhlash, filtr) o'zgarmaydi. `dailySummaryDtoSchema` (`cashier.schema.ts:145-158`) o'zgarmaydi (`total: z.string()`, `type` allaqachon breakdown'da).
3. **Failing test (frontend)** — `DailySummaryCard` refund qatorli breakdown bilan test; net-per-method va chiqim qatori kutiladi — **qizil**.
4. **Impl (frontend)** — `DailySummaryCard.tsx`:
   - `sumByMethod`'ni signed qil (yoki alohida `refundByMethod` qo'sh): `cashNet = payments.cash − refunds.cash`, `cardNet = payments.card − refunds.card`.
   - `totalRevenue` = Σ payment − Σ refund.
   - Refund mavjud bo'lsa **ko'rinadigan kassa-chiqim qatori** qo'sh (`t('cashier.cash_out')` yangi i18n kaliti — `uz.json`+`ru.json` ikkalasiga; §3.9).
   - `:21` izohni yangila ("refund endi hisobga olinadi").
5. **Verify** — `cd apps/api && bun test --env-file=../../.env cli-419-daily-summary`; `cd apps/web && vitest DailySummaryCard`; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya yo'q** — read-path (backend agregatsiya) + displey (frontend). Schema o'zgarmaydi.
- **Bog'liqlik tartibi:** CLI-406 dan KEYIN (yoki birga) qo'llash tavsiya etiladi — u refund qatorlarini `completed` qilib summary'da ko'rinadigan qiladi va void'ning retroaktiv kun-o'zgarishini yo'qotadi. CLI-419 mustaqil ham to'g'ri ishlaydi (paidAmount fix + refund displey), lekin eng izchil kassa oqimi ikkovi birga.
- **i18n xavfi:** yangi `cashier.cash_out` kaliti `uz.json` VA `ru.json` ikkalasiga qo'shilishi shart (aks holda missing-key). Audit "1161 kalit, 0 missing" deb tasdiqlagan — bu holatni buzmaslik.
- **Rollout ta'siri:** kassa yopilish raqamlari endi hisobotlar (`reports.revenue`) bilan mos keladi (ikkalasi `paidAmount`/signed). Kam to'langan sotuvi ko'p klinikalarda kunlik "tushum" pasayadi — bu to'g'rilanish, regressiya emas.

## 6. Qabul mezonlari

- [ ] `dailySummary` `SUM(paidAmount)` ishlatadi (`totalAmount` emas).
- [ ] Kam to'langan sotuv summary'da olingan naqdni ko'rsatadi (backend test #1).
- [ ] Refund qatori refund kunida naqd-chiqim sifatida chiqadi (backend test #2).
- [ ] Frontend har metod bo'yicha sof naqdni ko'rsatadi + ko'rinadigan kassa-chiqim qatori (frontend test #3).
- [ ] `cashier.cash_out` kaliti uz+ru da mavjud.
- [ ] Summary raqamlari `reports.revenue` bilan izchil; `bun run typecheck` toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/cashier/cashier.service.ts` — `dailySummary` `:364` `totalAmount` → `paidAmount`.
- `apps/web/src/features/cashier/components/DailySummaryCard.tsx` — signed per-method net + kassa-chiqim qatori; `:21` izoh.
- `packages/i18n/.../uz.json`, `.../ru.json` — `cashier.cash_out` kaliti.
- `apps/api/tests/integration/cli-419-daily-summary.test.ts` — YANGI.
- `apps/web/.../DailySummaryCard.test.tsx` — YANGI yoki kengaytiriladi.
