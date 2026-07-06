# CLI-413 — Per-stage overpay guard chetlab o'tiladi (takror stageId + TOCTOU)

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgartirilmagan). Audit: `AUDIT-2026-07-06.md` H9.

## 1. Muammo va ildiz sabab

`cashier.service.ts:166-193` (`create` → allocation guard):

```ts
for (const a of input.allocations) {
  const [stage] = await tx.select({ cost: treatmentStages.cost })
    .from(treatmentStages).where(eq(treatmentStages.id, a.stageId));   // LOCK YO'Q
  if (!stage) throw new AllocationExceedError();
  const [paidRow] = await tx.select({
      paid: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
    }).from(treatmentStagePayments).where(eq(treatmentStagePayments.stageId, a.stageId));
  const existingPaid = Number(paidRow?.paid ?? 0);
  if (existingPaid + a.amount > Number(stage.cost)) throw new AllocationExceedError();
}
await tx.insert(treatmentStagePayments).values(input.allocations.map(...));  // hammasi keyin
```

Ikki teshik:

**(a) Bir request ichida takror `stageId`.** Guard har allocation'ni **mustaqil** DB-SUM'ga tekshiradi, bir request ichidagi bir xil stage allocation'larini **yig'maydi**. Insert esa tsikldan KEYIN bo'ladi, shuning uchun DB-SUM ikkalasida ham eski qiymatni ko'radi.
- Determinstik: `allocations = [{X, 100000}, {X, 100000}]`, `stage.cost = 100000` → har biri `0 + 100000 ≤ 100000` ko'radi → ikkalasi ham o'tadi → 100k bosqichga 200k yoziladi.

**(b) Concurrent TOCTOU.** Stage row **lock qilinmaydi** (refund'dagi `.for('update')` — `:248` — dan farqli). Ikki kassir bir stage'ga bir vaqtda 100k → ikkalasi ham `existingPaid=0` o'qiydi → 200k.

Oqibat: `treatment_stage_payments` bosqich `cost`'idan oshadi → phantom kredit → bemor/plan balansi noto'g'ri (manfiy), refund proporsiyasi buziladi.

## 2. Dizayn qarori

Ikki qismli tuzatish (task DECISION):

**(a) Request ichida `stageId` bo'yicha agregatsiya** — guard'dan OLDIN allocation'larni `stageId` bo'yicha yig'ib, `cost` bilan **stage boshiga bir marta** solishtirish.

**(b) `SELECT ... FOR UPDATE` stage row'da** — refund'ning `.for('update')` mexanizmini ko'zgu qilib, stage cost SELECT'ini lock bilan olish. Bu bir stage'ga bir vaqtda insert qilayotgan tranzaksiyalarni **serializatsiya** qiladi.

Muhim tartib va nozikliklar:
- **Lock → SUM o'qish → solishtirish → insert.** SUM o'qishi lock'dan KEYIN bo'lishi shart, aks holda konkurent tranzaksiyaning commit qilingan oldingi insert'ini ko'rmaydi.
- **Faqat GUARD agregatsiya qiladi**; insert alohida qatorlarni saqlashi mumkin (keyingi `SUM` dublikatlarni baribir yig'adi) — over-dedup qilinmaydi.
- **Deadlock oldini olish:** stage lock'lar **deterministik tartibda** (`stageId` bo'yicha sort) olinadi — ikki request bir xil stage to'plamiga teskari tartibda tegib qolsa deadlock bo'lmaydi.

**Rad etilgan alternativa:** DB CHECK/trigger `SUM ≤ cost` — rad: tenant-scoped, cross-row aggregate constraint Postgres'da trigger talab qiladi (RLS + performance murakkabligi); application-level guard + row-lock yetarli va refund bilan izchil.

## 3. Spec — xulq + edge case'lar + test case'lar

**Invariant:** har `treatment_stage` uchun `Σ treatment_stage_payments.amount (ijobiy to'lovlar, bir tx muvaffaqiyatidan keyin) ≤ stage.cost`.

Edge case'lar:
- **E1 — request ichida takror stageId, yig'indi = cost:** `[{X,60000},{X,40000}]`, cost=100000 → **qabul** (yig'indi 100k ≤ 100k), 2 qator insert.
- **E2 — request ichida takror stageId, yig'indi > cost:** `[{X,100000},{X,100000}]`, cost=100000 → **`AllocationExceedError`** (400), hech narsa insert qilinmaydi (tx rollback).
- **E3 — mavjud to'lov + request:** stage'da allaqachon 70000, request `[{X,40000}]`, cost=100000 → rad (70k+40k>100k).
- **E4 — concurrent double-pay:** ikki tx bir stage'ga 100000 (cost=100000) → lock serializatsiya qiladi → biri o'tadi, ikkinchisi `existingPaid=100000` ko'radi → rad.
- **E5 — ko'p stage, aralash:** `[{X,50000},{Y,50000}]`, ikkalasi cost=100000 → qabul (har stage alohida).
- **E6 — refund negative allocation:** guard faqat `create` yo'lida; refund'ning manfiy allocation'lari (`:322-331`) o'zgarmaydi.

Konkret test case'lar (`bun test`):
1. `dup-stage-over-cost-rejected`: `[{X,100000},{X,100000}]`, cost=100000 → `AllocationExceedError`; DB'da 0 qator.
2. `dup-stage-within-cost-accepted`: `[{X,60000},{X,40000}]` → muvaffaqiyat; `SUM=100000`.
3. `concurrent-double-pay-serialized`: ikki parallel `create` promise bir stage'ga 100000 → aynan biri muvaffaqiyat, biri `AllocationExceedError`; yakuniy `SUM=100000`. (Ikki alohida ulanish/tx bilan; `FOR UPDATE` kutishini tekshirish.)

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `apps/api/tests/integration/cli-413-overpay-guard.test.ts`. Test #1 (dup-stage) hozir **qizil** (200k insert bo'ladi). Test #3 (concurrent) uchun ikki tranzaksiya/ulanish.
2. **Impl** — `cashier.service.ts` `create()` allocation blokini qayta yoz:
   ```ts
   if (input.allocations && input.allocations.length > 0) {
     // (a) request ichida stageId bo'yicha yig'ish
     const wantByStage = new Map<string, number>();
     for (const a of input.allocations)
       wantByStage.set(a.stageId, (wantByStage.get(a.stageId) ?? 0) + a.amount);
     // deterministik tartib (deadlock oldini olish)
     const stageIds = [...wantByStage.keys()].sort();
     for (const stageId of stageIds) {
       // (b) stage row lock — SUM o'qishdan OLDIN
       const [stage] = await tx.select({ cost: treatmentStages.cost })
         .from(treatmentStages).where(eq(treatmentStages.id, stageId)).for('update');
       if (!stage) throw new AllocationExceedError();
       const [paidRow] = await tx.select({
           paid: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
         }).from(treatmentStagePayments).where(eq(treatmentStagePayments.stageId, stageId));
       const existingPaid = Number(paidRow?.paid ?? 0);
       if (existingPaid + (wantByStage.get(stageId) ?? 0) > Number(stage.cost))
         throw new AllocationExceedError();
     }
     // insert — alohida qatorlar (dedup QILINMAYDI)
     await tx.insert(treatmentStagePayments).values(input.allocations.map((a) => ({
       tenantId, transactionId: transaction.id, stageId: a.stageId, amount: String(a.amount),
     })));
   }
   ```
3. **Verify** — `cd apps/api && bun test --env-file=../../.env cli-413-overpay-guard`; `cli-244`/`cashier-plan-balance` regressiyasiz; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya yo'q** — faqat application mantiq. Schema o'zgarmaydi.
- **Xavf — mavjud phantom-kredit qatorlar:** tuzatishdan oldin oshib ketgan allocation'lar bo'lishi mumkin. Tuzatish yangi over-allocation'ni bloklaydi, tarixiy qatorlarni tozalamaydi. **Tavsiya:** bir martalik audit query bilan `Σ payments > cost` bo'lgan stage'larni topib qo'lda ko'rib chiqish (avtomatik backfill YO'Q — moliyaviy qaror inson nazoratini talab qiladi). Bu CLI-413 blokeri emas.
- **Konkurentlik xavfi (deadlock):** `stageId` sort tartibi bir xil stage to'plamiga teskari tartibli ikki request'da deadlock oldini oladi. `FOR UPDATE` faqat `treatmentStages` row'ini lock qiladi — RLS tx `SET LOCAL` handshake'iga ta'sir qilmaydi.
- **Performance:** stage boshiga 1 lock SELECT + 1 SUM SELECT — allocation soni odatda kichik (≤ bir necha bosqich); sezilarli ta'sir yo'q.

## 6. Qabul mezonlari

- [ ] Bir request ichida takror stageId yig'indisi cost'dan oshsa → `AllocationExceedError` (test #1).
- [ ] Takror stageId yig'indisi cost ichida bo'lsa → qabul (test #2).
- [ ] Concurrent double-pay serializatsiya qilinadi; aynan biri o'tadi (test #3).
- [ ] Stage cost SELECT `.for('update')` bilan; SUM o'qishi lock'dan keyin.
- [ ] Lock'lar `stageId` bo'yicha sort qilingan tartibda.
- [ ] `cli-244` / `cashier-plan-balance` regressiyasiz; `bun run typecheck` toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/cashier/cashier.service.ts` — `create()` allocation guard (`:166-193`) qayta yoziladi (agregatsiya + `.for('update')` + sort).
- `apps/api/tests/integration/cli-413-overpay-guard.test.ts` — YANGI.
