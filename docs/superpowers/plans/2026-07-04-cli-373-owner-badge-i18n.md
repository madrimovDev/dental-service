# CLI-373 — Owner Badge i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one hardcoded English string left on `SelectWorkspacePage` — `<Badge color="teal">Owner</Badge>` at `apps/web/src/features/auth/pages/select-workspace.page.tsx:149` — with `t('auth.select_workspace.owner_badge')`, so a Russian-locale user no longer sees an English word on an otherwise fully-translated page.

**Architecture:** No structural change — `select-workspace.page.tsx` already imports `useTranslation` and calls `t()` for every other string on the page (`title`, `no_workspaces`, `all_branches`, `session_expired_title`, `session_expired_message`, `switch_failed`), all under the `auth.select_workspace` namespace in `packages/i18n/src/locales/{uz,ru}.json`. This is a one-line swap of the `Badge` children plus a new key in both locale files, following the project's existing "owner" translation convention (`owner_desc: "Klinika egasi — barcha ruxsatlarga ega"` / `"Владелец клиники — все права"`, `role_staff: "Xodim"` as the short single-word precedent).

**Tech Stack:** React, react-i18next

## Global Constraints
- Do not touch `collectOptions()` (`select-workspace.page.tsx:196`, `roleName: 'Owner'`) — it is a separate hardcoded-English instance not covered by this ticket's DoD (see spec `2026-07-04-cli-373-owner-badge-i18n-design.md` §4). Leave it as-is.
- Do not change the `Badge` component, its `color="teal"` prop, or its position — only the children content changes from a literal string to a `t()` call.
- New locale key goes in the existing `auth.select_workspace` block in both `uz.json` and `ru.json`, right after `"all_branches"` — keep exact 6-space JSON indentation matching the surrounding keys.
- uz text: `"Egasi"`. ru text: `"Владелец"`. Do not invent alternate wording — these match the existing "owner" translation root used elsewhere in the app (`owner_desc`, `owner_full_name`, `transfer_ownership`).

---

### Task 1: Translate the Owner badge

**Files:**
- Modify: `apps/web/src/features/auth/pages/select-workspace.page.tsx:149`
- Modify: `packages/i18n/src/locales/uz.json` (inside `select_workspace` block, currently lines 129-136)
- Modify: `packages/i18n/src/locales/ru.json` (inside `select_workspace` block, currently lines 129-136)
- Test: `apps/web/src/features/auth/pages/select-workspace.page.test.tsx` (new file — no existing test file for this page was found; `find apps/web/src/features/auth -iname "*select-workspace*"` returns only the page component itself)

**Interfaces:**
- Consumes: `useTranslation()` from `react-i18next` (already imported in the page, line 16), the project's `renderApp()` test helper (`apps/web/src/test-utils.tsx`) which wraps children in `QueryClientProvider` + `MantineProvider` + `I18nextProvider` (using the real `i18n` instance from `@/lib/i18n.ts`, default language `uz`) + `MemoryRouter`.
- Produces: no new exported interface — purely a rendered-text change.

- [ ] **Step 1: Write the failing test**

  Create `apps/web/src/features/auth/pages/select-workspace.page.test.tsx`:

  ```tsx
  import { screen } from '@testing-library/react';
  import { describe, expect, it, vi } from 'vitest';
  import { renderApp } from '../../../test-utils';
  import { SelectWorkspacePage } from './select-workspace.page';

  // useMe/useSwitchWorkspace'ni mock qilamiz — real API/auth-store'ga tegmaslik uchun
  // (auth.api.ts ichida useMe accessToken'ga bog'liq, useSwitchWorkspace refreshToken
  // talab qiladi — bu test faqat render/i18n'ni tekshiradi, mutation oqimini emas).
  vi.mock('../auth.api', () => ({
    useMe: () => ({
      isLoading: false,
      data: {
        assignments: [
          {
            tenantId: 't1',
            tenantName: 'Tish Klinikasi',
            tenantSlug: 'tish-klinikasi',
            branchId: 'b1',
            branchName: 'Asosiy filial',
            roleName: 'Bosh shifokor',
            isOwner: true,
          },
        ],
        ownerTenants: [],
      },
    }),
    useSwitchWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
  }));

  vi.mock('@/stores/auth-store.ts', () => ({
    // activeTenantId non-null qasddan — auto-select useEffect (bir dona option
    // bo'lsa switchMut.mutate() avtomatik chaqiradi) shart bo'yicha skip qilinadi
    // (bu ticket faqat static render/i18n'ni tekshiradi, auto-select oqimini emas).
    useAuthStore: () => ({
      activeTenantId: 't1',
      clear: vi.fn(),
      setTokens: vi.fn(),
      setContext: vi.fn(),
    }),
  }));

  describe('SelectWorkspacePage — CLI-373 owner badge i18n', () => {
    it("egasi bejchasi tarjima qilingan matn bilan ko'rinadi, literal 'Owner' emas", () => {
      renderApp(<SelectWorkspacePage />);

      expect(screen.getByText('Egasi')).toBeInTheDocument();
      expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/web && bunx vitest run src/features/auth/pages/select-workspace.page.test.tsx` — expect `screen.getByText('Egasi')` to fail (the rendered badge currently shows literal `"Owner"`, not `"Egasi"`), confirming the test catches the bug before the fix.

- [ ] **Step 3: Write minimal implementation**

  In `apps/web/src/features/auth/pages/select-workspace.page.tsx`, change line 149:
  ```tsx
  {opt.isOwner && <Badge color="teal">Owner</Badge>}
  ```
  to:
  ```tsx
  {opt.isOwner && <Badge color="teal">{t('auth.select_workspace.owner_badge')}</Badge>}
  ```

  In `packages/i18n/src/locales/uz.json`, change the `select_workspace` block (currently lines 129-136):
  ```json
      "select_workspace": {
        "title": "Workspace tanlash",
        "no_workspaces": "Sizda hech qanday klinika yo'q. Birinchi qadam — klinikani ro'yxatdan o'tkazing.",
        "all_branches": "Barcha filiallar",
        "session_expired_title": "Sessiya muddati tugadi",
        "session_expired_message": "Iltimos, qayta login qiling. Eski refresh token endi yaroqsiz.",
        "switch_failed": "Workspace almashtirib bo'lmadi"
      },
  ```
  to:
  ```json
      "select_workspace": {
        "title": "Workspace tanlash",
        "no_workspaces": "Sizda hech qanday klinika yo'q. Birinchi qadam — klinikani ro'yxatdan o'tkazing.",
        "all_branches": "Barcha filiallar",
        "owner_badge": "Egasi",
        "session_expired_title": "Sessiya muddati tugadi",
        "session_expired_message": "Iltimos, qayta login qiling. Eski refresh token endi yaroqsiz.",
        "switch_failed": "Workspace almashtirib bo'lmadi"
      },
  ```

  In `packages/i18n/src/locales/ru.json`, change the `select_workspace` block (currently lines 129-136):
  ```json
      "select_workspace": {
        "title": "Выберите workspace",
        "no_workspaces": "У вас нет клиник. Первый шаг — зарегистрируйте клинику.",
        "all_branches": "Все филиалы",
        "session_expired_title": "Сессия истекла",
        "session_expired_message": "Пожалуйста, войдите снова. Старый refresh token больше не действителен.",
        "switch_failed": "Не удалось сменить рабочее пространство"
      },
  ```
  to:
  ```json
      "select_workspace": {
        "title": "Выберите workspace",
        "no_workspaces": "У вас нет клиник. Первый шаг — зарегистрируйте клинику.",
        "all_branches": "Все филиалы",
        "owner_badge": "Владелец",
        "session_expired_title": "Сессия истекла",
        "session_expired_message": "Пожалуйста, войдите снова. Старый refresh token больше не действителен.",
        "switch_failed": "Не удалось сменить рабочее пространство"
      },
  ```

- [ ] **Step 4: Run test to verify it passes**
  `cd apps/web && bunx vitest run src/features/auth/pages/select-workspace.page.test.tsx` — expect green. Then run `cd apps/web && bunx vitest run src/features/auth` to confirm no other auth-feature test regressed, and `bun run typecheck` (repo root or `apps/web` workspace script) to confirm the JSON edits didn't break any generated/typed i18n key surface (if one exists) and the `.tsx` edit type-checks cleanly.

- [ ] **Step 5: Commit**
  `git add apps/web/src/features/auth/pages/select-workspace.page.tsx apps/web/src/features/auth/pages/select-workspace.page.test.tsx packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json` — message: `fix(web): translate hardcoded "Owner" badge on select-workspace page (CLI-373)`

---

## Self-review

- **Placeholders:** none — the JSON before/after blocks are the literal current content (read directly from `packages/i18n/src/locales/uz.json:129-136` and `ru.json:129-136`) and the literal new content with `owner_badge` inserted; the `.tsx` before/after line is the literal current line 149 and its replacement.
- **Test file existence checked:** `find apps/web/src/features/auth -iname "*select-workspace*"` returned only the page component — no pre-existing test file, so Task 1 creates one from scratch rather than extending one.
- **Test pattern matches project convention:** modeled on `apps/web/src/features/settings/components/UsersSettingsScreen.test.tsx` (mocks the feature's `*.api` module and `@/stores/auth-store.ts` with `vi.mock`, uses `renderApp()` from `apps/web/src/test-utils.tsx` which wraps `QueryClientProvider` + `MantineProvider` + real `I18nextProvider` + `MemoryRouter` — confirmed by reading that file). Using the real `i18n` instance (not a stub) means the test genuinely exercises the `uz.json` translation, catching both "still hardcoded" and "key added but typo'd/missing" failures.
- **Why the test asserts `queryByText('Owner')` is absent, not just that `'Egasi'` is present:** a pure "Egasi is on screen" assertion would already fail pre-fix (page shows "Owner", not "Egasi"), but adding the negative assertion makes the regression this ticket targets explicit and self-documenting for future readers of the test.
- **Scope discipline:** the plan does not touch `collectOptions()`'s `roleName: 'Owner'` literal (`select-workspace.page.tsx:196`) — flagged in the spec (§4) as a separate, out-of-ticket-scope hardcoded string, left alone here per Global Constraints.
- **uz/ru wording sourced from existing usage, not invented:** confirmed via `grep -in owner packages/i18n/src/locales/{uz,ru}.json` — `owner_full_name`, `owner_desc`, `transfer_ownership`, `transfer_new_owner` all use the "egasi"/"владелец" root; `role_staff: "Xodim"` set the precedent for a short single-word label (vs. a full sentence like `owner_desc`).
