# R3 Bemor balansi — Implementation Plan (CLI-67)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bemorning umumiy balansini (qarz/kredit) computed shaklda hisoblab, bemorlar ro'yxati, bemor kartasi va kassa ekranlarida ko'rsatish.

**Architecture:** Plan-inclusive computed balans (`planDebt + nonPlanBalance`), sof helper + service aggregate (yondashuv A, yangi DB obyekti yo'q). R2 billing poydevori (`treatment_stage_payments`) iste'mol qilinadi. RLS `getDb(c)` orqali. api-client qo'lda kengaytiriladi.

**Tech Stack:** Bun, Hono, Drizzle, Zod, Vitest (backend); React 18, Mantine v7, TanStack Query (frontend).

**Spec:** [`docs/superpowers/specs/2026-06-11-r3-patient-balance-design.md`](../specs/2026-06-11-r3-patient-balance-design.md)

---

## Parallel-agent topologiya

| To'lqin | Tasklar | Parallel? | Bog'liqlik |
|---|---|---|---|
| **A** | Task 1→2→3 (backend, 1 agent) ∥ Task 4 (docs, 1 agent) | A-backend va A-docs parallel | — |
| **B** | Task 5 (api-client) | ketma-ket | A-backend tugagach |
| **C** | Task 6 (shared FE primitivlar + i18n) | ketma-ket | B tugagach |
| **D** | Task 7 (LIST) ∥ Task 8 (CARD) ∥ Task 9 (CASHIER) | 3 agent parallel | C tugagach |

Task 1→2→3 bitta agent/worktree ichida ketma-ket (tig'iz bog'langan, har xil fayl). To'lqinlar orasida barrier = tip kontrakti oqimi.

**Verifikatsiya komandalari (har backend/api-client taskdan keyin):**
- `bun --filter @dental/api typecheck`
- `bun --filter @dental/api-client typecheck`
- `bun --filter @dental/web typecheck`
- `bun --filter @dental/api test` (vitest)
- `bun run check:rls` (RLS coverage lint)

---

## Task 1: Sof balans helper (`patients.balance.ts`) — TDD

**Files:**
- Create: `apps/api/src/modules/patients/patients.balance.ts`
- Test: `apps/api/src/modules/patients/patients.balance.test.ts`

- [ ] **Step 1: Failing test yozish**

`apps/api/src/modules/patients/patients.balance.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computePatientBalance } from './patients.balance.ts';

describe('computePatientBalance', () => {
  it('bo\'sh — hammasi 0', () => {
    expect(computePatientBalance({ stageCostSum: 0, allocationSum: 0, nonPlanRemainder: 0 })).toEqual(
      { balance: 0, planDebt: 0, nonPlanBalance: 0 },
    );
  });

  it('faqat plan qarzi (to\'lanmagan)', () => {
    const r = computePatientBalance({ stageCostSum: 150000, allocationSum: 0, nonPlanRemainder: 0 });
    expect(r).toEqual({ balance: 150000, planDebt: 150000, nonPlanBalance: 0 });
  });

  it('qisman to\'lov — plan qarzi kamayadi', () => {
    const r = computePatientBalance({ stageCostSum: 150000, allocationSum: 40000, nonPlanRemainder: 0 });
    expect(r.planDebt).toBe(110000);
    expect(r.balance).toBe(110000);
  });

  it('refund negatsiyasi (manfiy allocation) qarzni tiklaydi', () => {
    // alloc 40000 + (-40000) = 0 → qarz to'liq tiklanadi
    const r = computePatientBalance({ stageCostSum: 150000, allocationSum: 0, nonPlanRemainder: 0 });
    expect(r.balance).toBe(150000);
  });

  it('kredit — overpay manfiy balans beradi', () => {
    const r = computePatientBalance({ stageCostSum: 100000, allocationSum: 120000, nonPlanRemainder: 0 });
    expect(r.planDebt).toBe(-20000);
    expect(r.balance).toBe(-20000);
  });

  it('faqat plansiz qoldiq', () => {
    const r = computePatientBalance({ stageCostSum: 0, allocationSum: 0, nonPlanRemainder: 60000 });
    expect(r).toEqual({ balance: 60000, planDebt: 0, nonPlanBalance: 60000 });
  });

  it('plan + plansiz aralash', () => {
    const r = computePatientBalance({ stageCostSum: 150000, allocationSum: 40000, nonPlanRemainder: 30000 });
    expect(r.planDebt).toBe(110000);
    expect(r.nonPlanBalance).toBe(30000);
    expect(r.balance).toBe(140000);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, fail bo'lishini tekshirish**

Run: `bun --filter @dental/api test patients.balance`
Expected: FAIL — "Cannot find module './patients.balance.ts'"

- [ ] **Step 3: Helper implementatsiyasi**

`apps/api/src/modules/patients/patients.balance.ts`:
```ts
/**
 * Bemor balansi — SOF funksiya (Context/Drizzle YO'Q).
 * Service aggregate query'lar yig'indilarni beradi, keyin shuni chaqiradi.
 * planDebt = stageCostSum − allocationSum (accepted/in_progress/completed rejalar).
 * nonPlanBalance = plansiz kassa qoldig'i (payment − paid, plan_id IS NULL, completed).
 * balance > 0 = qarz, < 0 = kredit.
 */
export type PatientBalanceInput = {
  stageCostSum: number;
  allocationSum: number;
  nonPlanRemainder: number;
};

export type PatientBalance = {
  balance: number;
  planDebt: number;
  nonPlanBalance: number;
};

export function computePatientBalance(input: PatientBalanceInput): PatientBalance {
  const planDebt = input.stageCostSum - input.allocationSum;
  const nonPlanBalance = input.nonPlanRemainder;
  return { balance: planDebt + nonPlanBalance, planDebt, nonPlanBalance };
}
```

- [ ] **Step 4: Testni ishga tushirib, pass bo'lishini tekshirish**

Run: `bun --filter @dental/api test patients.balance`
Expected: PASS (7 test)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/patients/patients.balance.ts apps/api/src/modules/patients/patients.balance.test.ts
git commit -m "feat(api): patients balance sof helper + unit test (CLI-67)"
```

---

## Task 2: Service — `balanceFor` + list balance join

**Files:**
- Modify: `apps/api/src/modules/patients/patients.service.ts`

> Backend service uchun unit harness yo'q (faqat helper). Verifikatsiya: typecheck + helper test + manual. Mirror: `cashier.service.ts` aggregate uslubi.

- [ ] **Step 1: Import qatorini yangilash**

`patients.service.ts` boshidagi importlarni quyidagiga moslashtirish (qo'shiladi: `treatmentPlans`, `treatmentStages`, `treatmentStagePayments`, `cashierTransactions`, va drizzle'dan `inArray`):
```ts
import {
  cashierTransactions,
  medicalRecords,
  patients,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import { computePatientBalance } from './patients.balance.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
```

- [ ] **Step 2: Qualifying status konstantasi + helper qo'shish (fayl tepasiga, `createPatientsService` dan oldin)**

```ts
/** Qarzga kiruvchi reja statuslari — draft/presented/cancelled chiqariladi. */
const DEBT_PLAN_STATUSES = ['accepted', 'in_progress', 'completed'] as const;
```

- [ ] **Step 3: `balanceFor` funksiyasi qo'shish (`createPatientsService` ichiga, `list` dan keyin)**

```ts
  /** Bemor umumiy balansi — computed (saqlanmaydi). RLS tenant orqali filtrlaydi. */
  async function balanceFor(c: Context, patientId: string) {
    const db = getDb(c);

    const [costRow] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStages.cost}), 0)` })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          eq(treatmentPlans.patientId, patientId),
          inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
        ),
      );

    const [allocRow] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)` })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          eq(treatmentPlans.patientId, patientId),
          inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
        ),
      );

    const [nonPlanRow] = await db
      .select({
        sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.patientId, patientId),
          eq(cashierTransactions.type, 'payment'),
          eq(cashierTransactions.status, 'completed'),
          isNull(cashierTransactions.treatmentPlanId),
        ),
      );

    return computePatientBalance({
      stageCostSum: Number(costRow?.sum ?? 0),
      allocationSum: Number(allocRow?.sum ?? 0),
      nonPlanRemainder: Number(nonPlanRow?.sum ?? 0),
    });
  }
```

- [ ] **Step 4: `list` ni balance bilan kengaytirish**

`list` funksiyasidagi `const data = hasPii ? rows : rows.map(maskPii);` qatoridan OLDIN, `rows` olingandan keyin balance map qurish. `const data = ...` va `return` ni quyidagiga almashtirish:
```ts
    // Sahifa bemorlari uchun balansni 3 ta guruhlangan aggregate bilan (N+1 yo'q, fan-out yo'q)
    const ids = rows.map((r) => r.id);
    const balanceById = new Map<string, number>();

    if (ids.length > 0) {
      const [costRows, allocRows, nonPlanRows] = await Promise.all([
        db
          .select({
            patientId: treatmentPlans.patientId,
            sum: sql<string>`COALESCE(SUM(${treatmentStages.cost}), 0)`,
          })
          .from(treatmentStages)
          .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
          .where(
            and(
              inArray(treatmentPlans.patientId, ids),
              inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
            ),
          )
          .groupBy(treatmentPlans.patientId),
        db
          .select({
            patientId: treatmentPlans.patientId,
            sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
          })
          .from(treatmentStagePayments)
          .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
          .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
          .where(
            and(
              inArray(treatmentPlans.patientId, ids),
              inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),
            ),
          )
          .groupBy(treatmentPlans.patientId),
        db
          .select({
            patientId: cashierTransactions.patientId,
            sum: sql<string>`COALESCE(SUM(${cashierTransactions.totalAmount} - ${cashierTransactions.paidAmount}), 0)`,
          })
          .from(cashierTransactions)
          .where(
            and(
              inArray(cashierTransactions.patientId, ids),
              eq(cashierTransactions.type, 'payment'),
              eq(cashierTransactions.status, 'completed'),
              isNull(cashierTransactions.treatmentPlanId),
            ),
          )
          .groupBy(cashierTransactions.patientId),
      ]);

      const costById = new Map(costRows.map((r) => [r.patientId, Number(r.sum)]));
      const allocById = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));
      const nonPlanByIdRaw = new Map(
        nonPlanRows.map((r) => [r.patientId as string, Number(r.sum)]),
      );

      for (const id of ids) {
        const { balance } = computePatientBalance({
          stageCostSum: costById.get(id) ?? 0,
          allocationSum: allocById.get(id) ?? 0,
          nonPlanRemainder: nonPlanByIdRaw.get(id) ?? 0,
        });
        balanceById.set(id, balance);
      }
    }

    const hasPii = userHasPiiAccess(c);
    const masked = hasPii ? rows : rows.map(maskPii);
    const data = masked.map((p) => ({ ...p, balance: balanceById.get(p.id) ?? 0 }));
    const total = totalRows[0]?.total ?? 0;

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
```
> Eski `const hasPii`, `const data`, `const total`, `return` bloklarini shu blok bilan almashtirish (dublikatsiya bo'lmasin).

- [ ] **Step 5: `balanceFor` ni return obyektiga qo'shish**

`return { list, findById, ... }` ga `balanceFor` qo'shish:
```ts
  return {
    list,
    findById,
    balanceFor,
    create,
    update,
    archive,
    getMedicalRecord,
    updateMedicalRecord,
  };
```

- [ ] **Step 6: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: xato yo'q.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/patients/patients.service.ts
git commit -m "feat(api): patients balanceFor + list balance aggregate (CLI-67)"
```

---

## Task 3: Schema + Route — `GET /:id/balance`

**Files:**
- Modify: `apps/api/src/modules/patients/patients.schema.ts`
- Modify: `apps/api/src/modules/patients/patients.routes.ts`

- [ ] **Step 1: Schema qo'shish (`patients.schema.ts` oxiriga)**

```ts
export const patientBalanceSchema = z.object({
  balance: z.number(),
  planDebt: z.number(),
  nonPlanBalance: z.number(),
});
export type PatientBalanceDto = z.infer<typeof patientBalanceSchema>;
```

- [ ] **Step 2: Route qo'shish (`patients.routes.ts`, `GET /:id` dan keyin)**

```ts
  app.get('/:id/balance', requirePermission('patient.view'), async (c) => {
    return c.json(ok(await service.balanceFor(c, c.req.param('id'))));
  });
```

- [ ] **Step 3: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: xato yo'q.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/patients/patients.schema.ts apps/api/src/modules/patients/patients.routes.ts
git commit -m "feat(api): GET /patients/:id/balance endpoint + schema (CLI-67)"
```

- [ ] **Step 5: To'liq backend verifikatsiya**

Run: `bun --filter @dental/api typecheck && bun --filter @dental/api test && bun run check:rls`
Expected: hammasi PASS. (Bu Wave A-backend yakuni — barrier B oldidan.)

---

## Task 4: Docs (Wave A — A-backend'ga PARALLEL, kod kesishmaydi)

**Files:**
- Modify: `docs/rfcs/0005-patient-balance-ledger.md`
- Modify: `~/Документы/Obsidian Vault/Projects/dental-service/01-Qarorlar.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: RFC-0005 yangilash**

`docs/rfcs/0005-patient-balance-ledger.md` da "Qaror" bo'limini plan-inclusive modelga yangilash:
- Status'ga qo'shish: `> ⚠️ Yangilandi 2026-06-11 (CLI-67): plan-inclusive model qabul qilindi. Eski "faqat cashier SUM" formula superseded.`
- §1 formulani almashtirish: `patient_balance = planDebt + nonPlanBalance`, bunda:
  - `planDebt = Σ(treatment_stages.cost) − Σ(treatment_stage_payments.amount)` (status accepted/in_progress/completed)
  - `nonPlanBalance = Σ(type=payment, status=completed, treatment_plan_id IS NULL)(totalAmount − paidAmount)`
- Refund: void + manfiy allocation orqali (alohida ayirish emas).

- [ ] **Step 2: Qaror #13 qo'shish (`01-Qarorlar.md` oxiriga)**

```markdown
## Qaror #13: R3 bemor balansi — plan-inclusive computed (2026-06-11)

- **Savol:** Bemor umumiy balansi faqat kassa tranzaksiyalaridan (RFC-0005 eski) yoki qabul qilingan reja qarzini ham qamraydimi?
- **Qaror:** **plan-inclusive** — `balance = planDebt + nonPlanBalance`. planDebt = stage.cost − allocations (accepted/in_progress/completed rejalar); nonPlanBalance = plansiz kassa qoldig'i. Refund: void + manfiy allocation. **Computed, saqlanmaydi.**
- **Sabab:** Qaror #11 billing poydevori (treatment_stage_payments) qabul qilingan reja qarzini modellaydi — R3 buni iste'mol qiladi; faqat cashier SUM rejaga taqsimlangan qarzni o'tkazib yuborardi. Double-count: nonPlan faqat treatment_plan_id IS NULL tranzaksiyalardan.
- **Oqibat:** RFC-0005 yangilandi (eski formula superseded). Spec: `docs/superpowers/specs/2026-06-11-r3-patient-balance-design.md`. Yangi DB obyekti yo'q.
```

- [ ] **Step 3: CLAUDE.md progress pointer yangilash**

CLAUDE.md tepasidagi "Progress" qatorida R3 boshlanganini va Qaror #13 ni eslatish (`Arxitektura qarorlari` qatoriga `#13 R3 balansi` qo'shish).

- [ ] **Step 4: Commit**

```bash
git add docs/rfcs/0005-patient-balance-ledger.md CLAUDE.md
git commit -m "docs: RFC-0005 plan-inclusive yangilash + Qaror #13 pointer (CLI-67)"
```
> Obsidian vault git'dan tashqarida bo'lishi mumkin — agar shunday bo'lsa, faqat repo fayllari commit qilinadi.

---

## Task 5: api-client (Wave B — A-backend tugagach)

**Files:**
- Modify: `packages/api-client/src/types-patients.ts`
- Modify: `packages/api-client/src/endpoints.ts`

- [ ] **Step 1: Tip qo'shish (`types-patients.ts`)**

`PatientListResponse` dan oldin/keyin:
```ts
export type PatientListItem = Patient & { balance: number };

export type PatientBalance = {
  balance: number;
  planDebt: number;
  nonPlanBalance: number;
};
```
`PatientListResponse` ni yangilash:
```ts
export type PatientListResponse = {
  data: PatientListItem[];
  meta: { page: number; pageSize: number; total: number };
};
```

- [ ] **Step 2: Endpoint qo'shish (`endpoints.ts`, `patients` bloki ichida `get` dan keyin)**

```ts
    balance: (id: string) => api.get<PatientBalance>(`/api/patients/${id}/balance`),
```
Va `endpoints.ts` tepasidagi `from './types-patients.ts'` importiga `PatientBalance` qo'shish (agar tip nomi import qilinsa). Agar `endpoints.ts` `import type { ... } from './types-patients.ts'` ishlatsa — `PatientBalance` qo'shing.

- [ ] **Step 3: Typecheck (api-client + web — `data` endi `PatientListItem[]`)**

Run: `bun --filter @dental/api-client typecheck && bun --filter @dental/web typecheck`
Expected: xato yo'q (`PatientListItem` `Patient` ni kengaytirgani uchun mavjud `toPatientListItem(p)` ishlaydi).

- [ ] **Step 4: Commit**

```bash
git add packages/api-client/src/types-patients.ts packages/api-client/src/endpoints.ts
git commit -m "feat(api-client): patient balance endpoint + list balance maydoni (CLI-67)"
```

---

## Task 6: Shared frontend primitivlar + i18n (Wave C — B tugagach)

> LIST/CARD/CASHIER bir xil faylga yozmasligi uchun shared qism OLDIN. Bu task yakka bajariladi.

**Files:**
- Create: `apps/web/src/components/BalanceBadge.tsx`
- Modify: `apps/web/src/features/patients/patients.api.ts`
- Modify: `apps/web/src/features/patients/patients.types.ts`
- Modify: `apps/web/src/features/patients/patients.mappers.ts`
- Modify: `apps/web/src/features/patients/patients.mappers.test.ts`
- Modify: `packages/i18n/src/uz.json`, `packages/i18n/src/ru.json` (yoki mavjud i18n fayl joylashuvi)

- [ ] **Step 1: `BalanceBadge` komponent (app-shared)**

`apps/web/src/components/BalanceBadge.tsx`:
```tsx
import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const formatUZS = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(Math.abs(n))} so'm`;

/** Balans ko'rsatkichi: qarz qizil (+), kredit yashil (−), 0 dimmed. */
export function BalanceBadge({ balance, size = 'sm' }: { balance: number; size?: string }) {
  const { t } = useTranslation();
  if (balance === 0) {
    return (
      <Text size={size} c="dimmed">
        {formatUZS(0)}
      </Text>
    );
  }
  const isDebt = balance > 0;
  return (
    <Text size={size} fw={600} c={isDebt ? 'red' : 'teal'}>
      {isDebt ? '' : '−'}
      {formatUZS(balance)}{' '}
      <Text span size="xs" c="dimmed">
        {isDebt ? t('patients.balance_debt') : t('patients.balance_credit')}
      </Text>
    </Text>
  );
}
```

- [ ] **Step 2: i18n kalitlari (uz.json + ru.json `patients` bo'limiga)**

uz.json:
```json
"balance": "Balans",
"balance_debt": "qarz",
"balance_credit": "kredit"
```
ru.json:
```json
"balance": "Баланс",
"balance_debt": "долг",
"balance_credit": "кредит"
```

- [ ] **Step 3: `useBalance` hook (`patients.api.ts` oxiriga)**

```ts
export function usePatientBalance(id: string) {
  return useQuery({
    queryKey: patientKeys.balance(id),
    queryFn: () => api.patients.balance(id),
    enabled: !!id,
  });
}
```
Va `patients.keys.ts` ga `balance` kalit qo'shish:
```ts
  balance: (id: string) => ['patients', 'balance', id] as const,
```

- [ ] **Step 4: List-item tipiga + mapper'ga balance ulash**

`patients.types.ts` — `PatientListItem` ga `balance: number` qo'shish; import'ni `PatientListItem as PatientListItemDto` dan ApiListItem'ga moslashtirish:
```ts
import type { Patient, PatientListItem as PatientListItemDto } from '@dental/api-client';
// ...
export type PatientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  age: number | null;
  genderLabel: string;
  tags: string[];
  balance: number;
};
```
`patients.mappers.ts` — `toPatientListItem` signaturasini `PatientListItemDto` qabul qiladigan qilish va `balance` ni map qilish:
```ts
import type { Patient, PatientListItem as PatientListItemDto } from '@dental/api-client';
// ...
export function toPatientListItem(p: PatientListItemDto, t: TFn): PatientListItem {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    age: calcAge(p.dateOfBirth),
    genderLabel: genderLabel(p.gender, t),
    tags: p.tags ?? [],
    balance: p.balance,
  };
}
```

- [ ] **Step 5: Mapper test yangilash**

`patients.mappers.test.ts` da `toPatientListItem` chaqiruvlariga test fixture'ga `balance: <n>` qo'shish va bitta assert:
```ts
// fixture obyektiga: balance: 150000
// assert:
expect(item.balance).toBe(150000);
```

- [ ] **Step 6: Verifikatsiya**

Run: `bun --filter @dental/web typecheck && bun --filter @dental/web test patients.mappers`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/BalanceBadge.tsx apps/web/src/features/patients/patients.api.ts apps/web/src/features/patients/patients.keys.ts apps/web/src/features/patients/patients.types.ts apps/web/src/features/patients/patients.mappers.ts apps/web/src/features/patients/patients.mappers.test.ts packages/i18n/src/uz.json packages/i18n/src/ru.json
git commit -m "feat(web): shared balans primitivlar — BalanceBadge, useBalance, mapper, i18n (CLI-67)"
```

---

## Task 7: LIST — patients ro'yxatiga Balans ustuni (Wave D — parallel)

**Files:**
- Modify: `apps/web/src/features/patients/components/PatientsListScreen.tsx`
- Modify: `apps/web/src/features/patients/components/PatientsListScreen.test.tsx`

- [ ] **Step 1: Jadval header'iga Balans ustuni**

`PatientsListScreen.tsx` Table.Thead'ga (mos joyga, masalan teglardan keyin):
```tsx
<Table.Th>{t('patients.balance')}</Table.Th>
```
Import qo'shish: `import { BalanceBadge } from '@/components/BalanceBadge';`

- [ ] **Step 2: Jadval row'iga balans katagi**

Har bemor row'iga (`{items.map(...)}` ichida):
```tsx
<Table.Td>
  <BalanceBadge balance={p.balance} />
</Table.Td>
```

- [ ] **Step 3: Test — balans ustuni ko'rinishi**

`PatientsListScreen.test.tsx` da mock list item'ga `balance` qo'shilganini va `BalanceBadge` render bo'lganini tekshirish (mavjud test fixture'ga `balance: 150000`, assert: `screen.getByText(/150/)` yoki `patients.balance` header mavjud).

- [ ] **Step 4: Verifikatsiya**

Run: `bun --filter @dental/web typecheck && bun --filter @dental/web test PatientsListScreen`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/patients/components/PatientsListScreen.tsx apps/web/src/features/patients/components/PatientsListScreen.test.tsx
git commit -m "feat(web): patients ro'yxatiga Balans ustuni (CLI-67)"
```

---

## Task 8: CARD — bemor kartasi balans (Wave D — parallel)

**Files:**
- Modify: `apps/web/src/features/patients/components/PatientCard.tsx`
- Modify: `apps/web/src/features/patients/components/tabs/PaymentsTab.tsx`

- [ ] **Step 1: PatientCard header'ida balans**

`PatientCard.tsx` da `usePatientBalance` chaqirib, header/Umumiy yonida `BalanceBadge` ko'rsatish:
```tsx
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance } from '../patients.api';
// komponent ichida:
const balanceQuery = usePatientBalance(patientId);
// JSX header'da:
{balanceQuery.data && <BalanceBadge balance={balanceQuery.data.balance} size="md" />}
```
> `patientId` mavjud prop/derived qiymatdan olinadi (PatientCard'da `id` allaqachon bor).

- [ ] **Step 2: PaymentsTab tepasida balans xulosasi**

`PaymentsTab.tsx` — tranzaksiya jadvalidan tepada balans sarlavhasi:
```tsx
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance } from '../../patients.api';
// komponent ichida:
const balanceQuery = usePatientBalance(patientId);
// Stack ichida, Table'dan oldin:
{balanceQuery.data && (
  <Group justify="space-between">
    <Text fw={600}>{t('patients.balance')}</Text>
    <BalanceBadge balance={balanceQuery.data.balance} size="md" />
  </Group>
)}
```
(`Group` import qilinganini tekshirish — `@mantine/core`.)

- [ ] **Step 3: Verifikatsiya**

Run: `bun --filter @dental/web typecheck && bun --filter @dental/web test PatientCard`
Expected: PASS (mavjud testlar buzilmaydi; balans query mock kerak bo'lsa qo'shish).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/patients/components/PatientCard.tsx apps/web/src/features/patients/components/tabs/PaymentsTab.tsx
git commit -m "feat(web): bemor kartasi + To'lovlar tab balans ko'rsatkichi (CLI-67)"
```

---

## Task 9: CASHIER — "eski balans" carry-forward (Wave D — parallel)

**Files:**
- Modify: `apps/web/src/features/cashier/components/PosPanel.tsx` (yoki bemor tanlanadigan panel)

> Maqsad: kassada bemor tanlangach, yangi tranzaksiyadan oldin uning joriy balansini ("eski balans") ko'rsatish. `usePatientBalance` ni patients feature'dan import qiladi (cross-feature, shared hook).

- [ ] **Step 1: Bemor balansini ko'rsatish**

`PosPanel.tsx` (bemor `patientId` tanlangan holatda):
```tsx
import { BalanceBadge } from '@/components/BalanceBadge';
import { usePatientBalance } from '@/features/patients/patients.api';
// komponent ichida:
const balanceQuery = usePatientBalance(selectedPatientId ?? '');
// JSX — bemor tanlangach, summary panelda:
{selectedPatientId && balanceQuery.data && (
  <Group justify="space-between">
    <Text size="sm" c="dimmed">{t('cashier.previous_balance')}</Text>
    <BalanceBadge balance={balanceQuery.data.balance} />
  </Group>
)}
```
> `selectedPatientId` o'zgaruvchi nomi mavjud panel state'iga moslashtiriladi (PosPanel'dagi haqiqiy bemor-tanlash state'i bilan).

- [ ] **Step 2: i18n kalit (`cashier` bo'limiga)**

uz.json: `"previous_balance": "Eski balans"` · ru.json: `"previous_balance": "Старый баланс"`

- [ ] **Step 3: Verifikatsiya**

Run: `bun --filter @dental/web typecheck && bun --filter @dental/web test cashier`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/cashier/components/PosPanel.tsx packages/i18n/src/uz.json packages/i18n/src/ru.json
git commit -m "feat(web): kassa eski balans carry-forward (CLI-67)"
```

---

## Yakuniy verifikatsiya (barcha to'lqinlar tugagach)

- [ ] `bun --filter @dental/api typecheck && bun --filter @dental/api-client typecheck && bun --filter @dental/web typecheck`
- [ ] `bun --filter @dental/api test && bun --filter @dental/web test`
- [ ] `bun run check:rls`
- [ ] Dev fidelity (inson, README dev server): (1) bemorlar ro'yxatida Balans ustuni; (2) bemor kartasi header + To'lovlar tab balans; (3) kassada bemor tanlanganda eski balans; (4) reja to'lovi qisman → balans kamayadi; (5) refund → balans tiklanadi; (6) draft reja qarz ko'rsatmaydi.
- [ ] Linear CLI-67 → Done; PR `feat/r3-patient-balance` → main.
