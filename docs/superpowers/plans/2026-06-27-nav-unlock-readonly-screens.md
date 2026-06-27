# Nav Unlock — Read-Only Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 ta disabled nav item'ni yoqish va plans/lab/rx/transactions uchun 4 ta yangi read-only screen yaratish.

**Architecture:** `nav-config.ts`dan `disabled: true` olib tashlanadi; har screen uchun thin component (StateView + Mantine Table) yaratilab tegishli feature routing'iga ulanadi; yangi hooklar mavjud `clinical.api.ts` va `cashier.api.ts`ga qo'shiladi; `app/routes.tsx` yangi `clinicalRoutes`ni o'z ichiga oladi.

**Tech Stack:** React 18, Mantine v7+, TanStack Query, `@dental/api-client` (orval-generated), `@dental/ui` (StateView, PageHead), React Router 6 (Link, Anchor)

## Global Constraints

- Hech qachon `fetch()` to'g'ridan-to'g'ri — faqat `@dental/api-client` import qilingan funksiyalar
- Hech qachon hardcoded uz/ru matn — faqat `t('...')` (mavjud kalitlar ishlatiladi)
- DTO'larda `patientName` yo'q — faqat `patientId`; "Ko'rish" linki `/patients/:patientId`ga yo'naltiradi
- `formatCurrency(Number(amount), t)` — `totalAmount`/`totalCost` `string` keladi, `Number()` bilan aylantirish kerak
- `StateView` `status` prop talab qiladi: `'loading' | 'error' | 'empty'`
- `feature: 'labOrders'` nav-config'da **saqlanadi** (dental vertical gating)
- Biome 0 xato, typecheck 16/16 — har taskdan keyin verify

---

## File Map

**O'zgartiriladi:**
- `apps/web/src/shell/nav-config.ts` — 5 ta `disabled: true` olib tashlanadi
- `apps/web/src/features/clinical/clinical.keys.ts` — 3 ta yangi key qo'shiladi
- `apps/web/src/features/clinical/clinical.api.ts` — 3 ta yangi hook qo'shiladi
- `apps/web/src/features/cashier/cashier.keys.ts` — 1 ta yangi key qo'shiladi
- `apps/web/src/features/cashier/cashier.api.ts` — 1 ta yangi hook qo'shiladi
- `apps/web/src/features/cashier/cashier.routes.tsx` — `/transactions` route qo'shiladi
- `apps/web/src/features/clinical/index.ts` — `clinicalRoutes` export qo'shiladi
- `apps/web/src/app/routes.tsx` — `clinicalRoutes` import + `protectedRoutes`ga qo'shiladi

**Yaratiladigan:**
- `apps/web/src/features/clinical/clinical.routes.tsx`
- `apps/web/src/features/clinical/components/PlansScreen.tsx`
- `apps/web/src/features/clinical/components/LabScreen.tsx`
- `apps/web/src/features/clinical/components/RxScreen.tsx`
- `apps/web/src/features/cashier/components/TransactionsScreen.tsx`

---

### Task 1: Nav-config unlock

**Files:**
- Modify: `apps/web/src/shell/nav-config.ts:81,88,90,187,193`

**Interfaces:**
- Produces: barcha 5 ta nav item owner uchun bosiladigan (disabled emas)

- [ ] **Step 1: `plans` nav itemdan `disabled: true` olib tashlash**

`apps/web/src/shell/nav-config.ts` da quyidagi qatorni toping (≈81-qator):
```ts
{ key: 'plans', labelKey: 'nav.plans', icon: FileText, path: '/plans', disabled: true },
```
Shunday qiling:
```ts
{ key: 'plans', labelKey: 'nav.plans', icon: FileText, path: '/plans' },
```

- [ ] **Step 2: `lab` nav itemdan `disabled: true` olib tashlash (`feature` saqlanadi)**

Quyidagi blokning `disabled: true` qatorini olib tashlang (≈83–89-qatorlar):
```ts
{
  key: 'lab',
  labelKey: 'nav.lab',
  icon: FlaskConical,
  path: '/lab',
  feature: 'labOrders',
  disabled: true,
},
```
Shunday qiling:
```ts
{
  key: 'lab',
  labelKey: 'nav.lab',
  icon: FlaskConical,
  path: '/lab',
  feature: 'labOrders',
},
```

- [ ] **Step 3: `rx` nav itemdan `disabled: true` olib tashlash**

```ts
{ key: 'rx', labelKey: 'nav.rx', icon: Pill, path: '/rx', disabled: true },
```
Shunday qiling:
```ts
{ key: 'rx', labelKey: 'nav.rx', icon: Pill, path: '/rx' },
```

- [ ] **Step 4: `kpi` nav itemdan `disabled: true` olib tashlash**

```ts
{ key: 'kpi', labelKey: 'nav.kpi', icon: BarChart3, path: '/dashboard', disabled: true },
```
Shunday qiling:
```ts
{ key: 'kpi', labelKey: 'nav.kpi', icon: BarChart3, path: '/dashboard' },
```

- [ ] **Step 5: `transactions` nav itemdan `disabled: true` olib tashlash**

```ts
{
  key: 'transactions',
  labelKey: 'nav.transactions',
  icon: ArrowLeftRight,
  path: '/transactions',
  disabled: true,
},
```
Shunday qiling:
```ts
{
  key: 'transactions',
  labelKey: 'nav.transactions',
  icon: ArrowLeftRight,
  path: '/transactions',
},
```

- [ ] **Step 6: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -5
```
Expected: 0 errors (yoki faqat unrelated xatolar).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shell/nav-config.ts
git commit -m "feat(nav): unlock plans/lab/rx/kpi/transactions nav items"
```

---

### Task 2: Query key factories + yangi hooklar

**Files:**
- Modify: `apps/web/src/features/clinical/clinical.keys.ts`
- Modify: `apps/web/src/features/clinical/clinical.api.ts`
- Modify: `apps/web/src/features/cashier/cashier.keys.ts`
- Modify: `apps/web/src/features/cashier/cashier.api.ts`

**Interfaces:**
- Produces:
  - `clinicalKeys.allPlans()` → `['clinical', 'plans-all'] as const`
  - `clinicalKeys.allLabOrders()` → `['clinical', 'lab-orders-all'] as const`
  - `clinicalKeys.allPrescriptions()` → `['clinical', 'prescriptions-all'] as const`
  - `cashierKeys.allTransactions()` → `['cashier', 'transactions-all'] as const`
  - `useAllTreatmentPlans()` → `UseQueryResult<TreatmentPlanWithStages[]>`
  - `useAllLabOrders()` → `UseQueryResult<LabOrder[]>`
  - `useAllPrescriptions()` → `UseQueryResult<Prescription[]>`
  - `useAllTransactions()` → `UseQueryResult<CashierTransaction[]>`

- [ ] **Step 1: `clinical.keys.ts`ga 3 ta yangi key qo'shish**

`apps/web/src/features/clinical/clinical.keys.ts` oxiriga (so'nggi `}`dan oldin) qo'shing:
```ts
  // standalone aggregate views (patientId yo'q)
  allPlans: () => ['clinical', 'plans-all'] as const,
  allLabOrders: () => ['clinical', 'lab-orders-all'] as const,
  allPrescriptions: () => ['clinical', 'prescriptions-all'] as const,
```

- [ ] **Step 2: `cashier.keys.ts`ga 1 ta yangi key qo'shish**

`apps/web/src/features/cashier/cashier.keys.ts` oxiriga (so'nggi `}`dan oldin) qo'shing:
```ts
  allTransactions: () => ['cashier', 'transactions-all'] as const,
```

- [ ] **Step 3: `clinical.api.ts`ga 3 ta yangi hook qo'shish**

`apps/web/src/features/clinical/clinical.api.ts` faylining oxiriga qo'shing (mavjud hooklar blokidan keyin):
```ts
// ─── Standalone aggregate views (patientId filtrisiz) ──────────────────────

export function useAllTreatmentPlans() {
  return useQuery({
    queryKey: clinicalKeys.allPlans(),
    queryFn: () => listTreatmentPlans().then((r) => r.data),
  });
}

export function useAllLabOrders() {
  return useQuery({
    queryKey: clinicalKeys.allLabOrders(),
    queryFn: () => listLabOrders().then((r) => r.data),
  });
}

export function useAllPrescriptions() {
  return useQuery({
    queryKey: clinicalKeys.allPrescriptions(),
    queryFn: () => listPrescriptions().then((r) => r.data),
  });
}
```

`listTreatmentPlans`, `listLabOrders`, `listPrescriptions` — allaqachon import qilingan (fayl boshiga tegmaydi).

- [ ] **Step 4: `cashier.api.ts`ga 1 ta yangi hook qo'shish**

`apps/web/src/features/cashier/cashier.api.ts` faylining oxiriga qo'shing:
```ts
export function useAllTransactions() {
  return useQuery({
    queryKey: cashierKeys.allTransactions(),
    queryFn: () => listCashierTransactions().then((r) => r.data),
  });
}
```

`listCashierTransactions` allaqachon import qilingan.

- [ ] **Step 5: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/clinical/clinical.keys.ts \
        apps/web/src/features/clinical/clinical.api.ts \
        apps/web/src/features/cashier/cashier.keys.ts \
        apps/web/src/features/cashier/cashier.api.ts
git commit -m "feat(clinical,cashier): add tenant-wide list hooks for standalone screens"
```

---

### Task 3: PlansScreen

**Files:**
- Create: `apps/web/src/features/clinical/components/PlansScreen.tsx`

**Interfaces:**
- Consumes: `useAllTreatmentPlans()` (Task 2)
- Produces: `export function PlansScreen(): JSX.Element`

Ustunlar: Sana | Sarlavha | Holat | Jami

> **Eslatma:** `TreatmentPlanWithStages` = `TreatmentPlan & { stages: TreatmentStage[] }`. `totalCost` — `string` (numeric DB), `Number()` bilan aylantirish kerak.

- [ ] **Step 1: PlansScreen yaratish**

`apps/web/src/features/clinical/components/PlansScreen.tsx` ni yarating:
```tsx
import { PageHead, StateView, StatusPill } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/format';
import { useAllTreatmentPlans } from '../clinical.api';
import { planStatusToTone } from '../clinical.mappers';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function PlansScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllTreatmentPlans();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.plans')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('plans.title')}</Table.Th>
              <Table.Th>{t('common.status')}</Table.Th>
              <Table.Th>{t('plans.total')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((plan) => (
              <Table.Tr key={plan.id}>
                <Table.Td>{fmtDate(plan.createdAt)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${plan.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{plan.title}</Table.Td>
                <Table.Td>
                  <StatusPill status={planStatusToTone(plan.status)}>
                    {t(`treatment_plan.status_${plan.status}`)}
                  </StatusPill>
                </Table.Td>
                <Table.Td>{formatCurrency(Number(plan.totalCost), t)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
```

> **i18n kalitlari:** `treatment_plan.status_*` kalitlari allaqachon mavjud (tab komponentlarda ishlatilgan). `common.date`, `common.patient`, `common.status`, `common.view`, `plans.title`, `plans.total` — Task 7 Step 5 da tekshiriladi.

- [ ] **Step 2: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -10
```
Expected: 0 errors. Agar `StatusPill` topilmasa — `packages/ui/src` da export qilinganligini tekshiring va kerak bo'lsa `import { StatusPill } from '@dental/ui'` ni alohida qatorda yozing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/clinical/components/PlansScreen.tsx
git commit -m "feat(clinical): add PlansScreen read-only list"
```

---

### Task 4: LabScreen

**Files:**
- Create: `apps/web/src/features/clinical/components/LabScreen.tsx`

**Interfaces:**
- Consumes: `useAllLabOrders()` (Task 2)
- Produces: `export function LabScreen(): JSX.Element`

Ustunlar: Sana | Bemor | Tur | Muddat | Holat

> **Eslatma:** `LabOrder.expectedDate` nullable (`string | null`). `LabOrder.orderType` → `LabOrderOrderType` enum (string). `LabOrder.status` → `LabOrderStatus` enum.

- [ ] **Step 1: LabScreen yaratish**

`apps/web/src/features/clinical/components/LabScreen.tsx`:
```tsx
import { PageHead, StateView, StatusPill } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllLabOrders } from '../clinical.api';
import { labOrderStatusToTone } from '../clinical.mappers';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function LabScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllLabOrders();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.lab')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('lab.orderType')}</Table.Th>
              <Table.Th>{t('lab.expectedDate')}</Table.Th>
              <Table.Th>{t('common.status')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((order) => (
              <Table.Tr key={order.id}>
                <Table.Td>{fmtDate(order.createdAt)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${order.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{order.orderType}</Table.Td>
                <Table.Td>{order.expectedDate ? fmtDate(order.expectedDate) : '—'}</Table.Td>
                <Table.Td>
                  <StatusPill status={labOrderStatusToTone(order.status)}>
                    {t(`lab_order.status_${order.status}`)}
                  </StatusPill>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
```

> **i18n:** `lab_order.status_*` kalitlari allaqachon mavjud.

- [ ] **Step 2: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/clinical/components/LabScreen.tsx
git commit -m "feat(clinical): add LabScreen read-only list"
```

---

### Task 5: RxScreen

**Files:**
- Create: `apps/web/src/features/clinical/components/RxScreen.tsx`

**Interfaces:**
- Consumes: `useAllPrescriptions()` (Task 2)
- Produces: `export function RxScreen(): JSX.Element`

Ustunlar: Sana | Bemor | Dorilar soni | Tashxis

> **Eslatma:** `Prescription.items` — `PrescriptionItem[]` massiv; `.length` ustun sifatida. `Prescription.diagnosis` nullable. `Prescription.issuedDate` — sana (string).

- [ ] **Step 1: RxScreen yaratish**

`apps/web/src/features/clinical/components/RxScreen.tsx`:
```tsx
import { PageHead, StateView } from '@dental/ui';
import { Anchor, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllPrescriptions } from '../clinical.api';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function RxScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllPrescriptions();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.rx')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('rx.itemsCount')}</Table.Th>
              <Table.Th>{t('rx.diagnosis')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((rx) => (
              <Table.Tr key={rx.id}>
                <Table.Td>{fmtDate(rx.issuedDate)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/patients/${rx.patientId}`} size="sm">
                    {t('common.view')}
                  </Anchor>
                </Table.Td>
                <Table.Td>{rx.items.length}</Table.Td>
                <Table.Td>
                  {rx.diagnosis ? (
                    <Text size="sm" truncate="end" maw={200}>
                      {rx.diagnosis}
                    </Text>
                  ) : (
                    '—'
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/clinical/components/RxScreen.tsx
git commit -m "feat(clinical): add RxScreen read-only list"
```

---

### Task 6: TransactionsScreen

**Files:**
- Create: `apps/web/src/features/cashier/components/TransactionsScreen.tsx`

**Interfaces:**
- Consumes: `useAllTransactions()` (Task 2)
- Produces: `export function TransactionsScreen(): JSX.Element`

Ustunlar: Sana | Bemor | Tur | Summa | To'lov usuli

> **Eslatma:** `CashierTransaction.patientId` nullable (`string | null`) — bemor bo'lmagan tranzaksiyalar bo'lishi mumkin; bunday holatda link ko'rsatilmaydi. `totalAmount` — `string`, `Number()` bilan aylantirish kerak. `type` → `CashierTransactionType` enum. `paymentMethod` → `CashierTransactionPaymentMethod` (api-client'dan `PaymentMethod` sifatida re-export qilingan).

- [ ] **Step 1: TransactionsScreen yaratish**

`apps/web/src/features/cashier/components/TransactionsScreen.tsx`:
```tsx
import { PageHead, StateView } from '@dental/ui';
import { Anchor, Stack, Table } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatCurrency } from '@/lib/format';
import { useAllTransactions } from '../cashier.api';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function TransactionsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useAllTransactions();

  if (isLoading) return <StateView status="loading" skeleton="table" />;
  if (isError) return <StateView status="error" />;

  return (
    <Stack>
      <PageHead title={t('nav.transactions')} />
      {!data?.length ? (
        <StateView status="empty" />
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.date')}</Table.Th>
              <Table.Th>{t('common.patient')}</Table.Th>
              <Table.Th>{t('cashier.type')}</Table.Th>
              <Table.Th>{t('cashier.amount')}</Table.Th>
              <Table.Th>{t('cashier.paymentMethod')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((tx) => (
              <Table.Tr key={tx.id}>
                <Table.Td>{fmtDate(tx.createdAt)}</Table.Td>
                <Table.Td>
                  {tx.patientId ? (
                    <Anchor component={Link} to={`/patients/${tx.patientId}`} size="sm">
                      {t('common.view')}
                    </Anchor>
                  ) : (
                    '—'
                  )}
                </Table.Td>
                <Table.Td>{tx.type}</Table.Td>
                <Table.Td>{formatCurrency(Number(tx.totalAmount), t)}</Table.Td>
                <Table.Td>{tx.paymentMethod}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/cashier/components/TransactionsScreen.tsx
git commit -m "feat(cashier): add TransactionsScreen read-only list"
```

---

### Task 7: Routing va i18n kalitlari

**Files:**
- Create: `apps/web/src/features/clinical/clinical.routes.tsx`
- Modify: `apps/web/src/features/clinical/index.ts`
- Modify: `apps/web/src/features/cashier/cashier.routes.tsx`
- Modify: `apps/web/src/app/routes.tsx`

**Interfaces:**
- Consumes: `PlansScreen`, `LabScreen`, `RxScreen` (Task 3–5); `TransactionsScreen` (Task 6)
- Produces: `/plans`, `/lab`, `/rx`, `/transactions` routelari ishlaydi

- [ ] **Step 1: `clinical.routes.tsx` yaratish**

`apps/web/src/features/clinical/clinical.routes.tsx`:
```tsx
import type { AppRoute } from '@/shell';
import { LabScreen } from './components/LabScreen';
import { PlansScreen } from './components/PlansScreen';
import { RxScreen } from './components/RxScreen';

export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <PlansScreen /> },
  { path: '/lab', perm: 'medical_record.view', element: <LabScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
```

- [ ] **Step 2: `clinical/index.ts`ga `clinicalRoutes` export qo'shish**

`apps/web/src/features/clinical/index.ts` faylining **oxiriga** qo'shing:
```ts
export { clinicalRoutes } from './clinical.routes';
```

- [ ] **Step 3: `cashier.routes.tsx`ga `/transactions` qo'shish**

`apps/web/src/features/cashier/cashier.routes.tsx` da:
```tsx
import type { AppRoute } from '@/shell';
import { CashierScreen } from './components/CashierScreen';
import { TransactionsScreen } from './components/TransactionsScreen';

export const cashierRoutes: AppRoute[] = [
  { path: '/cashier', perm: 'cashier.view', element: <CashierScreen /> },
  { path: '/transactions', perm: 'cashier.view', element: <TransactionsScreen /> },
];
```

- [ ] **Step 4: `app/routes.tsx`ga `clinicalRoutes` qo'shish**

`apps/web/src/app/routes.tsx` da import'ga qo'shing:
```tsx
import { clinicalRoutes } from '@/features/clinical';
```

`protectedRoutes` massiviga **birinchi element sifatida** qo'shing:
```tsx
export const protectedRoutes: AppRoute[] = [
  ...clinicalRoutes,
  ...dashboardRoutes,
  // ... qolgan mavjud routelar
];
```

- [ ] **Step 5: i18n kalitlarini tekshirish va qo'shish**

Quyidagi kalitlar mavjud ekanligini tekshiring (`packages/i18n/src/uz.json` va `ru.json`da):

```bash
grep -E '"common\.date"|"common\.patient"|"common\.view"|"plans\.title"|"plans\.total"|"lab\.orderType"|"lab\.expectedDate"|"rx\.itemsCount"|"rx\.diagnosis"|"cashier\.type"|"cashier\.amount"|"cashier\.paymentMethod"' \
  /home/madrimov/Projects/dental-service/packages/i18n/src/uz.json
```

**Yo'q kalitlar** (mavjud bo'lmasa qo'shiladi) — `packages/i18n/src/uz.json`ning tegishli bo'limiga:

```json
"common": {
  ...
  "date": "Sana",
  "patient": "Bemor",
  "view": "Ko'rish"
},
"plans": {
  ...
  "title": "Sarlavha",
  "total": "Jami"
},
"lab": {
  ...
  "orderType": "Tur",
  "expectedDate": "Muddat"
},
"rx": {
  ...
  "itemsCount": "Dorilar",
  "diagnosis": "Tashxis"
}
```

`packages/i18n/src/ru.json` uchun ekvivalentlari:
```json
"common": { "date": "Дата", "patient": "Пациент", "view": "Открыть" },
"plans": { "title": "Название", "total": "Итого" },
"lab": { "orderType": "Тип", "expectedDate": "Срок" },
"rx": { "itemsCount": "Препараты", "diagnosis": "Диагноз" }
```

> `cashier.type`, `cashier.amount`, `cashier.paymentMethod` allaqachon bo'lishi ehtimoli yuqori — grep bilan tekshiring va faqat yo'qlarini qo'shing.

- [ ] **Step 6: To'liq typecheck + biome**

```bash
cd /home/madrimov/Projects/dental-service
bunx turbo typecheck 2>&1 | tail -5
bunx biome check apps/web/src/features/clinical/clinical.routes.tsx \
                  apps/web/src/features/clinical/index.ts \
                  apps/web/src/features/cashier/cashier.routes.tsx \
                  apps/web/src/app/routes.tsx 2>&1 | tail -10
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/clinical/clinical.routes.tsx \
        apps/web/src/features/clinical/index.ts \
        apps/web/src/features/cashier/cashier.routes.tsx \
        apps/web/src/app/routes.tsx \
        packages/i18n/src/uz.json \
        packages/i18n/src/ru.json
git commit -m "feat(routing): wire plans/lab/rx/transactions routes, add i18n keys"
```

---

### Task 8: Final verify

**Files:** (o'zgarmaydi — faqat tekshirish)

- [ ] **Step 1: To'liq typecheck**

```bash
cd /home/madrimov/Projects/dental-service && bunx turbo typecheck 2>&1 | tail -5
```
Expected: 0 errors.

- [ ] **Step 2: Biome check**

```bash
cd /home/madrimov/Projects/dental-service && bunx biome check apps/ packages/i18n/ 2>&1 | tail -10
```
Expected: 0 errors.

- [ ] **Step 3: Smoke test (ixtiyoriy — agar dev server mavjud bo'lsa)**

```bash
# Ikki terminal: 1-da api, 2-da web
bun --filter @dental/api dev &
bun --filter @dental/web dev
```
Owner sifatida login qilib `/plans`, `/lab`, `/rx`, `/transactions`, `/dashboard` havolalarini bosing — har biri ishlashi kerak. Doctor sifatida: `/plans`, `/lab`, `/rx` ko'rinishi; `/transactions` 403 bo'lishi kerak. Accountant sifatida: `/transactions` ko'rinishi; `/plans` 403 bo'lishi kerak.
