# CLI-395 Main Stale Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/desktop/src/main.ts:30-38` contains a `⚠️ TASHQI BOG'LIQLIK (jonli, TODO):` comment block with 3 bullets. Two are now factually false: (a) `assets/tray-icon.png` is claimed missing, but CLI-367 added it (commit `9819593`); (b) web `/settings` is claimed to never call `window.dentalDesktop?.setServerUrl(url)`, but CLI-360 built and wired `DesktopServerConnectionCard.tsx` which does exactly that (commit `c4387b7`), mounted in `IntegrationsSettingsScreen.tsx` and routed in `settings.routes.tsx`. This is a repeat of the CLI-382 pattern (same file, same kind of drift). Fix: remove the two false bullets, and rename the block's header — once both are removed, only the `preload.cjs` bullet remains, and labeling a single already-resolved, evergreen-constraint bullet as "live TODO" is itself inaccurate (this is the actual root cause of the repeat: CLI-382 updated bullet content but never fixed the header, so the header stayed wrong and drifted stale again).

**Architecture:** Doc-only change. Single file, single comment block, no runtime code touched. No tests apply (comment-only edit) — DoD is verified by direct comparison of the corrected comment against verified facts (file existence, commit history), not by running anything.

**Tech Stack:** TypeScript comments (JSDoc-style block comment)

## Global Constraints
- Do NOT touch any code below line 39 (the `*/` closing the block) — only the comment text changes.
- **Keep the `preload.cjs` bullet's content substantively intact.** `main.ts:65` has `// `.cjs` — `preload.cts` (CommonJS, sandbox:true talabi; ESM emas, izohiga qarang).` which cross-references this exact bullet ("izohiga qarang" = "see the comment"). Deleting the bullet would leave that reference dangling. Only the bullet's framing shifts from "verified as part of a TODO list" to "documented as a standing constraint" — the facts (commit `165ddc5`, CommonJS/sandbox:true requirement) stay word-for-word.
- Do not just relabel the two false bullets as "resolved" in place (the CLI-382-style fix) — remove them outright. They carry no forward-looking value once true (they were status notes, not constraints), and leaving resolved-status bullets under a "TODO" header is exactly the anti-pattern that produced this ticket.
- This is a Low-priority doc-hygiene ticket — do not expand scope to other files or other comment blocks in `main.ts`.

---

### Task 1: Update stale comment block in main.ts

**Files:**
- Modify: `apps/desktop/src/main.ts:30-38`

**Verified facts backing this change (checked directly, not assumed):**
- `apps/desktop/assets/tray-icon.png` exists (3.7K), added by commit `9819593` — `chore(desktop): add placeholder tray/build icon assets pending real brand artwork (CLI-367)`.
- `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx:33` calls `await window.dentalDesktop?.setServerUrl(serverUrl.trim())`; the component is rendered at `IntegrationsSettingsScreen.tsx:70` and that screen is lazy-routed at `apps/web/src/features/settings/settings.routes.tsx:59` — added by commit `c4387b7` — `feat(web): DesktopServerConnectionCard skeleton (CLI-360 Task 1)`.
- The `preload.cjs` bullet's own claim (CSP + preload ESM/CJS blank-screen bug fixed) is verified true: commit `165ddc5` is `fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)`, present in history.

- [ ] **Step 1: Replace the comment block**

  In `apps/desktop/src/main.ts`, find this exact block (current lines 30-38):

  ```ts
   * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
   *   - `assets/tray-icon.png` — hali repo'da yo'q, distribution paketlashda
   *     qo'shiladi.
   *   - `preload.cjs` (`.cts`dan kompilyatsiya, CommonJS, `sandbox:true` talabi —
   *     ESM emas) real BrowserWindow'da tekshirilgan: shu yerda topilgan
   *     CSP + preload ESM/CJS blank-screen xatosi tuzatilgan (commit 165ddc5,
   *     "fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)").
   *   - Web `/settings` sahifasi `window.dentalDesktop?.setServerUrl(url)`ni
   *     hali chaqirmaydi (apps/web o'zgarishi shu ticket doirasi tashqarisida).
  ```

  Replace it with:

  ```ts
   * 📌 DOIMIY CHEKLOV: `preload.cjs` CommonJS bo'lib qolishi SHART
   *   (`.cts`dan kompilyatsiya, `sandbox:true` talabi — ESM emas). Bu talab
   *   real BrowserWindow'da tekshirilgan: shu yerda topilgan CSP + preload
   *   ESM/CJS blank-screen xatosi tuzatilgan (commit 165ddc5, "fix(desktop):
   *   blank screen in real BrowserWindow (CSP + preload ESM)"). `preload.ts`ni
   *   ESM'ga o'tkazish shu bug'ni qaytaradi.
  ```

  The line immediately after (currently line 39, ` */`) is untouched and still closes the docblock. Do not add or remove a blank comment line — the replacement block should sit directly where the old one was, with the same line before it (line 29, ` *`) and same line after it (` */`) unchanged.

  Resulting full context (lines 22-33 approx after edit) should read:

  ```ts
   * Server — litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q,
   * `license-status.ts` — existence-only, muddat tekshiruvi API tomonida)
   * brauzer asosiy UI o'rniga `/activate`ga ochiladi (CLI-348 qaror 1; web
   * `/activate` sahifasi qurilgan va `auth.routes.tsx`da ro'yxatdan o'tgan —
   * `apps/web/src/features/auth/pages/activate.page.tsx` (commit 7670124,
   * "feat: end-to-end desktop license activation flow")).
   *
   * 📌 DOIMIY CHEKLOV: `preload.cjs` CommonJS bo'lib qolishi SHART
   *   (`.cts`dan kompilyatsiya, `sandbox:true` talabi — ESM emas). Bu talab
   *   real BrowserWindow'da tekshirilgan: shu yerda topilgan CSP + preload
   *   ESM/CJS blank-screen xatosi tuzatilgan (commit 165ddc5, "fix(desktop):
   *   blank screen in real BrowserWindow (CSP + preload ESM)"). `preload.ts`ni
   *   ESM'ga o'tkazish shu bug'ni qaytaradi.
   */
  ```

- [ ] **Step 2: Confirm the cross-reference at line 65 still makes sense**

  Read `apps/desktop/src/main.ts` around line 65 (`// `.cjs` — `preload.cts` (CommonJS, sandbox:true talabi; ESM emas, izohiga qarang).`) and confirm it still points at a real, present explanation (the new `📌 DOIMIY CHEKLOV` bullet). No edit needed here — this step is a read-only sanity check that Step 1 didn't strand the reference.

- [ ] **Step 3: Typecheck**

  ```bash
  cd apps/desktop && bun run typecheck
  ```

  Expected: clean (comment-only change, cannot affect type checking, but confirms no stray syntax breakage from the edit, e.g. an unterminated block comment).

- [ ] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/main.ts
  git commit -m "$(cat <<'EOF'
  docs(desktop): fix stale comments about tray icon and settings IPC bridge (CLI-395)

  main.ts's external-dependency comment block claimed assets/tray-icon.png
  was still missing (CLI-367 added it, commit 9819593) and that web
  /settings never calls window.dentalDesktop?.setServerUrl (CLI-360 wired
  DesktopServerConnectionCard.tsx, commit c4387b7) — both false, a repeat
  of the CLI-382 drift pattern. Remove both stale bullets and reframe the
  remaining preload.cjs note as a standing constraint rather than a "live
  TODO" (the header itself was the actual root cause of the repeat: it
  stayed "TODO" even after CLI-382 verified one bullet, so it drifted
  stale again once the other two resolved).

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — the before/after comment text is verbatim from a direct `Read` of `apps/desktop/src/main.ts` lines 1-80 (confirmed byte-exact via `hexdump`/`cat -A` for apostrophes and the em-dash) plus a `sed -n '30,39p'` re-check; the commit hashes and messages (`9819593`, `c4387b7`, `165ddc5`) were confirmed with `git log`/`git show`, not recalled from the ticket text.
- **Both named facts independently verified, not trusted from the ticket:** `ls apps/desktop/assets/` shows `tray-icon.png` present; `grep -rn setServerUrl apps/web/src` shows the real call site in `DesktopServerConnectionCard.tsx:33`, plus confirmed it's actually reachable (mounted in `IntegrationsSettingsScreen.tsx:70`, routed in `settings.routes.tsx:59`) — not dead code.
- **Third stale item found beyond the ticket's two:** the block's header (`jonli, TODO`) becomes inaccurate once both named bullets are removed, since the sole remaining bullet (`preload.cjs`) is already-resolved-and-historical, not a live TODO. This is flagged as the likely root cause of the CLI-382 → CLI-395 repeat (CLI-382, commit `bf16faa`, updated bullet *content* but left this header untouched) and is fixed here by reframing the header as a standing constraint rather than re-declaring "resolved" (which would just repeat the same class of drift a third time).
- **Cross-reference integrity preserved:** the `preload.cjs` bullet is kept (not deleted) specifically because `main.ts:65`'s `// ... izohiga qarang` ("see the comment") comment depends on it existing; Step 2 makes this an explicit, checkable step rather than an assumption.
- **No scope creep:** no other comment blocks in `main.ts`, no other files, and no runtime/behavior changes — matches the ticket's Low priority and doc-hygiene nature. `bun run typecheck` is included only as a cheap safety net against a malformed block comment, not because comment text needs type-checking.
