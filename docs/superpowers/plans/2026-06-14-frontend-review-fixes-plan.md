# Frontend Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Frontend review topilmalarini (CLI-165…CLI-175) to'liq tuzatish, har biri alohida branch→verify→doc-sync→Linear-sync→commit→PR→merge tsikli bilan.

**Architecture:** `apps/web` (React 18 + Mantine v7 + TanStack Query + Zustand) + `packages/ui` (design system). Foundation-first: global mutation toast → formatCurrency helper → StateView rollout, keyin mustaqil fixlar.

**Tech Stack:** React 18, Mantine v7, TanStack Query v5, `@mantine/notifications`, `react-i18next`, Vitest, Biome.

---

## Aniqlangan kontekst faktlari (executor uchun)

- **i18n:** `packages/i18n/src/locales/{uz,ru}.json`. `common.currency` ALLAQACHON mavjud (uz `so'm`, ru `сум`). `states.error_title`/`states.retry`/`states.empty_title` mavjud. `common.error` = "Xatolik yuz berdi".
- **ApiError:** `packages/api-client` `export class ApiError { code, message, status, details }`. `@dental/api-client`'dan import.
- **Notifications:** `@mantine/notifications` `Notifications` provider App.tsx:21'da mount qilingan — `notifications.show(...)` ishlaydi.
- **StateView:** `@dental/ui` — props `{ status: 'loading'|'error'|'empty', skeleton?, title?, description?, onRetry?, retryLabel? }`.
- **Web test:** `bun --filter @dental/web test` (vitest). Web pkg = `@dental/web`.

## Universal per-task workflow (HAR task uchun bir xil)

```bash
git checkout main && git pull --ff-only          # stale main'dan qochish
git checkout -b fix/cli-<n>-<slug>
# --- fix (quyidagi task bo'limi) ---
# --- doc-sync (Obsidian 04-Progress.md, kerak bo'lsa 01-Qarorlar.md, CLAUDE.md) ---
# --- VERIFY GATE (yashil bo'lmasa STOP, merge yo'q) ---
bun run lint
bun run typecheck
bun --filter @dental/web test
cd apps/web && bun run build && cd ../..
# --- commit ---
git add -A && git commit   # conventional + Co-Authored-By trailer
git push -u origin HEAD
gh pr create --fill --base main
# verify yashil → merge
gh pr merge --squash --delete-branch
# Linear: status In Progress→Done, PR linki + checklist yangilanadi
```

**Doc-sync har commitда:** Obsidian `04-Progress.md`'ga 1-2 qator (absolyut sana 2026-06-14). Arxitektura qarori bo'lsa `01-Qarorlar.md`. Konvensiya o'zgarsa `CLAUDE.md`.

**Commit trailer (majburiy):**
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Task F1 (CLI-165): Global mutation error feedback

**Files:**
- Modify: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/lib/query-client.test.ts`
- Modify: `packages/i18n/src/locales/{uz,ru}.json` (agar yangi kalit kerak bo'lsa — `common.error` mavjud, qayta ishlatiladi)

- [ ] **Step 1 — Implement MutationCache.onError default toast.**

```ts
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { ApiError } from '@dental/api-client';
import i18n from '@dental/i18n'; // mavjud i18n instance — import yo'lini tasdiqla (apps/web i18n setup)

function messageFromError(error: unknown): string {
  if (error instanceof ApiError) return error.message || i18n.t('common.error');
  if (error instanceof Error && error.message) return error.message;
  return i18n.t('common.error');
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      // per-mutation onError bor bo'lsa, default toast'ni o'tkazib yubor
      if (mutation.options.onError) return;
      notifications.show({
        color: 'red',
        title: i18n.t('common.error'),
        message: messageFromError(error),
      });
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
```

> ⚠️ i18n instance import yo'lini executor tekshiradi (`apps/web/src/i18n.ts` yoki `@dental/i18n`). Agar global instance yo'q bo'lsa, `i18next` default export ishlat.

- [ ] **Step 2 — Test** (`query-client.test.ts`): `notifications.show`'ni mock qilib, `mutationCache.config.onError`'ni `mutation.options.onError` yo'q holatda chaqirib, `show` chaqirilganini; bor holatda chaqirilmaganini tekshir.
- [ ] **Step 3 — Verify gate + doc-sync + commit + PR + merge** (universal workflow).

**Qaror (01-Qarorlar.md + CLAUDE.md §3/Frontend):** "Global mutation error toast — barcha mutatsiya defaultda xatoni toast qiladi; per-mutation `onError` override bo'lsa default jim."

---

## Task F2 (CLI-166): formatCurrency helper + so'm dedup

**Files:**
- Create: `apps/web/src/lib/format.ts` + `apps/web/src/lib/format.test.ts`
- Modify (14): cashier `PlanBillingPanel.tsx`, `TransactionsTable.tsx`, `PosPanel.tsx`, `CartTable.tsx`, `DailySummaryCard.tsx`; `services/ServicePricesTab.tsx`; `dashboard/AccountantDashboard.tsx`, `ManagerDashboard.tsx`; `expenses/ExpenseSummaryCard.tsx`, `ExpensesTable.tsx`, `ExpensesScreen.tsx`; `reports/...`; `stock/...`; `payroll/...`

- [ ] **Step 1 — Helper:**

```ts
// apps/web/src/lib/format.ts
import type { TFunction } from 'i18next';

const numberFmt = new Intl.NumberFormat('uz-UZ');

/** Pulni mahalliylashtirilgan suffix bilan format qiladi: "1 234 567 so'm" / "...сум". */
export function formatCurrency(amount: number, t: TFunction): string {
  return `${numberFmt.format(Math.round(amount))} ${t('common.currency')}`;
}

/** Suffixsiz raqam (jadval ustunlari uchun). */
export function formatNumber(amount: number): string {
  return numberFmt.format(Math.round(amount));
}
```

> Eslatma: `Math.round` — barcha joyda BIR XIL (hozir divergent). Scale-2 numeric backenddan string keladi; `Number(x)` bilan kiritiladi.

- [ ] **Step 2 — Test:** `formatCurrency(1234567, tStub)` → `"1 234 567 so'm"` (tStub `common.currency`→`so'm`).
- [ ] **Step 3 — 14 faylni ko'chir:** har `Intl.NumberFormat(...).format(...) + " so'm"` / `fmtUZS` / hardcoded `so'm`'ni `formatCurrency(x, t)`'ga almashtir. Komponentda `t` mavjud emas bo'lsa `useTranslation()` qo'sh.
- [ ] **Step 4 — Grep tekshir:** `grep -rn "so'm" apps/web/src` → faqat i18n-bog'liq bo'lmagan natija 0 (language self-label `common.currency` ichida).
- [ ] **Step 5 — Verify + doc-sync + commit + PR + merge.**

**Konvensiya (CLAUDE.md §3.9):** "Pul formatlash — `lib/format.ts formatCurrency(amount, t)`; hech qachon hardcoded `so'm`/inline `Intl.NumberFormat`."

---

## Task F3 (CLI-167): StateView rollout

**Files (modify):** klinik tablar `clinical/components/{odontogram/OdontogramTab,treatment-plans/TreatmentPlansTab,prescriptions/PrescriptionsTab,lab-orders/LabOrdersTab,consent/ConsentTab,visit-notes/VisitNotesTab,images/PatientImagesTab}.tsx`; `audit/components/AuditScreen.tsx`; `expenses/components/ExpensesScreen.tsx`; `payroll/components/PayrollScreen.tsx`; `stock/components/StockScreen.tsx`.

- [ ] **Step 1 — Har ekran uchun pattern:**

```tsx
import { StateView } from '@dental/ui';
import { useTranslation } from 'react-i18next';
// ...
const { t } = useTranslation();
if (query.isLoading) return <StateView status="loading" skeleton="table" />;
if (query.isError) return (
  <StateView status="error" title={t('states.error_title')}
    onRetry={() => query.refetch()} retryLabel={t('states.retry')} />
);
if (!data.length) return <StateView status="empty" title={t('states.empty_title')} />;
```

> Klinik tablarda header/Create tugma StateView bilan birga ko'rsatilishi kerak bo'lsa, faqat ro'yxat qismini StateView bilan o'ra (header tepada qoladi).

- [ ] **Step 2 — Grep tekshir:** har sanab o'tilgan faylda `StateView` + `status="error"` mavjud.
- [ ] **Step 3 — Verify + doc-sync + commit + PR + merge.**

---

## Task F4 (CLI-168): Odontogram a11y

**Files:** `clinical/components/odontogram/ToothCell.tsx` + `.module.css` (agar bor) + test.

- [ ] **Step 1** — `<Box onClick>` → Mantine `UnstyledButton component="button"` (yoki `role="button" tabIndex={0} onKeyDown` Enter/Space). `aria-label={`${toothNumber} — ${t(stateLabelKey)}`}`.
- [ ] **Step 2** — holatni rang + matn/aria bilan: `aria-label`'ga holat nomi (allaqachon yuqorida). Tooltip endi focusable element ustida.
- [ ] **Step 3** — `prefers-reduced-motion` inline `scale(1.1)` hover'ni CSS'ga ko'chirib `@media (prefers-reduced-motion: reduce){ transform:none }`.
- [ ] **Step 4 — Test/render:** tooth cell `role="button"` + `aria-label` bor.
- [ ] **Step 5 — Verify + doc-sync + commit + PR + merge.**

---

## Task F5 (CLI-169): A11y + focus + contrast batch

**Files:**
- aria-label: `settings/components/{UsersSettingsScreen,RolesSettingsScreen,BranchesSettingsScreen}.tsx`; `clinical/.../lab-orders/LabOrdersTab.tsx`, `prescriptions/PrescriptionsTab.tsx`, `treatment-plans/PlanFormModal.tsx`; `expenses/components/{ExpensesTable,CategoryManagerModal}.tsx`; `clinical/.../images/ImageCard.tsx`.
- focus ring: `apps/web/src/shell/{Sidebar,Topbar}.module.css`, `BranchSwitcher.tsx` (inline yoki module), `packages/ui/src/primitives/StateView/StateView.module.css`.
- contrast: `packages/ui/src/theme/tokens.css` (`--text-3` light + dark).
- queue color-only: `queue/components/QueueCard.tsx`.
- search aria: `services/ServicesScreen.tsx`, `settings/UsersSettingsScreen.tsx`, `queue/QueueBoard.tsx`, `stock/StockScreen.tsx`.
- Input aria-invalid: `packages/ui/src/primitives/Input/Input.tsx`. danger hover: `Button.module.css`.
- div onClick: `stock/StockItemsTable.tsx`, `clinical/.../images/ImageCard.tsx`, `dashboard/.../OnboardingChecklist.tsx`.

- [ ] **Step 1 — aria-labels:** har ikon-only `ActionIcon`'ga `aria-label={t(...)}` (edit/delete/remove/zoom). Mavjud i18n `common.edit`/`common.delete` ishlat.
- [ ] **Step 2 — focus rings:** shell button/link'larga:
```css
.item:focus-visible, .ws:focus-visible, .search:focus-visible,
.lang button:focus-visible, .prof:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
```
StateView `.retry` ham (`.module.css`). BranchSwitcher `.branch`.
- [ ] **Step 3 — `--text-3` kontrast:** AA (≥4.5:1) ga qoraytirish. Hozir light `#869e9a` oqda ~2.85:1. **Hisobla:** yangi qiymat tanlab, oq (`#ffffff`) va `--surface`ga nisbatan WCAG nisbatini Bash/Python bilan hisobla, ≥4.5 bo'lsin (masalan `--text-2` `#41605b` ~6.3:1 — lekin u text-2; `--text-3` uchun `#5e7c77` ~4.7:1 nomzod, tasdiqlash shart). Dark mode `--text-3` ham `--surface`ga nisbatan ≥4.5 qil.
- [ ] **Step 4 — queue color-only:** `QueueCard` Badge'ga status matni yoki `aria-label`.
- [ ] **Step 5 — search aria-label, Input aria-invalid, danger hover, div onClick keyboard.**
- [ ] **Step 6 — Verify + doc-sync + commit + PR + merge.**

> ⚠️ `--text-3` token global — build + (imkon bo'lsa) Playwright visual smoke. Kontrast nisbati commit xabarida hisoblab ko'rsatiladi.

---

## Task F6 (CLI-170): Reports doctor name

**Files:** `reports/components/ReportsScreen.tsx` (+ kerak bo'lsa `appointments` doctors hook re-use).

- [ ] **Step 1** — `useDoctors()` (yoki `GET /appointments/doctors`, CLI-154) bilan `Map<id,name>` qur. `<Table.Td>{nameMap.get(d.doctorId) ?? d.doctorId.slice(0,8)}</Table.Td>`.
- [ ] **Step 2 — render/test:** ism ko'rsatiladi.
- [ ] **Step 3 — Verify + doc-sync + commit + PR + merge.**

---

## Task F7 (CLI-171): Cashier money safety

**Files:** `cashier/components/{RefundModal? / TransactionsTable, PosPanel, CartTable, PlanBillingPanel, CashierScreen}.tsx`.

- [ ] **Step 1 — Refund modal detail:** modal body'ga tranzaksiya summa (`formatCurrency`), bemor, chek/sana. i18n yangi kalitlar (`cashier.refund_confirm_detail` yoki interpolatsiya).
- [ ] **Step 2 — POS narx chegara:** `CartTable` NumberInput `min={0}` saqlanadi, lekin mantiqiy `max` yoki ogohlantirish; 0 narxda submit bloklash/ogohlantirish.
- [ ] **Step 3 — cart persistence:** `CashierScreen` rejim almashganda savat bo'sh emas bo'lsa `confirm`/ogohlantirish yoki holatni saqlash.
- [ ] **Step 4 — `PlanBillingPanel` `so'm` suffix** F2 `formatCurrency` bilan.
- [ ] **Step 5 — Verify + doc-sync + commit + PR + merge.**

---

## Task F8 (CLI-172): Interaction safety

**Files:** `patients/components/PatientsListScreen.tsx` + `.module.css`; `queue/components/{QueueCard,QueueBoard}.tsx`; `patients/components/PatientCard.tsx`; `settings/components/UsersSettingsScreen.tsx`.

- [ ] **Step 1 — double-submit:** archive `IconButton` + queue status tugmalari `disabled={mut.isPending}`.
- [ ] **Step 2 — truncation:** uzun ism `.name` CSS `text-overflow: ellipsis; overflow: hidden; white-space: nowrap` yoki Mantine `lineClamp`.
- [ ] **Step 3 — Verify + doc-sync + commit + PR + merge.**

---

## Task F9 (CLI-173): Responsive pass

**Files:** `appointments/components/CalendarGrid.module.css`; asosiy jadval ekranlari (`Table.ScrollContainer` o'rab); toolbar `Group`'lar (`wrap`).

- [ ] **Step 1 — calendar:** grid wrapper `overflow-x: auto`; ustun `min-width` saqlanadi.
- [ ] **Step 2 — jadvallar:** asosiy jadvallarni Mantine `Table.ScrollContainer minWidth={...}` bilan o'ra (patients, users, transactions, stock, expenses, audit).
- [ ] **Step 3 — toolbar:** kassa/audit fixed-width `Group`'ga `wrap="wrap"`.
- [ ] **Step 4 — Verify + doc-sync + commit + PR + merge.**

---

## Task F10 (CLI-174): Polish & nits

**Files:** `apps/web/src/styles.css`; `apps/web/src/shell/{AppShell,Topbar,BranchSwitcher}.tsx`; `dashboard/components/GenericDashboard.tsx`; `packages/ui/src/theme/{tokens.css,mantine-theme.ts}` (teal dedup test).

- [ ] **Step 1** — `styles.css`'ga global `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms!important; transition-duration:.01ms!important } }`.
- [ ] **Step 2** — skip-link AppShell'ga (`<a href="#main" class="skip">`), `main` id.
- [ ] **Step 3** — `⌘K` hint: platforma aniqlash (`navigator.platform`/`userAgent` Mac), non-Mac'da `Ctrl K`.
- [ ] **Step 4** — `BranchSwitcher` JWT decode base64url-safe + try/catch.
- [ ] **Step 5** — teal dedup: `packages/ui` test — `tokens.css` teal qiymatlari `mantine-theme.ts` tuple bilan mos (yoki tuple'ni tokens'dan oladi).
- [ ] **Step 6** — GenericDashboard `🚀` olib tashlash/i18n. Klinik `Badge`→`Tag` birxillashtirish.
- [ ] **Step 7 — Verify + doc-sync + commit + PR + merge.**

---

## Task F11 (CLI-175): Subjective/creative — minimal, OXIRIDA

**Files:** `dashboard/components/{DoctorDashboard,AssistantDashboard,ReceptionistDashboard,widgets/StatCard}.tsx`; primitiv hover (`packages/ui` Button/Card module.css); `clinical/.../odontogram/*` (surface — agar risk yo'l qo'ysa).

- [ ] **Step 1 — real StatCard:** dashboard lokal `widgets/StatCard`'ni `@dental/ui StatCard`'ga ko'chir (icon/unit/accent). Doctor/Assistant/Receptionist'ga rol-spetsifik KPI/aksent qo'shib differentsiatsiya.
- [ ] **Step 2 — micro-motion (minimal):** Card/Button hover'ga juda yengil `transform: translateY(-1px)` + `prefers-reduced-motion` guard. Konservativ.
- [ ] **Step 3 — spacing tokenlari (minimal):** faqat aniq off-grid joylarni `--space-*`'ga moslab, vizual o'zgarishsiz. Risk yuqori bo'lsa o'tkazib yubor va Linear'da qayd et.
- [ ] **Step 4 — odontogram surface:** minimal surface picker. Risk/scope katta bo'lsa — alohida deferred Linear task, bu PR'da QILINMAYDI.
- [ ] **Step 5 — Verify + doc-sync + commit + PR + merge.**

---

## Self-review (plan ↔ spec)

- ✅ Spec §4 F1–F11 → plan Task F1–F11 (1:1).
- ✅ Verification gate (spec §2) har taskda universal workflow'da.
- ✅ Doc-sync (spec §5) har taskda.
- ✅ Foundation tartibi (spec §7) saqlangan.
- ✅ Placeholder yo'q (foundation kodlari to'liq; mexanik tasklar aniq fayl+pattern bilan).
- ⚠️ F11 surface recording — qasddan shartli (risk-bo'yicha deferred), bu placeholder emas, qaror.

## Eslatma — subagent-driven ijro

Har task fresh subagent bilan bajariladi (aniq fayl ro'yxati + pattern). Subagent FAQAT fix + verify qiladi; doc-sync/Linear/PR/merge'ni asosiy loop boshqaradi (yoki subagentga aniq ko'rsatma beriladi). Har taskdan keyin two-stage review (code-review skill yoki advisor).
