# CLI-365 — Litsenziyani bekor qilish (revoke/deactivate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Supervisor operator a way to revoke a clinic's license (set `isActive: false`, record a `'deactivated'` `licenseEvents` row), expose it as a confirm-gated "Bekor qilish" button in Supervisor Admin, and close the loop so the existing "Reactivate" button can actually undo a deactivation.

**Architecture:** `apps/supervisor-api` factory-function Hono routes (`clinics.routes.ts` gets the new endpoint, mounted at `/v1/admin/clinics`, already behind `adminJwtMiddleware`). `apps/supervisor-admin` feature-folder React (`src/features/clinics/ClinicDetailPage.tsx`), TanStack Query mutation, Mantine v7 components, no new dependency (`window.confirm`, matching the existing `window.prompt` pattern used by Reactivate).

**Tech Stack:** Bun, Hono, Drizzle, apps/supervisor-api, apps/supervisor-admin, React, Mantine v7

## Global Constraints

- The `activate`/`heartbeat` `isActive` guard in `apps/supervisor-api/src/modules/licenses/licenses.service.ts` (lines 24-47, 49-66) **already rejects inactive licenses with 403** — confirmed by reading the code. No new enforcement code is written for this; Task 1 only adds a regression test proving it still holds once deactivation exists.
- Deactivate (Task 1) and the `reactivate()` fix (Task 2) must land together — shipping deactivate without fixing `reactivate()` creates a one-way dead end (a deactivated license can never be reactivated through the existing Admin button, since `reactivate()` currently never touches `isActive`).
- No new npm/bun dependency (no `@mantine/modals`) — reuse the existing `window.confirm`/`window.prompt` convention already used by the Reactivate button.
- Response shape of the new endpoint is `{ clinic, license }`, matching the existing `GET /v1/admin/clinics/:id` shape exactly (same `ClinicDetail` type in `apps/supervisor-admin/src/features/clinics/clinics.types.ts` — no new type needed).

---

### Task 1: Backend deactivate endpoint

**Files:**
- Modify: `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` (add import of `licenseEvents` at line 7, add new route after the `GET /:id` handler, i.e. after line 132)
- Test: `apps/supervisor-api/src/modules/clinics/clinics.test.ts` (add new `describe` block; add `db`, `eq`, `licenseEvents` imports at top — currently this file only imports `describe`, `expect`, `it`, `createApp`, `signAdminTestToken`)

**Interfaces:**
- Consumes: `PATCH /v1/admin/clinics/:id/deactivate` (no request body), `adminJwtMiddleware` (already applied via `app.use('*', adminJwtMiddleware)` at line 65 — no extra wiring).
- Produces: `200 { clinic: Clinic, license: License }` (license.isActive === false) · `401` (no/invalid admin JWT — via existing middleware) · `404 { error: { code: 'NOT_FOUND' } }` (bad UUID, unknown clinic, or clinic with no license row).

- [ ] **Step 1: Write the failing test**

  Add to `apps/supervisor-api/src/modules/clinics/clinics.test.ts` (add `import { eq } from 'drizzle-orm';`, `import { db } from '../../db/client';`, `import { licenseEvents } from '../../db/schema';` at the top alongside the existing imports):

  ```ts
  describe('PATCH /v1/admin/clinics/:id/deactivate', () => {
    it('requires admin JWT', async () => {
      const created = await createClinic();
      const body = (await created.json()) as any;
      const res = await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
        method: 'PATCH',
      });
      expect(res.status).toBe(401);
    });

    it('sets license.isActive=false and records a deactivated licenseEvent', async () => {
      const created = await createClinic();
      const body = (await created.json()) as any;

      const res = await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
        method: 'PATCH',
        headers: await authHeaders(),
      });
      expect(res.status).toBe(200);
      const updated = (await res.json()) as any;
      expect(updated.license.isActive).toBe(false);
      expect(updated.clinic.id).toBe(body.clinic.id);

      const events = await db.query.licenseEvents.findMany({
        where: eq(licenseEvents.licenseId, body.license.id),
      });
      expect(events.some((e) => e.event === 'deactivated')).toBe(true);
    });

    it('rejects a subsequent /v1/activate call with 403 after deactivation (regression: existing isActive guard)', async () => {
      const created = await createClinic();
      const body = (await created.json()) as any;

      await app.request(`/v1/admin/clinics/${body.clinic.id}/deactivate`, {
        method: 'PATCH',
        headers: await authHeaders(),
      });

      const activateRes = await app.request('/v1/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: body.license.licenseKey, fingerprint: 'fp-x' }),
      });
      expect(activateRes.status).toBe(403);
    });

    it('returns 404 for an unknown clinic id', async () => {
      const res = await app.request(`/v1/admin/clinics/${crypto.randomUUID()}/deactivate`, {
        method: 'PATCH',
        headers: await authHeaders(),
      });
      expect(res.status).toBe(404);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `bun --filter @dental/supervisor-api test clinics.test.ts` (or `cd apps/supervisor-api && bun run test -- clinics.test.ts`) — expect failures: route doesn't exist yet, so requests 404/405 rather than the expected statuses (the 401 case may even fail differently since the path itself doesn't match any handler).

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-api/src/modules/clinics/clinics.routes.ts`, change the import line:
  ```ts
  import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
  ```

  Add after the `GET /:id` handler (after line 132, before `return app;`):
  ```ts
  // Litsenziyani bekor qilish (revoke) — vendor operatori to'lamayotgan/shartnoma
  // tugagan klinikani deaktivatsiya qiladi. isActive:false keyingi
  // activate/heartbeat'ni licenses.service.ts'dagi mavjud guard orqali 403
  // bilan rad etadi (bu yerda qo'shimcha tekshiruv shart emas).
  app.patch('/:id/deactivate', async (c) => {
    const idResult = uuidSchema.safeParse(c.req.param('id'));
    if (!idResult.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, idResult.data) });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const license = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) });
    if (!license) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    await db.update(licenses).set({ isActive: false }).where(eq(licenses.id, license.id));
    await db.insert(licenseEvents).values({
      licenseId: license.id,
      event: 'deactivated',
    });

    const updatedLicense = await db.query.licenses.findFirst({
      where: eq(licenses.id, license.id),
    });
    return c.json({ clinic, license: updatedLicense });
  });
  ```

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — all 4 new cases green, and re-run the full `clinics.test.ts` + `licenses.test.ts` suites to confirm no existing test broke.

- [ ] **Step 5: Commit**
  `git add apps/supervisor-api/src/modules/clinics/clinics.routes.ts apps/supervisor-api/src/modules/clinics/clinics.test.ts` — message: `feat(supervisor-api): add PATCH /v1/admin/clinics/:id/deactivate (CLI-365)`

---

### Task 2: Fix `reactivate()` to re-enable `isActive`

**Files:**
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.service.ts:73-76` (the `reactivate()` method's `db.update(licenses).set({...})` call)
- Test: `apps/supervisor-api/src/modules/licenses/licenses.test.ts` (add a case to the existing `describe('POST /v1/reactivate', ...)` block, lines 91-112)

**Interfaces:**
- Consumes: existing `POST /v1/reactivate` (`{ licenseKey, fingerprint }`, admin JWT) — no request/response shape change.
- Produces: same response shape as today (`buildResponse(...)`), but the underlying DB row now also has `isActive: true` after the call.

> **Why this task exists even though it's not literally in the ticket text:** confirmed by reading `licenses.service.ts` — today `reactivate()` only updates `fingerprint`/`lastHeartbeatAt`, never `isActive`. Right now that's harmless because nothing ever sets `isActive: false`. Once Task 1 ships, a deactivated license would be stuck forever — the only "undo" button in the admin UI wouldn't undo the thing this ticket just made possible. This is a one-line fix required for CLI-365's feature to be usable, not scope creep.

- [ ] **Step 1: Write the failing test**

  Add to the `describe('POST /v1/reactivate', ...)` block in `apps/supervisor-api/src/modules/licenses/licenses.test.ts`:
  ```ts
  it('re-enables isActive on a deactivated license', async () => {
    await db.update(licenses).set({ isActive: false }).where(eq(licenses.licenseKey, licenseKey));

    const token = await signAdminTestToken();
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    });
    expect(res.status).toBe(200);

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
    expect(lic?.isActive).toBe(true);
  });
  ```
  (No new imports needed — `db`, `eq`, `licenses` are already imported in this file.)

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/supervisor-api && bun run test -- licenses.test.ts` — new case fails: `lic?.isActive` is `false` because `reactivate()` never touched it.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-api/src/modules/licenses/licenses.service.ts`, change the `reactivate()` update call (lines 73-76):
  ```ts
  await db
    .update(licenses)
    .set({ fingerprint: newFingerprint, lastHeartbeatAt: new Date(), isActive: true })
    .where(eq(licenses.id, lic.id));
  ```

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — new case green, full `licenses.test.ts` suite still green (existing 5 cases untouched).

- [ ] **Step 5: Commit**
  `git add apps/supervisor-api/src/modules/licenses/licenses.service.ts apps/supervisor-api/src/modules/licenses/licenses.test.ts` — message: `fix(supervisor-api): reactivate() re-enables isActive (CLI-365)`

---

### Task 3: Supervisor Admin "Bekor qilish" (deactivate) button

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` (add a `deactivate` mutation alongside the existing `reactivate` one at line 55, add status text + button in the JSX at lines 106-110)
- Test: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` (extend the existing `describe('ClinicDetailPage', ...)` block; extend `license` fixture usage for the inactive case)

**Interfaces:**
- Consumes: `PATCH /v1/admin/clinics/${data.clinic.id}/deactivate` via `authFetch` (same helper already used by `updateModules`/`reactivate`).
- Produces: on success, invalidates `['clinic', id]` query (same pattern as `updateModules`'s `onSuccess`); on failure, sets `mutationError` (same pattern as both existing mutations).

- [ ] **Step 1: Write the failing test**

  Add to `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx`:
  ```tsx
  it("holatni ko'rsatadi va 'Bekor qilish' bosilganda tasdiqlansa PATCH deactivate chaqiriladi", async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/v1/admin/clinics/c1/deactivate')) {
        return jsonResponse({ clinic, license: { ...license, isActive: false } });
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    expect(screen.getByText(/Holat:/)).toHaveTextContent('Faol');

    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/clinics/c1/deactivate'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it("tasdiqlash bekor qilinsa (confirm=false) deactivate so'rovi yuborilmaydi", async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    renderDetail();
    await screen.findByText('Clinic One');

    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
    ).toBe(false);
  });

  it("deactivate so'rovi muvaffaqiyatsiz bo'lsa xato xabarini ko'rsatadi", async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'PATCH' && url.endsWith('/v1/admin/clinics/c1/deactivate')) {
        return jsonResponse({ error: { code: 'SERVER_ERROR' } }, false);
      }
      if (url.endsWith('/v1/admin/clinics/c1')) {
        return jsonResponse({ clinic, license });
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderDetail();
    await screen.findByText('Clinic One');
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));

    expect(await screen.findByText("Litsenziyani bekor qilib bo'lmadi")).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  `cd apps/supervisor-admin && bun run test -- ClinicDetailPage.test.tsx` (runs `vitest run`) — fails: no "Bekor qilish" button / no "Holat:" text exist yet.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`, add after the existing `reactivate` mutation (after line 72, before `if (isError) ...`):
  ```tsx
  const deactivate = useMutation({
    mutationFn: async () => {
      if (!data?.clinic) return;
      const ok = confirm(
        "Litsenziyani bekor qilishni tasdiqlaysizmi? Klinika xizmatdan foydalana olmay qoladi.",
      );
      if (!ok) return;
      const res = await authFetch(`/v1/admin/clinics/${data.clinic.id}/deactivate`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error("Litsenziyani bekor qilib bo'lmadi");
    },
    onSuccess: () => {
      setMutationError(null);
      qc.invalidateQueries({ queryKey: ['clinic', id] });
    },
    onError: (err) => {
      setMutationError(
        err instanceof Error ? err.message : "Litsenziyani bekor qilib bo'lmadi",
      );
    },
  });
  ```

  Replace the `<Group mt="sm">...</Group>` block (lines 106-110) with:
  ```tsx
  <Text c={data.license?.isActive ? 'teal' : 'red'} mt="xs">
    Holat: {data.license?.isActive ? 'Faol' : 'Bekor qilingan'}
  </Text>
  <Group mt="sm">
    <Button size="xs" variant="outline" onClick={() => reactivate.mutate()}>
      Reactivate
    </Button>
    <Button size="xs" variant="outline" color="red" onClick={() => deactivate.mutate()}>
      Bekor qilish
    </Button>
  </Group>
  ```

- [ ] **Step 4: Run test to verify it passes**
  Same command as Step 2 — all new cases green, plus re-run the full file to confirm the 4 pre-existing tests (module display/switch/PATCH modules/error) are still green (they don't touch `confirm`/deactivate).

- [ ] **Step 5: Commit**
  `git add apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` — message: `feat(supervisor-admin): add license deactivate button (CLI-365)`

---

## Self-review

- **Placeholders:** none — every code block above is the literal diff to apply (exact import lines, exact route body, exact test bodies), derived from the files actually read (`clinics.routes.ts`, `clinics.test.ts`, `licenses.routes.ts`, `licenses.service.ts`, `licenses.test.ts`, `schema.ts`, `ClinicDetailPage.tsx`, `ClinicDetailPage.test.tsx`, `clinics.types.ts`, `lib/api.ts`).
- **Type consistency:** new endpoint returns `{ clinic, license }`, identical to the existing `GET /v1/admin/clinics/:id` handler already consumed by `ClinicDetail` in `clinics.types.ts` — no new/changed TS type needed on either side. `License.isActive: boolean` already exists in `clinics.types.ts`, so the UI status text and `Button color="red"` need no type changes.
- **Was Task 2 (enforce `isActive` on heartbeat/activate) needed, or did it already exist?** **It already existed** — confirmed by reading `licenses.service.ts`: both `activate()` (line 28: `if (!lic || !lic.isActive) throw ... status: 403`) and `heartbeat()` (line 53: same check) already reject inactive licenses with 403. Task 1 therefore adds **only a regression test** for this (the third test case in Task 1, Step 1), not new enforcement code. The task that turned out to be genuinely necessary and *not* pre-existing was a different one — **Task 2 in this plan is "fix `reactivate()` to restore `isActive: true`"**, which is a real gap: without it, Task 1's deactivate endpoint would make deactivation permanent and unrecoverable through the only "undo" affordance the admin UI has. This was flagged during research (spec §3) and folded into the plan as its own TDD task rather than silently bundled into Task 1, so it gets its own test/commit and is easy to review or reject independently.
- **Route mount sanity-check:** `PATCH /v1/admin/clinics/:id/deactivate` resolves correctly because `app.ts` mounts `clinicsRoutes()` at `/v1/admin/clinics` (line 16) and the new handler is registered as `/:id/deactivate` inside that router — matches the ticket's suggested path exactly.
- **Confirm dialog convention:** no new dependency added; `window.confirm` mirrors the existing `window.prompt` used by the Reactivate button one function above it in the same file — consistent, not a novel pattern introduced by this plan.
