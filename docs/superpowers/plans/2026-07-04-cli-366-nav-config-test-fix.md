# CLI-366 nav-config.test.ts Stale Assertion Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/web/src/shell/nav-config.test.ts` is currently really red (1 of 13 tests failing). Make it green by updating the one stale test block to match the already-shipped, already-correct behavior in `apps/web/src/shell/nav-config.ts` (commit `4ce4b078` unlocked `transactions`, dropping its `disabled: true`). This is a test-fix ticket, not new feature work — "TDD" here means: confirm the real current failure → fix the assertions to match shipped reality → confirm green.

**Architecture:** No production code changes. Single file touched: `apps/web/src/shell/nav-config.test.ts`. The fix rewrites one `it()` block (lines 53-63) whose premise ("transactions is a FUTURE disabled-until-owner item") is no longer true — `transactions` is now a LIVE, `cashier.view`-permission-gated nav item with no `disabled` field at all.

**Tech Stack:** Vitest, `apps/web/src/shell/nav-config.ts` (read-only reference), `apps/web/src/shell/nav-config.test.ts` (only file modified).

## Global Constraints

- Do not re-add `disabled: true` to any nav item in `nav-config.ts` — the test must reflect current behavior, not lock it back down. `nav-config.ts` is NOT modified by this plan at all.
- Do not touch any of the other 12 passing tests in the file — they already reflect current behavior (verified by real `vitest run` below) and are out of scope.
- No new test coverage is added for the (currently real-item-less) `disabled` code path in `isVisible()` — out of scope for this bug-fix ticket (see spec doc §3.3).

---

### Task 1: Fix stale nav-config.test.ts assertions

**Files:**
- Modify: `apps/web/src/shell/nav-config.test.ts:53-63`

**Interfaces:**
- Consumes: `nav-config.ts`'s exported `NavItem` shape:
  ```ts
  export type NavItem = {
    key: string;
    labelKey: string;
    icon: LucideIcon;
    path: string;
    permission?: string | string[];
    feature?: VerticalFeature;
    disabled?: true;
  };
  ```
  and the current (unchanged) `transactions` entry (`nav-config.ts:194-200`):
  ```ts
  {
    key: 'transactions',
    labelKey: 'nav.transactions',
    icon: ArrowLeftRight,
    path: '/transactions',
    permission: 'cashier.view',
  },
  ```
- Consumes: `visibleGroups(has: (p: string) => boolean, vertical?: Vertical, isOwner?: boolean): NavGroup[]` (unchanged signature).

- [ ] **Step 1: Run the test to confirm current failure**

Run: `cd /home/madrimov/Projects/dental-service && bunx vitest run apps/web/src/shell/nav-config.test.ts`

Expected: FAIL — actual output obtained running this exact command:
```
 ❯ apps/web/src/shell/nav-config.test.ts (13 tests | 1 failed) 31ms
   × nav-config > FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161) 13ms
     → expected undefined to be true // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  apps/web/src/shell/nav-config.test.ts > nav-config > FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)
AssertionError: expected undefined to be true // Object.is equality

- Expected:
true

+ Received:
undefined

 ❯ apps/web/src/shell/nav-config.test.ts:58:36
     56|     const transactions = asOwner.find((i) => i.key === 'transactions');
     57|     expect(transactions).toBeDefined();
     58|     expect(transactions?.disabled).toBe(true);
       |                                    ^
     59|
     60|     // owner emas (hasPermission true bo'lsa ham) → FUTURE element but…

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

- [ ] **Step 2: Update the assertions**

Before (`nav-config.test.ts:53-63`):
```ts
  it("FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)", () => {
    // transactions — route'i yo'q, haqiqiy FUTURE element ('Tez orada')
    const asOwner = visibleGroups(() => true, 'dental', true).flatMap((g) => g.items);
    const transactions = asOwner.find((i) => i.key === 'transactions');
    expect(transactions).toBeDefined();
    expect(transactions?.disabled).toBe(true);

    // owner emas (hasPermission true bo'lsa ham) → FUTURE element butunlay yashirin
    const asNonOwner = visibleGroups(() => true, 'dental', false).flatMap((g) => g.items);
    expect(asNonOwner.find((i) => i.key === 'transactions')).toBeUndefined();
  });
```

After:
```ts
  it("transactions — LIVE, cashier.view bilan gated (CLI-366: 4ce4b07 disabled:true'ni olib tashladi)", () => {
    // owner, ruxsat bor → ko'rinadi, disabled maydoni yo'q
    const asOwner = visibleGroups(() => true, 'dental', true).flatMap((g) => g.items);
    const transactions = asOwner.find((i) => i.key === 'transactions');
    expect(transactions).toBeDefined();
    expect(transactions?.disabled).toBeUndefined();

    // owner emas, lekin cashier.view bor → baribir ko'rinadi (permission-gate, owner-gate emas)
    const asNonOwnerWithPerm = visibleGroups((p) => p === 'cashier.view', 'dental', false).flatMap(
      (g) => g.items,
    );
    expect(asNonOwnerWithPerm.find((i) => i.key === 'transactions')).toBeDefined();

    // owner emas va cashier.view yo'q → yashirin
    const asNonOwnerNoPerm = visibleGroups(() => false, 'dental', false).flatMap((g) => g.items);
    expect(asNonOwnerNoPerm.find((i) => i.key === 'transactions')).toBeUndefined();
  });
```

Rationale for all three new assertions (each independently verified by directly invoking `visibleGroups` from `nav-config.ts` via `bunx tsx` against the real current file, not assumed):

| Call | Real result for `transactions` |
|---|---|
| `visibleGroups(() => true, 'dental', true)` | object present, no `disabled` key |
| `visibleGroups((p) => p === 'cashier.view', 'dental', false)` | object present |
| `visibleGroups(() => false, 'dental', false)` | `undefined` |

- [ ] **Step 3: Run test to verify it passes**

Run: `cd /home/madrimov/Projects/dental-service && bunx vitest run apps/web/src/shell/nav-config.test.ts`

Expected: PASS — `Test Files  1 passed (1)`, `Tests  13 passed (13)`.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/shell/nav-config.test.ts
git commit -m "fix(web): update stale nav-config test assertions for unlocked transactions nav item"
```

---

## Self-review

- **Scope check:** Only `nav-config.test.ts` lines 53-63 change. `nav-config.ts` is untouched — satisfies "disabled: true QAYTARILMAYDI" and the global constraint against re-locking shipped nav items.
- **Root-cause coverage:** The real `vitest run` (Task 1 Step 1) shows exactly one failing test, and reading `nav-config.ts` end-to-end confirms no other nav item (`plans`, `lab`, `rx`, `kpi`) has a stale assertion elsewhere in the file — so this plan's single task is the complete fix, not a partial one.
- **Why not a one-line fix:** A naive fix of only line 58 (`toBe(true)` → `toBeUndefined()`) would leave line 62 (`asNonOwner...toBeUndefined()`) failing right after, because `transactions` no longer has any `isOwner`-based gating at all once `disabled` is gone — only `permission` matters now. This was confirmed empirically (not assumed) by calling `visibleGroups` directly with `isOwner: false` and `has: () => true`, which still returns `transactions`. The plan's Step 2 replaces both stale assertions together with correct real-behavior ones.
- **No scope creep:** No new test was added for the now-real-item-less `disabled` branch of `isVisible()` (spec §3.3) — that would be new coverage, not a bug fix, and is out of scope for CLI-366.
