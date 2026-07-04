# CLI-397 NotificationBell Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/web/src/features/notifications/components/NotificationBell.tsx` has zero test coverage despite non-trivial conditional logic: unread-count capped at "99+" (line 93), conditional "mark all read" button visibility (`unreadCount > 0`, line 115), per-row read/unread branching (`item.readAt === null`, `NotificationRow` line 41), and locale-aware date formatting (uz-UZ vs ru-RU, lines 21-30). Add `NotificationBell.test.tsx` covering all four, plus the mutation call-through (`markRead.mutate`/`markAllRead.mutate`) that exercises how the component consumes `notifications.api.ts`'s hooks.

**Architecture:** Frontend-only, single new test file: `apps/web/src/features/notifications/components/NotificationBell.test.tsx`. No source changes. Uses the existing `renderApp` helper (`apps/web/src/test-utils.tsx`) and mocks `../notifications.api.ts` (the three hooks `useNotifications`/`useMarkRead`/`useMarkAllRead`) the same way `Topbar.test.tsx` already does for the same module. Real `i18n` singleton (`@/lib/i18n.ts`) is used for locale switching, matching `zod-error-map.test.ts`'s convention.

**Tech Stack:** React, vitest, Testing Library, Mantine v7

## Global Constraints

- This is characterization testing of already-correct behavior, not a bugfix — if a test reveals the component is actually WRONG (e.g. 99+ capping is off-by-one, or a read row still fires `markRead.mutate`), stop and flag it rather than writing a test that encodes the bug as correct.
- **Popover opens asynchronously.** `Popover.Dropdown` mounts via Mantine's `Transition` component, which (since `test-utils.tsx`'s `MantineProvider` does not set the `env="test"` prop) runs its real `requestAnimationFrame` + `setTimeout(250ms)` sequence rather than the synchronous "test env" shortcut. Any assertion on dropdown content (the header, the mark-all-read button, notification rows) MUST use an async query — `await screen.findByText(...)` or `await waitFor(...)` — never a synchronous `getByText` immediately after `fireEvent.click`. Do not use `vi.useFakeTimers()` in this file — the rAF-based sequence needs real timers.
- **CSS modules are disabled in tests** (`apps/web/vitest.config.ts`: `test.css: false`) — `classes.row`/`classes.unreadDot`/etc. resolve to `undefined` class names. Never assert via CSS module class selectors. Use the `data-unread` attribute (a plain JSX prop, unaffected by CSS handling) to distinguish read/unread rows instead.
- Mock only `../notifications.api.ts` (relative to `components/`) — the exact specifier `NotificationBell.tsx` itself imports (`from '../notifications.api.ts'`). Do not mock `@dental/api-client` separately; the hook-level mock replaces the whole chain.
- Reset `i18n` to `'uz'` (the project default, set globally by `test-setup.ts`) in an `afterEach` in this file, so locale changes never leak into other test files or later tests in this file — mirrors `zod-error-map.test.ts`.

---

### Task 1: Create NotificationBell.test.tsx with unread-count capping cases

**Files:**
- Create: `apps/web/src/features/notifications/components/NotificationBell.test.tsx`

- [ ] **Step 1: Write the test**

  ```tsx
  import { fireEvent, screen } from '@testing-library/react';
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { i18n } from '@/lib/i18n.ts';
  import { renderApp } from '../../../test-utils';
  import { NotificationBell } from './NotificationBell';

  type MockNotification = {
    id: string;
    title: string;
    body: string | null;
    readAt: string | null;
    createdAt: string;
  };

  let mockData: { data: MockNotification[]; unreadCount: number } | undefined;
  const markReadMutate = vi.fn();
  const markAllReadMutate = vi.fn();

  vi.mock('../notifications.api.ts', () => ({
    useNotifications: () => ({ data: mockData, isLoading: false }),
    useMarkRead: () => ({ mutate: markReadMutate, isPending: false }),
    useMarkAllRead: () => ({ mutate: markAllReadMutate, isPending: false }),
  }));

  afterEach(async () => {
    await i18n.changeLanguage('uz');
  });

  describe('NotificationBell — unread-count capping', () => {
    beforeEach(() => {
      markReadMutate.mockClear();
      markAllReadMutate.mockClear();
    });

    it("unreadCount=0 bo'lganda badge ko'rsatilmaydi", () => {
      mockData = { data: [], unreadCount: 0 };
      renderApp(<NotificationBell />);
      expect(screen.queryByText('0')).toBeNull();
      expect(screen.queryByText('99+')).toBeNull();
    });

    it('unreadCount=5 bo\'lganda "5" ko\'rsatiladi', () => {
      mockData = { data: [], unreadCount: 5 };
      renderApp(<NotificationBell />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('unreadCount=99 bo\'lganda "99" ko\'rsatiladi (chegara, hali cap emas)', () => {
      mockData = { data: [], unreadCount: 99 };
      renderApp(<NotificationBell />);
      expect(screen.getByText('99')).toBeInTheDocument();
      expect(screen.queryByText('99+')).toBeNull();
    });

    it('unreadCount=100 bo\'lganda "99+" ga cap qilinadi', () => {
      mockData = { data: [], unreadCount: 100 };
      renderApp(<NotificationBell />);
      expect(screen.getByText('99+')).toBeInTheDocument();
      expect(screen.queryByText('100')).toBeNull();
    });

    it('unreadCount=150 (ancha katta) baribir "99+"', () => {
      mockData = { data: [], unreadCount: 150 };
      renderApp(<NotificationBell />);
      expect(screen.getByText('99+')).toBeInTheDocument();
      expect(screen.queryByText('150')).toBeNull();
    });
  });
  ```

  Note: these 5 cases don't need the popover open — the `Indicator` badge lives on `Popover.Target`, always in the DOM regardless of `opened` state (only the `Dropdown` is transition-gated).

- [ ] **Step 2: Run test to verify it passes**

  ```bash
  cd apps/web && bunx vitest run src/features/notifications/components/NotificationBell.test.tsx
  ```

  Expected: all 5 tests pass against the current (already-correct) component. If `unreadCount=99` unexpectedly shows `99+`, or `100` shows `100` instead of `99+`, STOP — this means the capping logic is actually off-by-one or otherwise wrong; do not adjust the test to match, flag it instead (see Global Constraints).

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/features/notifications/components/NotificationBell.test.tsx
  git commit -m "$(cat <<'EOF'
  test(web): add NotificationBell unread-count capping coverage

  NotificationBell had zero test coverage. Start with the 99+ capping
  logic (unreadCount > 99 ? '99+' : unreadCount) — characterization
  tests for already-correct behavior, more cases follow in this file.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: mark-all-read visibility + read/unread distinction

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationBell.test.tsx` — append two new `describe` blocks after the one Task 1 added, before end of file.

- [ ] **Step 1: Write the test**

  Append:

  ```tsx
  describe("NotificationBell — mark-all-read tugma ko'rinishi", () => {
    beforeEach(() => {
      markReadMutate.mockClear();
      markAllReadMutate.mockClear();
    });

    it('unreadCount=0 bo\'lsa "Hammasini o\'qilgan deb belgilash" tugmasi yo\'q', async () => {
      mockData = { data: [], unreadCount: 0 };
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
      await screen.findByText("Bildirishnomalar yo'q"); // dropdown ochilgani (empty state) tasdiqlanadi
      expect(screen.queryByText("Hammasini o'qilgan deb belgilash")).toBeNull();
    });

    it('unreadCount>0 bo\'lsa tugma bor va bosilganda markAllRead.mutate chaqiriladi', async () => {
      mockData = {
        data: [
          { id: 'n1', title: 'Test', body: null, readAt: null, createdAt: '2026-07-01T08:00:00.000Z' },
        ],
        unreadCount: 1,
      };
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
      const btn = await screen.findByText("Hammasini o'qilgan deb belgilash");
      fireEvent.click(btn);
      expect(markAllReadMutate).toHaveBeenCalledTimes(1);
      expect(markAllReadMutate).toHaveBeenCalledWith();
    });
  });

  describe("NotificationBell — o'qilgan/o'qilmagan qator farqi", () => {
    beforeEach(() => {
      markReadMutate.mockClear();
      markAllReadMutate.mockClear();
    });

    it("o'qilmagan qator (readAt=null) data-unread bilan belgilanadi va bosilganda markRead.mutate(id) chaqiradi", async () => {
      mockData = {
        data: [
          {
            id: 'unread-1',
            title: 'Unread item',
            body: null,
            readAt: null,
            createdAt: '2026-07-01T08:00:00.000Z',
          },
        ],
        unreadCount: 1,
      };
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
      const row = await screen.findByText('Unread item');
      const rowButton = row.closest('button');
      expect(rowButton).toHaveAttribute('data-unread', 'true');

      fireEvent.click(rowButton!);
      expect(markReadMutate).toHaveBeenCalledWith('unread-1');
    });

    it("o'qilgan qator (readAt bor) data-unread'siz va bosilganda markRead.mutate chaqirilmaydi", async () => {
      mockData = {
        data: [
          {
            id: 'read-1',
            title: 'Read item',
            body: null,
            readAt: '2026-06-30T08:00:00.000Z',
            createdAt: '2026-07-01T08:00:00.000Z',
          },
        ],
        unreadCount: 0,
      };
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
      const row = await screen.findByText('Read item');
      const rowButton = row.closest('button');
      expect(rowButton).not.toHaveAttribute('data-unread');

      fireEvent.click(rowButton!);
      expect(markReadMutate).not.toHaveBeenCalled();
    });
  });
  ```

  `screen.getByLabelText('Bildirishnomalar')` matches the bell `ActionIcon`'s `aria-label={t('shell.notifications')}` — confirmed as the exact uz string by `Topbar.test.tsx` (`packages/i18n/src/locales/uz.json`: `"shell": { "notifications": "Bildirishnomalar" }`). Both tests in this task run with `i18n.language === 'uz'` (the default), so the hardcoded label is safe here — no locale switching happens in this task.

- [ ] **Step 2: Run test to verify it passes**

  ```bash
  cd apps/web && bunx vitest run src/features/notifications/components/NotificationBell.test.tsx
  ```

  Expected: all tests from Task 1 + these 4 new ones pass. If `markReadMutate` fires for the read row, or the mark-all-read button renders with `unreadCount=0`, STOP and flag per Global Constraints rather than adjusting the test.

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/features/notifications/components/NotificationBell.test.tsx
  git commit -m "$(cat <<'EOF'
  test(web): cover NotificationBell mark-all-read visibility + row read state

  Adds coverage for the unreadCount>0 gate on the "mark all read"
  button and NotificationRow's readAt===null branching (data-unread
  attribute + which click calls markRead.mutate).

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: uz/ru date formatting

**Files:**
- Modify: `apps/web/src/features/notifications/components/NotificationBell.test.tsx` — append final `describe` block.

- [ ] **Step 1: Write the test**

  Append:

  ```tsx
  describe('NotificationBell — locale-aware sana formatlash', () => {
    const iso = '2026-07-05T08:30:00.000Z';

    const expectedFor = (locale: string) =>
      new Intl.DateTimeFormat(locale, {
        timeZone: 'Asia/Tashkent',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso));

    beforeEach(() => {
      markReadMutate.mockClear();
      markAllReadMutate.mockClear();
      mockData = {
        data: [{ id: 'n1', title: 'Item', body: null, readAt: null, createdAt: iso }],
        unreadCount: 1,
      };
    });

    it("uz va ru Intl formatlari bir-biridan farq qiladi (sanity — locale shoxobchasi tekshirilishi mumkinligini tasdiqlaydi)", () => {
      expect(expectedFor('uz-UZ')).not.toBe(expectedFor('ru-RU'));
    });

    it("i18n tili 'uz' bo'lganda sana uz-UZ formatida ko'rsatiladi", async () => {
      await i18n.changeLanguage('uz');
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText(i18n.t('shell.notifications')));
      await screen.findByText('Item');
      expect(screen.getByText(expectedFor('uz-UZ'))).toBeInTheDocument();
    });

    it("i18n tili 'ru' bo'lganda sana ru-RU formatida ko'rsatiladi", async () => {
      await i18n.changeLanguage('ru');
      renderApp(<NotificationBell />);
      fireEvent.click(screen.getByLabelText(i18n.t('shell.notifications')));
      await screen.findByText('Item');
      expect(screen.getByText(expectedFor('ru-RU'))).toBeInTheDocument();
    });
  });
  ```

  Important: unlike Task 2, these tests change the active locale to `'ru'` before rendering, so the bell's `aria-label` text itself changes (`t('shell.notifications')` → `"Уведомления"` in ru). Use `screen.getByLabelText(i18n.t('shell.notifications'))` (computed dynamically from the live `i18n` instance) rather than a hardcoded `'Bildirishnomalar'` string, so the query resolves correctly under both locales. The `afterEach(() => i18n.changeLanguage('uz'))` from Task 1 already resets state between tests and after the file finishes.

- [ ] **Step 2: Run test to verify it passes**

  ```bash
  cd apps/web && bunx vitest run src/features/notifications/components/NotificationBell.test.tsx
  ```

  Expected: all tests in the file pass (5 from Task 1 + 4 from Task 2 + 3 from Task 3 = 12 total). If the uz and ru rendered strings are identical in this environment (unlikely — `uz-UZ` uses `/` separators, `ru-RU` uses `.` per local Node ICU check), the sanity test in this task will fail first and cleanly signal an environment issue rather than a silent false pass on the two locale tests.

  Then confirm no type regressions:

  ```bash
  cd apps/web && bun run typecheck
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/src/features/notifications/components/NotificationBell.test.tsx
  git commit -m "$(cat <<'EOF'
  test(web): cover NotificationBell uz/ru locale-aware date formatting

  Completes CLI-397 — NotificationBell now has full characterization
  coverage: 99+ capping, mark-all-read visibility, read/unread row
  branching, and uz-UZ/ru-RU Intl.DateTimeFormat output.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — every mock hook name (`useNotifications`, `useMarkRead`, `useMarkAllRead`), every translation string (`shell.notifications`, `notifications.title`, `notifications.mark_all_read`, `notifications.empty`), and every field name (`readAt`, `createdAt`, `unreadCount`, `data`) is taken verbatim from reading `NotificationBell.tsx`, `notifications.api.ts`, `notifications.keys.ts`, `packages/api-client/src/generated/model/notification.ts`, and `packages/i18n/src/locales/{uz,ru}.json` in full.
- **Convention fidelity:** render helper (`renderApp`), hook-mocking shape (`vi.mock('../notifications.api.ts', () => ({...}))` with a mutable module-level `mockData`), and locale-switch pattern (`i18n.changeLanguage` on the real singleton + `afterEach` reset) are each copied from an existing test in this exact codebase (`Topbar.test.tsx` for the notifications hook mock verbatim, `QueueBoard.test.tsx` for the mutable-mock-data pattern, `zod-error-map.test.ts`/`test-setup.ts` for the i18n locale convention) rather than invented.
- **Popover-timing risk called out explicitly:** the Global Constraints section and Task 2/3 both flag that `Popover.Dropdown` mounts asynchronously via Mantine's real `Transition` (rAF + 250ms timeout, since `test-utils.tsx` doesn't pass `env="test"` to `MantineProvider`) — every dropdown-content assertion uses `findByText`, never a synchronous `getByText` right after the click.
- **CSS-modules gap avoided:** `data-unread` (a plain DOM attribute) is used instead of the component's own `classes.unreadDot`/`classes.row` CSS-module class names, which resolve to `undefined` under this project's `vitest.config.ts` (`test.css: false`).
- **Locale-label bug avoided in the plan itself:** Task 3 explicitly uses `i18n.t('shell.notifications')` instead of the hardcoded `'Bildirishnomalar'` string used in Task 2, since Task 3's tests switch to `'ru'` before rendering, which would otherwise make `getByLabelText('Bildirishnomalar')` fail to find the (now Russian-labeled) button.
- **Characterization framing, not bugfix:** every step's "run test to verify it passes" note tells the executor to STOP and flag rather than adjust the test if a case reveals unexpected/wrong component behavior (e.g. capping off-by-one, wrong mutation call), matching the ticket's characterization-testing nature.
- **Scope minimal and DoD-complete:** exactly one new file, 3 incremental commits, all 4 DoD-named cases covered (99+ capping, mark-all-read visibility, read/unread distinction, uz/ru date formatting) plus the two mutation-call assertions the ticket implies (`markRead.mutate`/`markAllRead.mutate` call-through) — no unrelated refactors, no source-file edits.
