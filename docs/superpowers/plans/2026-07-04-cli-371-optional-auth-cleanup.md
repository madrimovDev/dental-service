# CLI-371 Optional Auth Middleware Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `optionalAuthMiddleware` export from `apps/api/src/middleware/auth.ts` — it has zero call sites anywhere in the monorepo and its documented intended use ("registratsiya sahifasida user preview") was never wired up (see spec: `docs/superpowers/specs/2026-07-04-cli-371-optional-auth-cleanup-design.md`).

**Architecture:** No architectural change. This is a pure deletion of an unused, self-contained middleware factory function. `authMiddleware` (the actively-used sibling in the same file) and the `declare module 'hono'` `ContextVariableMap` extension are untouched — both are still needed.

**Tech Stack:** Bun, Hono, `apps/api/src/middleware/auth.ts`

## Global Constraints
- Confirm zero call sites exist before removing (already verified in spec) — do not remove if any caller is found.
- Do not touch `authMiddleware` (lines 1-46) or the `declare module 'hono'` block (lines 5-9).

---

### Task 1: Remove `optionalAuthMiddleware` dead code

**Files:**
- Modify: `apps/api/src/middleware/auth.ts:47-69`
- Test: No existing test file references this export (`find /home/madrimov/Projects/dental-service -iname "auth.test.ts" -not -path "*/node_modules/*"` only finds the unrelated `apps/supervisor-api/src/modules/auth/auth.test.ts`). No test file needs updating.

- [ ] **Step 1: Re-confirm zero usages**
  Run: `grep -rn "optionalAuthMiddleware" /home/madrimov/Projects/dental-service --include="*.ts" --include="*.tsx" --include="*.md"`
  Expected: only one hit — the definition line in `apps/api/src/middleware/auth.ts` itself (line 52). If any other file references it, STOP and re-open the spec (wire-in path, not deletion).

- [ ] **Step 2: Remove the function and its JSDoc**
  Delete lines 47-69 of `apps/api/src/middleware/auth.ts` (the blank line separating it from `authMiddleware`, its JSDoc comment, and the function body):

  ```ts
  /**
   * Optional auth — token bor bo'lsa decode qiladi, lekin yo'q bo'lsa ham davom etadi.
   * Public endpoint'lar uchun (masalan, registratsiya sahifasi user'ni preview qilish uchun).
   */
  export const optionalAuthMiddleware = (): MiddlewareHandler => async (c, next) => {
    const header = c.req.header('Authorization');
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      if (token) {
        try {
          const claims = await verifyAccess(token);
          c.set('accessClaims', claims);
          c.set('user', { id: claims.sub });
          c.set('activeTenantId', claims.atid);
          c.set('activeBranchId', claims.abid);
        } catch {
          // Invalid token — silently skip (ext bo'lganda fail emas)
        }
      }
    }
    await next();
  };
  ```

  After deletion, the file should end with `authMiddleware`'s closing `};` (currently line 46) as the last line of content — no trailing dead code, no leftover double-blank-line at EOF.

- [ ] **Step 3: Run existing test suite for this file to confirm nothing breaks**
  Run: `bun test apps/api/src/middleware/auth.test.ts`
  Expected: this file does not exist, so the command will report "no test files found" / similar — that's fine (there was no coverage for this file before the change either). As a broader safety net, run the full API test suite instead: `bun --filter @dental/api test` (or the project's standard `turbo test --filter @dental/api` command). Expected: PASS, no new failures.

- [ ] **Step 4: Typecheck**
  Run the project's standard typecheck command for `apps/api` (per `CLAUDE.md` — e.g. `bun run typecheck` or `turbo typecheck --filter @dental/api`).
  Expected: no new errors (removing an unused export cannot introduce type errors; if any file unexpectedly imports the removed symbol, this step will surface it).

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/middleware/auth.ts
  git commit -m "chore(api): remove unused optionalAuthMiddleware dead code"
  ```

---

## Self-review

- Verified via repo-wide grep (not just `apps/api`) that `optionalAuthMiddleware` has no call sites in `apps/api`, `apps/web`, `docs/rfcs`, or `CLAUDE.md` — the only two hits in the whole tree are the function's own definition and its own JSDoc comment.
- Confirmed no test file exists for `apps/api/src/middleware/auth.ts`, so no test needs updating or deleting alongside the removal.
- Deletion is scoped tightly to lines 47-69; `authMiddleware` (the actively-used middleware) and the shared `ContextVariableMap` type augmentation are explicitly out of scope and left untouched.
- Plan includes a re-confirmation grep as Step 1 (belt-and-suspenders against staleness between spec-writing and execution) with an explicit STOP condition if a caller turns up — this keeps the task safe even if executed by a worker with no memory of the spec's investigation.
- No placeholder line numbers or TODOs — exact lines and exact deleted code block are given.
