# CLI-367 Desktop Tray/Build Icon Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/desktop/src/tray.ts:31` references `../assets/tray-icon.png` and `apps/desktop/electron-builder.yml:47` references `build/icon.ico` — neither file exists, and no brand/logo source art exists anywhere in this repo (confirmed by a full-repo search — see spec doc `docs/superpowers/specs/2026-07-04-cli-367-desktop-icons-design.md` §2.3). This is not a normal TDD-a-feature ticket: creating a real brand icon from nothing is a design decision, not a coding task. This plan therefore does two different things: (1) real, test-driven code to make `tray.ts` resilient if the icon file is ever missing/invalid, so a packaged build degrades gracefully instead of crashing, and (2) a placeholder-asset + explicit human-handoff step so the build pipeline can be exercised before final artwork exists. Task 3 updates the stale TODO once a file is in place.

**Architecture:** No new modules. Two files touched in `apps/desktop/`: `src/tray.ts` (defensive fix) and its shared test mock `src/test-electron-mock.ts` (extended, not replaced, per its own documented single-mock-per-suite convention). Two new binary assets added: `assets/tray-icon.png`, `build/icon.ico` (+ a sibling text note marking them as placeholders). One doc-only edit: `electron-builder.yml`'s stale "file doesn't exist" TODO comment replaced with an accurate marker (or removed outright if real artwork was used).

**Tech Stack:** Bun (`bun:test`), Electron (`Tray`, `nativeImage`), electron-builder (NSIS `icon:` config).

## Global Constraints

- Do not invent a "brand design." Any icon file added in this plan that is not confirmed to be actual, human-approved brand artwork MUST be a plainly-labeled placeholder (solid neutral shape/color, explicit "PLACEHOLDER — replace with real brand artwork" note alongside it) — never presented as if it were final.
- Do not modify `tray.ts`'s exported function signatures (`createTray`, `updateTray`, `setTrayToolTip`) — only the internals of `createTray` change.
- Do not touch the existing 8 passing tests in `tray.test.ts` — they must remain green, unmodified in behavior.
- Do not attempt to verify the real Windows NSIS build or real tray rendering in this plan — that requires a physical Windows machine and is tracked separately as CLI-361.

---

### Task 1: Defensive handling in `tray.ts` for a missing/invalid icon file

**Files:**
- Modify: `apps/desktop/src/tray.ts:30-35`
- Modify (test infra, shared mock — extend, don't duplicate): `apps/desktop/src/test-electron-mock.ts`
- Test: `apps/desktop/src/tray.test.ts`

**Interfaces (unchanged):**
```ts
export const createTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => { ... };
```

- [ ] **Step 1: Extend the shared electron mock to allow a test to simulate BOTH real-world missing-icon failure modes**

  `test-electron-mock.ts` explicitly documents (its own top-of-file comment) that there must be exactly ONE `mock.module('electron', ...)` registration shared across all `*.test.ts` files, because `bun test` loads every test file into one process and a second `mock.module('electron', ...)` call elsewhere would race. So this step *extends* the existing shared state/class rather than adding a second mock.

  **Important — there are two distinct failure modes to cover, not one:** per Electron's documented behavior, `nativeImage.createFromPath()` on a missing/corrupt file does **not** throw — it silently returns an *empty* `NativeImage` (`image.isEmpty() === true`). Whether the subsequent `new Tray(emptyImage)` throws is genuinely platform/version-dependent and unverifiable from this Linux dev environment. So the fix must not rely solely on a `Tray`-constructor try/catch (that only fires if this particular Electron/OS combination happens to throw) — it must also react to `isEmpty()` directly, which is the one signal guaranteed present for a missing file. Both are wired into the mock:

  ```ts
  export const trayMockState: {
    setToolTipCalls: string[];
    setContextMenuCalls: MockMenuItem[][];
    lastMenuTemplate: MockMenuItem[] | null;
    throwOnConstruct: Error | null;
    iconEmpty: boolean;
  } = {
    setToolTipCalls: [],
    setContextMenuCalls: [],
    lastMenuTemplate: null,
    throwOnConstruct: null,
    iconEmpty: false,
  };

  export const resetTrayMockState = (): void => {
    trayMockState.setToolTipCalls = [];
    trayMockState.setContextMenuCalls = [];
    trayMockState.lastMenuTemplate = null;
    trayMockState.throwOnConstruct = null;
    trayMockState.iconEmpty = false;
  };

  class FakeTray {
    constructor(_icon: unknown) {
      if (trayMockState.throwOnConstruct) throw trayMockState.throwOnConstruct;
    }
    setToolTip(text: string): void {
      trayMockState.setToolTipCalls.push(text);
    }
    setContextMenu(menu: MockMenuItem[]): void {
      trayMockState.setContextMenuCalls.push(menu);
    }
  }
  ```
  and in the `mock.module('electron', ...)` factory further down, change:
  ```ts
  nativeImage: { createFromPath: (_path: string) => ({}) },
  ```
  to:
  ```ts
  nativeImage: {
    createFromPath: (_path: string) => ({ isEmpty: () => trayMockState.iconEmpty }),
  },
  ```
  (`iconEmpty` defaults to `false`, so all 8 existing tests — which never touch this flag — see a non-empty icon and are unaffected.)

- [ ] **Step 2: Write the failing tests in `tray.test.ts`** (two cases — the guaranteed-real one, and the defense-in-depth one)

  Add (using `spyOn` from `bun:test`, confirmed available: `bun -e "import { spyOn } from 'bun:test'; console.log(typeof spyOn)"` → `function`):
  ```ts
  import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
  ```
  ```ts
  test("ikon fayli yo'q (nativeImage bo'sh qaytaradi) bo'lsa createTray warning log qiladi va crash bo'lmaydi", () => {
    trayMockState.iconEmpty = true;
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      createTray(
        'server',
        { serverUrl: 'http://localhost:80' },
        { onOpen: mock(() => {}), onSettings: mock(() => {}), onStop: mock(() => {}) },
      ),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('tray-icon.png');

    warnSpy.mockRestore();
  });

  test('Tray konstruktori xato tashlasa ham (platforma-darajasidagi xato), createTray crash bo\'lmaydi va warning log qiladi', () => {
    trayMockState.throwOnConstruct = new Error('ENOENT: no such file, tray-icon.png');
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      createTray(
        'server',
        { serverUrl: 'http://localhost:80' },
        { onOpen: mock(() => {}), onSettings: mock(() => {}), onStop: mock(() => {}) },
      ),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
  ```

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bun test src/tray.test.ts`

  Expected: **FAIL** on both new tests — current `createTray` never checks `isEmpty()` (so the first test gets zero `console.warn` calls), and has no try/catch around `new Tray(...)` (so the second test's thrown error propagates out of `createTray` uncaught, failing `expect(...).not.toThrow()`).

- [ ] **Step 3: Make it pass — check `isEmpty()` AND add the try/catch in `tray.ts`**

  Replace `tray.ts:30-35`:
  ```ts
  export const createTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => {
    const iconPath = join(import.meta.dirname, '..', 'assets', 'tray-icon.png');
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip('Dental Service');
    updateTray(role, info, callbacks);
  };
  ```
  with:
  ```ts
  export const createTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => {
    const iconPath = join(import.meta.dirname, '..', 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.warn(`[tray] Icon fayl topilmadi yoki yaroqsiz (${iconPath}) — tray ikonkasi ko'rinmasligi mumkin.`);
    }
    try {
      tray = new Tray(icon);
    } catch (err) {
      console.warn(
        `[tray] Tray ikonkasi yaratilmadi (${iconPath}): ${(err as Error).message}. Ilova tray'siz davom etadi.`,
      );
      return;
    }
    tray.setToolTip('Dental Service');
    updateTray(role, info, callbacks);
  };
  ```

  This covers both failure modes independently: `isEmpty()` fires the warning for the guaranteed-real "file missing" case (Electron's documented behavior — no throw), and the `try/catch` is defense-in-depth for whatever a given platform/Electron version does with an empty image at `Tray` construction time (uncertain, unverifiable from Linux, but must not be allowed to crash the process either way).

  Note: `updateTray` (`tray?.setContextMenu(...)`) and `setTrayToolTip` (`tray?.setToolTip(...)`) already use optional chaining on the module-level `tray` variable — leaving `tray` as `null` after a caught construction failure is already handled safely by existing code, no further changes needed there.

- [ ] **Step 4: Run the new tests to confirm they pass**

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bun test src/tray.test.ts`

  Expected: **PASS** — `10 pass`, `0 fail`.

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bun test`

  Expected: all existing tests across `config.test.ts`, `client-reconnect.test.ts`, `auto-updater.test.ts`, `settings-ipc.test.ts`, `license-status.test.ts`, `discovery.test.ts`, `tray.test.ts`, `first-run.test.ts`, `process-manager.test.ts` still pass (the shared `resetTrayMockState()` call in `tray.test.ts`'s `beforeEach` now also resets `throwOnConstruct`, so it can't leak into other tests in the file, and other test files never touch `trayMockState` at all).

- [ ] **Step 6: Typecheck**

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bun run typecheck`

  Expected: clean, 0 errors.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/desktop/src/tray.ts apps/desktop/src/test-electron-mock.ts apps/desktop/src/tray.test.ts
  git commit -m "fix(desktop): tray survives missing/invalid icon file instead of crashing (CLI-367)"
  ```

---

### Task 2: Add a placeholder icon asset pair + document the required human swap-in

**Files:**
- Create: `apps/desktop/assets/tray-icon.png` (placeholder — see constraint below)
- Create: `apps/desktop/build/icon.ico` (placeholder — see constraint below)
- Create: `apps/desktop/assets/README.md` (placeholder disclosure note)

**⚠️ Honest constraint (not a placeholder for the write-up — a real fact):** Repo-wide search found **zero** existing logo/favicon/brand-art files anywhere in this codebase (not even for `apps/web`'s own dangling `/favicon.svg` reference — see spec doc §2.3). There is no source artwork this plan can convert. **A human (designer/product owner) must supply and approve the real `tray-icon.png` and `icon.ico`, based on the actual Dental Service brand/logo, before this ticket's DoD is truly satisfied.** This task's job is only to leave the repo in a buildable, clearly-labeled state in the meantime — it does not close the ticket by itself.

- [ ] **Step 1: Check whether real brand artwork has since been supplied**

  Ask the user / check for a design handoff (e.g. a Figma export, a logo master file dropped somewhere outside the repo, or explicit direction in the ticket/Linear comments) before generating any placeholder. If real artwork exists — skip straight to using it for both files below (still run the same conversion command in Step 2, pointed at the real source file, and skip the "PLACEHOLDER" labeling in Step 3).

- [ ] **Step 2: If no real artwork exists yet, generate a clearly-marked interim placeholder**

  This unblocks exercising the build pipeline only — it is explicitly not real branding. Confirmed available on this dev machine: `/usr/bin/convert` (ImageMagick). ImageMagick's `icon:auto-resize` directive produces a genuinely multi-resolution `.ico` (satisfies electron-builder/NSIS's format requirement, per spec doc §2.2), from a single flat placeholder PNG:
  ```bash
  cd /home/madrimov/Projects/dental-service/apps/desktop
  mkdir -p assets
  convert -size 256x256 xc:"#808080" -gravity center -pointsize 48 -fill white \
    -annotate 0 "PLACEHOLDER" assets/tray-icon.png
  convert assets/tray-icon.png -define icon:auto-resize=256,48,32,16 build/icon.ico
  ```
  Neutral gray (`#808080`) is used deliberately, not an attempt at the real brand color — this is a functional placeholder, not a design proposal.

- [ ] **Step 3: Add a disclosure note so nobody mistakes the placeholder for final art**

  Create `apps/desktop/assets/README.md`:
  ```markdown
  # apps/desktop/assets/

  `tray-icon.png` (and `../build/icon.ico`) are **PLACEHOLDER** files generated
  programmatically (CLI-367) — they are NOT the real Dental Service brand/logo.

  Before shipping a real Windows/mac build, replace both files with real
  artwork supplied and approved by design/product, then remove this note and
  the `# TODO` reference (if still present) in `../electron-builder.yml`.
  ```

- [ ] **Step 4: Verify the files are picked up as intended**

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bun test src/tray.test.ts`

  Expected: still passes (the placeholder file existing doesn't change any test behavior — the mock intercepts `nativeImage`/`Tray` regardless of the real file's presence; this step is a sanity check that nothing accidentally broke, not new coverage).

  Run: `file apps/desktop/assets/tray-icon.png apps/desktop/build/icon.ico` (or equivalent) to confirm both are recognized as valid PNG / ICO container formats, not empty/corrupt files.

- [ ] **Step 5: Commit (clearly-labeled placeholder commit)**
  ```bash
  git add apps/desktop/assets/tray-icon.png apps/desktop/build/icon.ico apps/desktop/assets/README.md
  git commit -m "chore(desktop): add placeholder tray/build icon assets pending real brand artwork (CLI-367)"
  ```

---

### Task 3: Remove the stale TODO in `electron-builder.yml` once a file is in place

**Files:**
- Modify: `apps/desktop/electron-builder.yml:47`

- [ ] **Step 1: Replace the now-stale "doesn't exist" TODO with an accurate placeholder marker (only once Task 2 has run)**

  The old comment claimed the file doesn't exist at all — false after Task 2. But simply deleting it would leave `electron-builder.yml` with no in-file signal that `icon.ico` is still a placeholder (an editor opening this yml won't see `assets/README.md`). If Task 2's Step 1 found and used **real, human-approved artwork**, delete the comment outright (nothing left to flag). If Task 2 produced the **placeholder** (Step 2 of Task 2), replace it with a narrower, accurate marker instead of deleting it:

  Before (`electron-builder.yml:45-48`):
  ```yaml
  win:
    target: nsis
    # TODO(jonli): build/icon.ico hali yaratilmagan — real build oldidan qo'shilishi kerak
    icon: build/icon.ico
  ```
  After (placeholder case):
  ```yaml
  win:
    target: nsis
    # PLACEHOLDER (CLI-367) — build/icon.ico haqiqiy brend logotipi emas, almashtirilishi kerak (CLI-361 real build oldidan)
    icon: build/icon.ico
  ```
  After (real-artwork case):
  ```yaml
  win:
    target: nsis
    icon: build/icon.ico
  ```
  (The `icon:` path itself was already correct — confirmed in spec doc §2.2 — no change needed there either way.)

- [ ] **Step 2: Confirm electron-builder config still parses**

  Run: `cd /home/madrimov/Projects/dental-service/apps/desktop && bunx electron-builder --help >/dev/null && echo OK`

  This only sanity-checks that `electron-builder` CLI itself is invokable in this environment — it does NOT perform or substitute for a real Windows NSIS build (that needs `win` target tooling and is tracked separately, see below).

- [ ] **Step 3: Commit**
  ```bash
  git add apps/desktop/electron-builder.yml
  git commit -m "chore(desktop): update stale icon.ico TODO now that a file exists (CLI-367)"
  ```

- [ ] **Step 4: Leave the real-Windows verification as an explicit open follow-up**

  Do not attempt to simulate or claim a real NSIS/Windows build result here. Per the ticket's own DoD split and CLAUDE.md precedent (Local Desktop epic, CLI-348: "Task 6-12 Electron/Windows-only ... jismoniy Windows PC'da qo'lda tekshiruv talab qilinadi"), real packaging + tray runtime confirmation on physical Windows is tracked as **CLI-361** and is out of scope for this plan to close.

---

## Self-review

- **Scope check:** Task 1 is the only real production-code change (`tray.ts`), and it is narrowly the defensive handling described in the ticket's risk ("createTray() will fail at runtime") — no unrelated refactor of `tray.ts`.
- **Root-cause honesty:** The ticket's actual blocker (missing brand artwork) is a design/human decision, not something Task 2 pretends to solve with a fabricated "brand" — the placeholder is explicitly labeled as non-final in three places (README note, commit message, spec doc §3.2/§4), and Step 1 of Task 2 checks for real artwork before defaulting to a placeholder.
- **Both real-world failure modes covered, not just the convenient one:** an earlier draft of this plan only wrapped `new Tray(...)` in try/catch, which is triggered only if the specific Electron/OS combination happens to throw on an empty image — genuinely uncertain and unverifiable from this Linux dev environment. Electron's documented, certain behavior for a missing/corrupt file is that `nativeImage.createFromPath()` returns an *empty* image without throwing. The plan now checks `icon.isEmpty()` directly (Step 3 of Task 1) so the ticket's literal ask — "missing icon logs a clear warning instead of crashing" — is satisfied for the guaranteed-real case, with the try/catch retained as defense-in-depth for the uncertain one. Two separate tests (Step 2) exercise each path independently via the mock's new `iconEmpty` flag and existing `throwOnConstruct` flag.
- **Test-first respected where it matters:** Task 1's Step 2 writes real failing tests against real current `tray.ts` behavior (confirmed by reading the file — no `isEmpty()` check or try/catch exists today) before Step 3's fix; Task 2/3 have no meaningful "failing test" shape (adding a binary asset or editing a comment isn't a testable behavior change), so they're structured as a verification checklist instead, per the ticket's own nature.
- **Mock-architecture respected:** Task 1 extends the single shared `test-electron-mock.ts` (per its own documented rationale against multiple `mock.module('electron', ...)` registrations racing) rather than adding a second, conflicting mock in `tray.test.ts`; `iconEmpty` defaults to `false` so all 8 pre-existing tests are unaffected.
- **No scope creep:** Real Windows NSIS build verification and real tray rendering are explicitly deferred to CLI-361 in both the spec doc and Task 3 Step 4 — this plan does not claim to close that.
- **DoD gap flagged, not hidden:** Both docs state plainly that placeholder assets do not satisfy the ticket's "real icon files (based on brand/logo)" requirement — that step remains open pending human design input. Task 3's yml marker is updated (not silently deleted) in the placeholder case so the gap stays visible in-file, not just in a sibling README.
