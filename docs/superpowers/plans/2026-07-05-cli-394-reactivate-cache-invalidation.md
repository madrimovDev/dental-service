# CLI-394 Reactivate Cache Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ClinicDetailPage.tsx`'s `reactivate` mutation's `onSuccess` handler currently only calls `setMutationError(null)` — unlike its sibling mutations `updateModules` and `deactivate`, which both also call `qc.invalidateQueries({ queryKey: ['clinic', id] })`. After a successful reactivate, the page keeps showing stale license state (e.g. "Bekor qilingan") until an unrelated refetch happens. Add the same invalidation call so reactivate refreshes the page's data like its siblings do.

**Architecture:** Frontend-only, single file (`ClinicDetailPage.tsx`) plus its test file. One line added inside an existing `onSuccess` callback — no new hooks, no new state, no backend change. `qc` (`useQueryClient()`) and `id` (`useParams<{ id: string }>()`) are already in scope in the component (used identically by `updateModules`/`deactivate`).

**Tech Stack:** React, TanStack Query

## Global Constraints

- This plan must be executed AFTER CLI-391 lands on the same file (docs/superpowers/plans/2026-07-05-cli-391-reactivate-fingerprint-ux.md) — same mutation's onSuccess handler.
- **Do not touch `mutationFn` or `onError` of the `reactivate` mutation, or any JSX** (fingerprint display, disabled button) — those belong to CLI-391 and must already be in place. This task changes only the `onSuccess` callback body.
- **Do not re-declare `licenseWithFingerprint`** in the test file — CLI-391's plan already introduces this fixture (a copy of `license` with a non-null `fingerprint`) in `ClinicDetailPage.test.tsx`. Reuse it; the reactivate button is disabled with the default `license` fixture (`fingerprint: null`), so any test that clicks "Reactivate" must use `licenseWithFingerprint`.
- Match the exact `onSuccess` shape already used by `deactivate` (current file, lines 86-89) and `updateModules` (current file, lines 46-49):
  ```tsx
  onSuccess: () => {
    setMutationError(null);
    qc.invalidateQueries({ queryKey: ['clinic', id] });
  },
  ```

---

### Task 1: Add cache invalidation to reactivate's onSuccess

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` — the `reactivate` mutation's `onSuccess` handler. After CLI-391 lands, the whole `reactivate` block reads (per CLI-391's plan, Task 1 Step 3):
  ```tsx
  const reactivate = useMutation({
    mutationFn: async () => {
      if (!data?.license?.fingerprint) return;
      const res = await authFetch('/v1/reactivate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: data.license.licenseKey,
          fingerprint: data.license.fingerprint,
        }),
      });
      if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
    },
    onSuccess: () => setMutationError(null),
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Litsenziyani qayta faollashtirib bo'lmadi",
      );
    },
  });
  ```
  The line to change is `onSuccess: () => setMutationError(null),` — locate it inside the `reactivate` `useMutation({...})` block (it immediately follows the `mutationFn`'s closing `},` and precedes `onError`). In the pre-CLI-391 file this line is at 66; CLI-391's rewrite of `mutationFn` adds one line to the block, so post-CLI-391 it lands at approximately line 67 — confirm by searching for `const reactivate = useMutation(` and reading the block, don't rely on the line number alone.
- Test: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` — add one test inside the existing `describe('ClinicDetailPage', ...)` block, after the last test CLI-391 added (`"'Reactivate' bosilganda saqlangan fingerprint bilan POST /v1/reactivate promptsiz chaqiriladi"`), before the closing `});`.

- [ ] **Step 1: Write the failing test**

  In `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx`, add (reusing the `licenseWithFingerprint` fixture that CLI-391 already introduced):

  ```tsx
  it("reactivate muvaffaqiyatli bo'lgandan keyin klinika ma'lumotlari qayta so'raladi (cache invalidatsiya)", async () => {
    let getCallCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/reactivate')) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        getCallCount += 1;
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(getCallCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/reactivate'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    await vi.waitFor(() => expect(getCallCount).toBe(2));
  });
  ```

  This asserts `GET /v1/admin/clinics/c1` is fetched a second time after the reactivate `POST` resolves — the observable effect of `qc.invalidateQueries({ queryKey: ['clinic', id] })` (TanStack Query refetches active queries matching the invalidated key). Without the invalidation call, `getCallCount` stays at `1` and the second `waitFor` times out.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicDetailPage.test.tsx
  ```

  Expected: the new test fails — `getCallCount` never reaches `2` (times out), because `reactivate`'s `onSuccess` currently only calls `setMutationError(null)`. All pre-existing tests (including CLI-391's 3 tests) still pass.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`, change the `reactivate` mutation's `onSuccess` from:

  ```tsx
    onSuccess: () => setMutationError(null),
  ```

  to:

  ```tsx
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
  ```

  Nothing else in the `reactivate` block, or anywhere else in the file, changes.

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicDetailPage.test.tsx
  ```

  All tests in the file must pass (pre-existing + CLI-391's 3 + this task's 1). Then confirm no type regressions:

  ```bash
  cd apps/supervisor-admin && bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx \
    apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx
  git commit -m "$(cat <<'EOF'
  fix(supervisor-admin): invalidate clinic query cache after reactivate

  reactivate's onSuccess only cleared the mutation error, unlike
  updateModules and deactivate which both invalidate ['clinic', id] —
  so the page kept showing stale license state after a successful
  reactivate. Add the same invalidateQueries call.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — the `onSuccess` before/after snippets and the new test are literal code, derived from the current file (`ClinicDetailPage.tsx` read in full) plus CLI-391's plan (read in full) for the post-CLI-391 shape of the surrounding mutation block.
- **Ordering dependency respected:** this plan does not restate or re-implement any part of CLI-391 (mutationFn rewrite, JSX fingerprint display, disabled button) — it only touches the one line CLI-391's own spec explicitly deferred to CLI-394 (§3 of the CLI-391 spec).
- **Line-number honesty:** the exact post-CLI-391 line number for `onSuccess` is given as an approximation (~67) with an explicit instruction to locate the block by its `const reactivate = useMutation(` anchor rather than trust the number blindly — line numbers shift by exactly one line depending on how CLI-391's rewrite is formatted, and this plan cannot execute CLI-391 to observe the real file.
- **No duplicate fixture:** the test reuses `licenseWithFingerprint`, which CLI-391's plan already adds to the same test file — this plan explicitly calls out not to redeclare it, avoiding a naming collision if both plans are executed by agents unaware of each other's edits.
- **Test observes the real effect, not the implementation:** rather than mocking `useQueryClient`/`invalidateQueries` directly, the test counts `GET /v1/admin/clinics/c1` calls — this exercises the actual TanStack Query refetch behavior the DoD cares about (UI reflects fresh server state after reactivate), consistent with this file's existing testing style (fetch-mock based, no internal spying).
- **Scope minimal:** one line added in source, one test added — matches the ticket's Low priority and one-line DoD.
