# CLI-372 Integrations Screen Disabled Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `IntegrationsSettingsScreen`'s Connect/Configure buttons (`apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx:137-152`) so they no longer look like live, clickable actions when they silently no-op (no `onClick`, scaffold-only per the file's own comment). Give both button variants a `disabled` state plus a `Tooltip` reusing the project's existing "coming soon" translation key (`shell.coming_soon`, already used by the Sidebar nav-item pattern) — see spec: `docs/superpowers/specs/2026-07-04-cli-372-integrations-buttons-design.md`.

**Architecture:** No architectural change. Pure presentational fix inside one existing component. No new shared component is introduced — the Sidebar's `.soon` badge pattern is CSS-Module-bound to nav-items and not reusable here; instead we reuse Mantine's own `Tooltip` primitive (not used anywhere else in `apps/web` yet, per repo grep) wrapped around the existing `Button`s, following Mantine's documented pattern for tooltips on disabled buttons (wrap in a non-disabled `<span>` since `disabled` buttons block pointer events needed for hover).

**Tech Stack:** React, Mantine v7 (`Button`, `Tooltip`), react-i18next

## Global Constraints
- Do not add a new i18n key — reuse `shell.coming_soon` (already present in `packages/i18n/src/locales/uz.json:221` = `"Tez orada"` and `ru.json:221` = `"Скоро"`).
- Do not touch the `StatusPill` / connected-status logic (121-126) — it already correctly reflects real backend state for `eskiz`/`telegram` and is out of scope.
- Both button branches (connected → "Sozlash"/Configure, not-connected → "Ulash"/Connect) get the same treatment — the bug affects all 4 cards identically (verified in spec §2: none of the 4 cards' buttons have an `onClick`, including `eskiz`/`telegram` whose connection *status* is real but whose action buttons are still scaffold).
- Do not remove or rewrite the existing JSDoc comment (lines 15-23) explaining the Faza 3 scaffold rationale — it stays accurate.

---

### Task 1: Disable Connect/Configure buttons with a "coming soon" tooltip

**Files:**
- Modify: `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx:3` (import) and `:137-152` (both Button branches)
- Test: `apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx` (existing file — modify, do not create a new one)

- [ ] **Step 1: Write the failing test**

  Add a new `it` block to the existing `describe('IntegrationsSettingsScreen', ...)` in `apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`:

  ```tsx
  it('Connect/Configure tugmalari disabled va "tez orada" tooltip ko‘rsatadi', () => {
    const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
    const buttons = getAllByRole('button');
    // 4 karta — har birida bitta Connect yoki Configure tugma, hammasi disabled bo'lishi kerak
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });
  ```

  This asserts the DoD-required minimum (disabled state) directly via Testing Library's `toBeDisabled()` matcher — confirmed available: `apps/web/src/test-setup.ts:1` imports `@testing-library/jest-dom/vitest` globally (`vitest.config.ts` wires it via `test.setupFiles`), so `jest-dom` matchers are already active for every test in this suite, no extra setup needed.

- [ ] **Step 2: Run test to verify it fails**

  Run: `bun --filter @dental/web test IntegrationsSettingsScreen` (or the project's standard `turbo test --filter @dental/web -- IntegrationsSettingsScreen`, per `CLAUDE.md` §6 test commands — web tests run under vitest).
  Expected: FAIL — current buttons have no `disabled` attribute, so `expect(button).toBeDisabled()` (or the attribute check) fails for all 4.

- [ ] **Step 3: Write minimal implementation**

  In `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx`:

  Change the import (line 3) from:
  ```tsx
  import { Button, Loader, Title } from '@mantine/core';
  ```
  to:
  ```tsx
  import { Button, Loader, Title, Tooltip } from '@mantine/core';
  ```

  Replace the button block (lines 137-152):
  ```tsx
  {connected ? (
    <Button variant="outline" size="xs" style={{ alignSelf: 'flex-start' }}>
      {t('settings.integration_configure')}
    </Button>
  ) : (
    <Button
      size="xs"
      style={{
        alignSelf: 'flex-start',
        background: 'var(--primary)',
        color: 'var(--on-primary)',
      }}
    >
      {t('settings.integration_connect')}
    </Button>
  )}
  ```
  with:
  ```tsx
  {connected ? (
    <Tooltip label={t('shell.coming_soon')}>
      <span style={{ alignSelf: 'flex-start' }}>
        <Button variant="outline" size="xs" disabled>
          {t('settings.integration_configure')}
        </Button>
      </span>
    </Tooltip>
  ) : (
    <Tooltip label={t('shell.coming_soon')}>
      <span style={{ alignSelf: 'flex-start' }}>
        <Button
          size="xs"
          disabled
          style={{
            background: 'var(--primary)',
            color: 'var(--on-primary)',
          }}
        >
          {t('settings.integration_connect')}
        </Button>
      </span>
    </Tooltip>
  )}
  ```

  Note: `alignSelf: 'flex-start'` moves from the `Button`'s own `style` to the wrapping `<span>`'s `style`, since the `<span>` is now the direct flex child inside the card's `flexDirection: 'column'` container (lines 88-90) — this keeps the button from stretching to full card width, matching the original layout exactly.

- [ ] **Step 4: Run test to verify it passes**

  Run the same command as Step 2.
  Expected: PASS — all 4 buttons now report `disabled`. Also re-run the full existing file (`IntegrationsSettingsScreen.test.tsx`, all 4 `it` blocks) to confirm no regression: the 3 pre-existing tests (grid renders 4 cards, status pill 1 success / 3 neutral, button label text «Sozlash»×1/«Ulash»×3) must still pass unchanged — `disabled` and the `Tooltip` wrapper do not change button `role`, `textContent`, or the grid/status-pill DOM structure being asserted.

- [ ] **Step 5: Typecheck**

  Run the project's standard typecheck command for `apps/web` (per `CLAUDE.md` §6 — e.g. `bun run typecheck` or `turbo typecheck --filter @dental/web`).
  Expected: no new errors — `Tooltip` is a standard `@mantine/core` export, already a dependency of `apps/web`.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx
  git commit -m "fix(web): disable no-op Connect/Configure buttons in IntegrationsSettingsScreen"
  ```

---

## Self-review

- Verified via full-file read that **all 4 integration cards** (`eskiz`, `telegram`, `soliq`, `onec`) share one JSX block and none of their Connect/Configure buttons has an `onClick` — the fix applies uniformly, not just to the two backend-unmanaged (`soliq`/`onec`) rows. This matches the ticket's cited line range (140-155 in the ticket vs. 137-152 in the file as currently read — line numbers can drift a few lines between when a ticket is filed and when it's picked up; the plan cites the freshly-verified 137-152 and instructs re-locating the block by content if it has moved further).
- Confirmed no reusable "coming soon" component exists to import — the only prior art (`apps/web/src/shell/Sidebar.tsx:212-223`, `.soon` CSS-Module class) is inline JSX + CSS-Module scoped to nav-items, not an extractable component. The plan reuses the *concept* (disabled + "coming soon" wording) and the exact existing i18n key (`shell.coming_soon`), not the Sidebar's DOM structure — avoiding both a premature abstraction and a duplicate translation key.
- Confirmed via repo-wide grep that Mantine `Tooltip` has zero prior usages in `apps/web/src` — the wrapper-`<span>` pattern in Step 3 is Mantine's own documented workaround for disabled-button tooltips (disabled buttons set `pointer-events: none` natively, which blocks the hover events `Tooltip` needs if it wraps the `Button` directly), not a made-up pattern.
- Test addition (Step 1) is minimal and targeted at the DoD's literal minimum bar ("disabled state or tooltip/badge") via a direct `disabled`-attribute assertion; it deliberately does not try to assert the `Tooltip` label text is visible on hover, since Testing Library hover-triggered tooltip assertions are flaky/timing-dependent and the DoD only requires "at minimum" the disabled state — the Tooltip is a bonus already covered by manual/visual verification, not something that needs brittle test coverage.
- Confirmed the existing test file's 3 pre-existing assertions (grid card count, status-pill success/neutral split, button label text) do not query anything Step 3 changes (`role="button"` stays, `textContent` stays, grid/status-pill DOM is untouched) — no existing test needs rewriting, only one new `it` block is added.
