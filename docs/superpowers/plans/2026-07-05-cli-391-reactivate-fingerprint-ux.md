# CLI-391 — Supervisor Admin reactivate fingerprint UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `ClinicDetailPage.tsx`'s "Reactivate" button from `prompt('Yangi fingerprint kiriting:')`-ing the supervisor admin for a value they structurally cannot know (the SHA-256 machine fingerprint, computed only on the clinic's own machine by `apps/api/src/lib/license.ts:32-43`'s `getFingerprint()`). The value is already stored server-side (`licenses.fingerprint` column, `apps/supervisor-api/src/db/schema.ts:31`) and already returned by the existing `GET /v1/admin/clinics/:id` endpoint (`apps/supervisor-api/src/modules/clinics/clinics.routes.ts:121-132` returns the full license row) — the frontend `License` type already declares `fingerprint: string | null` (`apps/supervisor-admin/src/features/clinics/clinics.types.ts:14`) but the page never reads it. Display it and wire the reactivate mutation to use it directly.

**Architecture:** Frontend-only change, single file (`ClinicDetailPage.tsx`) plus its test file. No backend change — investigation confirmed `fingerprint` is already plumbed end-to-end (DB column → GET response → frontend type); this is a display + wiring fix, not new data-flow. See spec `docs/superpowers/specs/2026-07-05-cli-391-reactivate-fingerprint-ux-design.md` for the full trace.

**Tech Stack:** React, Mantine v7, Bun, Hono (backend untouched — Vitest for this frontend test)

## Global Constraints

- **No backend changes.** `apps/supervisor-api` is not touched anywhere in this plan — `fingerprint` is already in the `GET /v1/admin/clinics/:id` response body.
- **No changes to `clinics.types.ts` or `clinics.api.ts`.** `License.fingerprint: string | null` already exists; `fetchClinicDetail` already returns the full body untouched.
- **`prompt()` must be completely removed** from the reactivate `mutationFn` — not just made conditional. The test asserts this by stubbing global `prompt` to throw if called.
- **Do not touch the `onSuccess` handler's body beyond what already exists (`setMutationError(null)`).** A sibling ticket, **CLI-394**, separately adds `qc.invalidateQueries({ queryKey: ['clinic', id] })` to this same `onSuccess`. **CLI-391 (this plan) must land first** — it rewrites the `mutationFn` body and touches surrounding JSX; CLI-394 only adds one line inside `onSuccess` afterward. Landing them in the opposite order risks the two changes clobbering each other in the same mutation block.
- **Reactivate button must be `disabled` when `data.license?.fingerprint` is falsy** (license never activated on any machine yet) — no silent no-op on click.
- Follow existing test conventions in `ClinicDetailPage.test.tsx`: `vi.stubGlobal('fetch', fetchMock)`, `renderApp(...)` from `../../test-utils`, `screen.findByText` / `fireEvent.click` / `vi.waitFor`.

---

### Task 1: Display stored fingerprint + use it directly in reactivate (remove `prompt()`)

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx`

**Interfaces:**
- Consumes: existing `License.fingerprint: string | null` (`clinics.types.ts:14`, unchanged), existing `GET /v1/admin/clinics/:id` response (unchanged, already includes `license.fingerprint`), existing `POST /v1/reactivate` endpoint (`apps/supervisor-api/src/modules/licenses/licenses.routes.ts`, unchanged — still expects `{ licenseKey, fingerprint }`).
- Produces: no new exports; internal component behavior change only.

- [ ] **Step 1: Write the failing tests**

  In `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx`, add a fixture variant with a non-null fingerprint and a new `describe`/tests block. Insert near the top (after the existing `license` const, around line 31):

  ```ts
  const licenseWithFingerprint = {
    ...license,
    fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  };
  ```

  Then add these tests inside the existing `describe('ClinicDetailPage', ...)` block, after the last existing test (after the `"deactivate so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi"` test, before the closing `});`):

  ```tsx
  it("litsenziyada saqlangan fingerprint ko'rsatiladi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(screen.getByText(/Fingerprint:/)).toHaveTextContent(licenseWithFingerprint.fingerprint);
  });

  it("fingerprint yo'q bo'lsa 'Reactivate' tugmasi disable bo'ladi va promptsiz hech qanday so'rov yubormaydi", async () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => {
        throw new Error('prompt should not be called');
      }),
    );
    renderDetail();
    await screen.findByText('Clinic One');

    const reactivateButton = screen.getByRole('button', { name: 'Reactivate' });
    expect(reactivateButton).toBeDisabled();

    fireEvent.click(reactivateButton);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it("'Reactivate' bosilganda saqlangan fingerprint bilan POST /v1/reactivate promptsiz chaqiriladi", async () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => {
        throw new Error('prompt should not be called');
      }),
    );
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/reactivate')) {
        return jsonResponse({ ok: true });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license: licenseWithFingerprint });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');

    const reactivateButton = screen.getByRole('button', { name: 'Reactivate' });
    expect(reactivateButton).not.toBeDisabled();
    fireEvent.click(reactivateButton);

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/reactivate'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const reactivateCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    ) as [string, RequestInit] | undefined;
    if (!reactivateCall) throw new Error('POST /v1/reactivate call not found');
    const body = JSON.parse(String(reactivateCall[1].body));
    expect(body).toEqual({
      licenseKey: licenseWithFingerprint.licenseKey,
      fingerprint: licenseWithFingerprint.fingerprint,
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicDetailPage.test.tsx
  ```

  Expected failures: the fingerprint-display test fails because no `Fingerprint:` text exists yet; the disabled-button test fails because the button has no `disabled` attribute; the POST-body test fails because current code calls `prompt(...)` first — which, with the throwing stub installed, throws synchronously inside `mutationFn`, so no matching `fetch` call is ever made (assertion on `fetchMock` calls fails / times out).

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`, replace the `reactivate` mutation (lines 55-72):

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

  Then in the JSX license `Paper` block, add a fingerprint line after the "Grace period" line (currently line 126) and add `disabled` to the Reactivate button (currently lines 130-133):

  ```tsx
  <Text c="dimmed">Grace period: {data.license?.gracePeriodDays} kun</Text>
  <Text c="dimmed">
    Fingerprint: {data.license?.fingerprint ?? '— (hali faollashtirilmagan)'}
  </Text>
  <Text c={data.license?.isActive ? 'teal' : 'red'} mt="xs">
    Holat: {data.license?.isActive ? 'Faol' : 'Bekor qilingan'}
  </Text>
  <Group mt="sm">
    <Button
      size="xs"
      variant="outline"
      onClick={() => reactivate.mutate()}
      disabled={!data.license?.fingerprint}
    >
      Reactivate
    </Button>
    <Button size="xs" variant="outline" color="red" onClick={() => deactivate.mutate()}>
      Bekor qilish
    </Button>
  </Group>
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicDetailPage.test.tsx
  ```

  All tests in the file (existing + 3 new) must pass. Also run the project's typecheck to confirm no type regressions:

  ```bash
  cd apps/supervisor-admin && bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx \
    apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx
  git commit -m "$(cat <<'EOF'
  fix(supervisor-admin): use stored fingerprint for reactivate instead of prompt()

  The reactivate button prompted the admin for a fingerprint value they
  cannot know (SHA-256 machine hash computed only on the clinic's own
  machine). The value was already returned by GET /v1/admin/clinics/:id
  (licenses.fingerprint column, already in the frontend License type) but
  never displayed or used — now shown in the license panel and passed
  directly to POST /v1/reactivate, no manual entry.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — the `mutationFn`, JSX block, and all three new tests are the literal code to apply, derived from the actual current file content (`ClinicDetailPage.tsx` read in full, 152 lines; `ClinicDetailPage.test.tsx` read in full, 193 lines).
- **No new backend plumbing invented:** confirmed by reading `apps/supervisor-api/src/db/schema.ts` (licenses.fingerprint column exists), `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` (`GET /:id` returns the full license row, unfiltered), and `apps/supervisor-admin/src/features/clinics/clinics.types.ts` (`License.fingerprint` already typed) — all three confirm the value is already flowing to the frontend today. This plan does not add an endpoint, column, or type field anywhere.
- **CLI-394 ordering risk called out, not solved:** Global Constraints and the spec both flag that CLI-394 touches the same `onSuccess` handler and must apply after this plan, without attempting CLI-394's cache-invalidation fix here.
- **Regression-proof test design:** the two new tests that exercise the reactivate button both stub global `prompt` to *throw* rather than merely spy-and-assert-not-called — this fails loudly (not silently) if a future edit reintroduces `prompt()` anywhere in the click path, including inside `mutationFn` before the `fetch` call.
- **Disabled-button UX explicitly tested:** the "fingerprint yo'q" test is not just a `mutationFn` guard-clause unit check — it asserts the rendered `<button>` element itself carries `disabled`, matching the spec's §2.3 UX requirement (no silent no-op on click).
- **Verification commands are real and runnable** in this repo (`bunx vitest run <file>`, matching the project's Vitest + Bun test convention per `CLAUDE.md` §"Tests"; `bun run typecheck` for the type-safety gate mentioned in the DoD).
