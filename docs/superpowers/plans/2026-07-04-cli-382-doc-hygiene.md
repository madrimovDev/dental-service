# CLI-382 Doc Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two stale claims in `apps/desktop/src/main.ts`'s top doc-comment (lines 23-38) that say the `/activate` web page "isn't built yet" and that preload's real-BrowserWindow load behavior is "not yet verified" — both are false as of commits `7670124` (2026-07-03, added `apps/web/src/features/auth/pages/activate.page.tsx` + registered it in `auth.routes.tsx:24`) and `165ddc5` (2026-07-03, fixed a real-BrowserWindow CSP + preload ESM/CJS blank-screen bug, switching preload to `.cts`/`.cjs`). Also fix the one corresponding stale mention in `CLAUDE.md:6`'s follow-up list. See spec: `docs/superpowers/specs/2026-07-04-cli-382-doc-hygiene-design.md`.

**Architecture:** No architectural change. Pure documentation/comment text fix — zero runtime code touched, zero tests needed.

**Tech Stack:** Markdown/TypeScript comments only.

## Global Constraints
- Do NOT touch any code outside comment text in `main.ts` (no logic, no imports, no other lines).
- Do NOT touch `main.ts` lines 36-37 (`/settings` → `setServerUrl` not yet called) — verified still true (`grep -rn "setServerUrl" apps/web/src/` → 0 hits) and out of ticket scope.
- Do NOT touch `main.ts:64` (the `.cjs`/`preload.cts` comment there is already correct/up to date).
- `main.ts:19` (`` `preload.ts` → `settings-ipc.ts` `` mention) is ALSO stale — the real file is `preload.cts` — but it is outside the DoD's 23-38 range. Leave it untouched; do not expand this plan's scope to cover it (noted as a possible small follow-up in the spec, §5).
- Do NOT touch any CLAUDE.md content other than the one identified stale clause in the 2026-07-02 "ENG SO'NGGI" paragraph (line 6) — CLAUDE.md is an append-only narrative log; do not delete surrounding history, only correct the inaccurate clause in place.
- No git commit unless explicitly instructed by whoever executes this plan (per repo convention: only commit when asked). The commands below are provided for the execution step but should be run by the implementer, not assumed to already have happened.

---

### Task 1: Update `apps/desktop/src/main.ts` stale comment block

**Files:**
- Modify: `apps/desktop/src/main.ts:23-38`

- [ ] **Step 1: Replace the doc-comment block**

  Before editing, `Read` the live file again and confirm the block below still matches exactly (whitespace, punctuation, em-dashes) — the Edit tool requires this anyway, but re-confirm nothing shifted since this plan was written.

  **Before** (current lines 23-38, verified via `Read` on 2026-07-04):
  ```
   * Server — litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q,
   * `license-status.ts` — existence-only, muddat tekshiruvi API tomonida)
   * brauzer asosiy UI o'rniga `/activate`ga ochiladi (CLI-348 qaror 1; web
   * `/activate` sahifasining o'zi hali qurilmagan — follow-up, apps/web
   * doirasi tashqarisida).
   *
   * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
   *   - `assets/tray-icon.png` — hali repo'da yo'q, distribution paketlashda
   *     qo'shiladi.
   *   - `preload.ts` ESM (`"type": "module"`) sifatida kompilyatsiya qilinadi —
   *     `sandbox`/Electron versiyasiga bog'liq yuklash xatti-harakati real
   *     BrowserWindow'da hali tekshirilmagan (web `/settings` bu ko'prikni
   *     hali chaqirmagani sabab hozircha bloklovchi emas).
   *   - Web `/settings` sahifasi `window.dentalDesktop?.setServerUrl(url)`ni
   *     hali chaqirmaydi (apps/web o'zgarishi shu ticket doirasi tashqarisida).
   */
  ```

  **After:**
  ```
   * Server — litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q,
   * `license-status.ts` — existence-only, muddat tekshiruvi API tomonida)
   * brauzer asosiy UI o'rniga `/activate`ga ochiladi (CLI-348 qaror 1; web
   * `/activate` sahifasi qurilgan va `auth.routes.tsx`da ro'yxatdan o'tgan —
   * `apps/web/src/features/auth/pages/activate.page.tsx` (commit 7670124,
   * "feat: end-to-end desktop license activation flow")).
   *
   * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
   *   - `assets/tray-icon.png` — hali repo'da yo'q, distribution paketlashda
   *     qo'shiladi.
   *   - `preload.cjs` (`.cts`dan kompilyatsiya, CommonJS, `sandbox:true` talabi —
   *     ESM emas) real BrowserWindow'da tekshirilgan: shu yerda topilgan
   *     CSP + preload ESM/CJS blank-screen xatosi tuzatilgan (commit 165ddc5,
   *     "fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)").
   *   - Web `/settings` sahifasi `window.dentalDesktop?.setServerUrl(url)`ni
   *     hali chaqirmaydi (apps/web o'zgarishi shu ticket doirasi tashqarisida).
   */
  ```

  Note: only the `/activate` sentence (old lines 25-27) and the `preload.ts`/ESM sentence (old lines 32-35) change. The `⚠️ TASHQI BOG'LIQLIK` heading, the `tray-icon.png` bullet, and the final `/settings` bullet are copied through unchanged.

- [ ] **Step 2: Verify the edit**
  Run: `grep -n "qurilmagan\|hali tekshirilmagan" apps/desktop/src/main.ts`
  Expected: no output (both stale phrases removed from this file).
  Run: `sed -n '1,45p' apps/desktop/src/main.ts` and visually confirm the block reads consistently with line 64's existing `.cjs`/`preload.cts` comment (no more ESM/CJS contradiction between the top doc-comment and line 64).

- [ ] **Step 3: Commit**
  ```bash
  git add apps/desktop/src/main.ts
  git commit -m "docs(desktop): fix stale comment claiming /activate page and preload aren't verified"
  ```

---

### Task 2: Update CLAUDE.md stale `/activate` follow-up mention

**Files:**
- Modify: `CLAUDE.md:6` (the single 2026-07-02 "ENG SO'NGGI" paragraph)

**Context:** `grep -n "activate\|preload\|sandbox\|qurilmagan\|tekshirilmagan\|faollashtirish flow" CLAUDE.md` turns up exactly one stale clause, inside the "Ma'lum follow-up'lar (yangi ticket kerak)" sentence of line 6. `grep -n "ESM\|CJS\|blank screen\|CSP\|preload" CLAUDE.md` returns zero hits, so there is no separate preload/sandbox claim in CLAUDE.md to fix — only the `/activate` clause. No entry newer than 2026-07-02 exists in CLAUDE.md that already supersedes this (confirmed: no `2026-07-0[3-9]` or `2026-07-1x` dates anywhere in the file), so this is genuinely stale and must be corrected now, not skipped as already-superseded.

- [ ] **Step 1: Replace the stale clause**

  Before editing, `Read` CLAUDE.md's live line 6 again and confirm the substring below still matches exactly and is unique in the file (it is one giant paragraph — the Edit tool's exact-match requirement makes this safe, but double-check apostrophe/em-dash characters didn't shift).

  **Before** (exact substring, inside line 6):
  ```
  **Ma'lum follow-up'lar (yangi ticket kerak):** `/activate` sahifasi `apps/web`da yo'q + activation flow ulanmagan, `requireModule` `app.ts`ga mount qilinmagan, `/settings` yangi IPC bridge'ni chaqirmaydi, `uploads.ts` mount qilinmagan, `MINIO_*` env eskirgan.
  ```

  **After:**
  ```
  **Ma'lum follow-up'lar (yangi ticket kerak):** `requireModule` `app.ts`ga mount qilinmagan, `/settings` yangi IPC bridge'ni chaqirmaydi, `uploads.ts` mount qilinmagan, `MINIO_*` env eskirgan. (✅ `/activate` sahifasi + preload real-BrowserWindow tekshiruvi keyingi commit'larda hal qilindi: `7670124` "feat: end-to-end desktop license activation flow" va `165ddc5` "fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)", ikkalasi 2026-07-03 — CLI-382 doc-hygiene tomonidan tasdiqlangan.)
  ```

  This removes the now-false "`/activate` sahifasi `apps/web`da yo'q + activation flow ulanmagan" clause from the open-follow-up list (it is objectively false — the file, route registration, and resolving commit all exist), keeps the three still-genuinely-open follow-ups (`requireModule` mount, `/settings` IPC wiring, `uploads.ts` mount, `MINIO_*` env) untouched, and appends a short parenthetical resolution note with commit references — consistent with CLAUDE.md's append-only narrative-log convention (history isn't deleted, an inaccurate claim is corrected in place with a citation).

- [ ] **Step 2: Verify the edit**
  Run: `grep -n "apps/web.da yo.q + activation flow ulanmagan" CLAUDE.md`
  Expected: no output.
  Run: `grep -c "requireModule.*app.ts.ga mount qilinmagan" CLAUDE.md`
  Expected: `1` (the still-open follow-up items remain present, unchanged).

- [ ] **Step 3: Commit**
  ```bash
  git add CLAUDE.md
  git commit -m "docs: correct stale /activate follow-up note in CLAUDE.md (CLI-348 resolved by 7670124/165ddc5)"
  ```

---

## Self-review

- Both replacement blocks are the actual verified current text (read via the `Read` tool on 2026-07-04) and the actual proposed new text — no placeholders, no "TODO: fill in exact lines."
- Verified independently (not just trusting the ticket description) that `apps/web/src/features/auth/pages/activate.page.tsx` exists and is registered at `auth.routes.tsx:24`, and that `apps/desktop/src/preload.cts` exists (not `.ts`) — via direct `ls`/`grep`, not inference from the ticket text.
- Checked CLAUDE.md was not already fixed by a later entry: confirmed line 6 (2026-07-02) is still the most recent "ENG SO'NGGI" entry and no `2026-07-03`/`2026-07-04`-dated entry exists anywhere in the file — so Task 2 is real work, not a no-op.
- Deliberately left `main.ts:36-37` (`/settings` → `setServerUrl` not called) and the corresponding CLAUDE.md follow-up items (`requireModule` mount, `/settings` IPC, `uploads.ts` mount, `MINIO_*` env) untouched — verified via `grep -rn "setServerUrl" apps/web/src/` (0 hits) that these are still accurate and out of this ticket's scope; only the two claims the ticket names are touched.
- Noted (but did not act on, per plan scope) a small date discrepancy: the ticket text says commit `165ddc5` is dated 2026-07-04, but `git log` shows 2026-07-03 04:33:05 +0500. This doesn't change which text is stale or what the fix should say; the plan's commit-message citations avoid asserting a specific date to sidestep the discrepancy where it matters (main.ts), and cites both dates loosely as "2026-07-03" per `git log`'s authoritative record in CLAUDE.md's note.
- This is a two-file, comment/doc-only change — no tests exist or are needed; verification is via `grep`/visual read, not a test runner.
- Trimmed the `main.ts` "after" text to claim only what was independently verified this session (file exists + registered in `auth.routes.tsx:24`) rather than asserting "end-to-end verified," which would rest on the commit message alone rather than a runtime check — avoids reintroducing an unverifiable claim in a ticket about removing unverifiable claims.
- Flagged (Global Constraints + spec §5) that `main.ts:19`'s `preload.ts` filename mention is also stale (real file is `.cts`) but is outside the DoD's 23-38 range — left as a conscious, documented decision rather than a silent leftover, so the next auditor doesn't have to rediscover it.
