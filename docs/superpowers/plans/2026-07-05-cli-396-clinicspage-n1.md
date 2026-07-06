# CLI-396 ClinicsPage N+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ClinicsPage.tsx` issues one `GET /v1/admin/clinics/:id` HTTP call per clinic row (`useQueries`, `ClinicsPage.tsx:21-26`) on top of the initial `GET /v1/admin/clinics` list call, just to show the license/plan/status columns. That's `1 + N` requests, growing linearly with clinic count. Add a `license` summary (`licenseKey`/`plan`/`isActive`/`expiresAt`) directly to the `GET /v1/admin/clinics` response (one extra `IN`-query server-side, following the existing `treatment-plans.repository.ts` N+1-fix pattern: parent list + one `inArray` child-query + in-memory `Map` grouping — not Drizzle `relations()`, which isn't used anywhere in this monorepo), then remove the frontend `useQueries` block entirely. Result: 1 request from the browser, 2 queries server-side, independent of clinic count.

**Architecture:** Two independent layers, no shared file — backend (`apps/supervisor-api`) and frontend (`apps/supervisor-admin`) each get one task. Backend: `clinics.routes.ts`'s `GET /` handler only (single-file module, no service/repository split in this app — see CLAUDE.md, Supervisor is a separate product from the RFC-0009 6-file convention). Frontend: `clinics.types.ts` (add a field to `Clinic`) + `ClinicsPage.tsx` (delete the `useQueries` block, read `clinic.license` directly) + `ClinicsPage.test.tsx` (fixtures gain an embedded `license`, detail-endpoint stubs removed, one new regression test proving no per-row fetch happens). `fetchClinicDetail`/`ClinicDetailPage.tsx`/`clinics.types.ts`'s `License`/`ClinicDetail` interfaces are untouched — they serve the separate `GET /:id` detail page, which keeps its own full-fidelity license object.

**Tech Stack:** Bun, Hono, Drizzle, React, TanStack Query

## Global Constraints

- Full design rationale (response shape, field-naming decision `isActive` not `status`, non-determinism note, scope exclusions): `docs/superpowers/specs/2026-07-05-cli-396-clinicspage-n1-design.md`. Read it before starting Task 1.
- Do NOT introduce Drizzle `relations()` / `with:` — this pattern is unused anywhere in the monorepo (`grep -rn "= relations("` returns nothing). Use the `inArray` + in-memory `Map` pattern already established in `apps/api/src/modules/clinical/treatment-plans/treatment-plans.repository.ts:15-60`.
- Do NOT touch `GET /:id`, `POST /`, or `PATCH /:id/deactivate` in `clinics.routes.ts` — only the `GET /` handler changes.
- Do NOT touch `fetchClinicDetail` (`clinics.api.ts`) or `ClinicDetailPage.tsx` — still used by the clinic detail route, unrelated to this ticket's N+1.
- Do NOT rename the `isActive` field to `status` — the existing `License`/`ClinicDetail` types and `ClinicDetailPage.tsx` already use `isActive: boolean`; keep the same name for the new list-response `license.isActive` to avoid two conventions living side by side (spec §3.2).
- Task 1 must land before Task 2 (frontend Task 2's test fixtures assume the new backend response shape already exists — though frontend tests mock `fetch` directly, so there's no hard *execution* dependency; land in this order anyway to keep the branch shippable at each commit).

---

### Task 1: Add license-summary fields to `GET /v1/admin/clinics`

**Files:**
- Modify: `apps/supervisor-api/src/modules/clinics/clinics.routes.ts:3` (import), `:68-71` (the `GET /` handler)
- Test: `apps/supervisor-api/src/modules/clinics/clinics.test.ts`

- [ ] **Step 1: Write the failing tests**

  In `apps/supervisor-api/src/modules/clinics/clinics.test.ts`, change the schema import (line 5) to also pull in the `clinics` table (needed for the orphan-clinic test below):

  ```ts
  import { clinics as clinicsTable, licenseEvents } from '../../db/schema';
  ```

  Then add two tests inside the existing `describe('GET /v1/admin/clinics', ...)` block (after the `'lists clinics including a freshly created one'` test, before its closing `});`):

  ```ts
  it('includes a license summary (licenseKey/plan/isActive/expiresAt) per clinic without a detail call', async () => {
    const createRes = await createClinic({ plan: 'premium' });
    const created = (await createRes.json()) as any;

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    const row = body.find((c) => c.id === created.clinic.id);
    expect(row).toBeTruthy();
    expect(row.license).toEqual({
      licenseKey: created.license.licenseKey,
      plan: 'premium',
      isActive: true,
      expiresAt: created.license.expiresAt,
    });
  });

  it('returns license: null for a clinic with no license row', async () => {
    const [orphan] = await db
      .insert(clinicsTable)
      .values({ name: `Orphan Clinic ${crypto.randomUUID()}` })
      .returning();
    if (!orphan) throw new Error('orphan clinic insert returned no row');

    const res = await app.request('/v1/admin/clinics', {
      headers: await authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    const row = body.find((c) => c.id === orphan.id);
    expect(row).toBeTruthy();
    expect(row.license).toBeNull();
  });
  ```

  These fail today because `GET /` currently returns `db.query.clinics.findMany()` verbatim — plain clinic rows with no `license` key at all, so `row.license` is `undefined`, not the expected object or `null`.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-api && bun run test src/modules/clinics/clinics.test.ts
  ```

  Expected: the two new tests fail (`row.license` is `undefined`). All pre-existing tests in the file still pass.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-api/src/modules/clinics/clinics.routes.ts`, change the import on line 3 from:

  ```ts
  import { eq } from 'drizzle-orm';
  ```

  to:

  ```ts
  import { eq, inArray } from 'drizzle-orm';
  ```

  Then replace the `GET /` handler (lines 68-71):

  ```ts
  // Klinikalar ro'yxati
  app.get('/', async (c) => {
    const rows = await db.query.clinics.findMany();
    return c.json(rows);
  });
  ```

  with:

  ```ts
  // Klinikalar ro'yxati + litsenziya summary (frontend ClinicsPage jadvali
  // litsenziya kaliti/tarif/holatni shu javobdan oladi — har-qator GET /:id
  // chaqiruvi (N+1) endi kerak emas, CLI-396). N+1 fixi treatment-plans
  // .repository.ts'dagi (apps/api) bir xil naqsh: parent-ro'yxat + bitta
  // IN-query + xotirada Map bo'yicha guruhlash.
  app.get('/', async (c) => {
    const rows = await db.query.clinics.findMany();
    if (rows.length === 0) return c.json([]);

    const licenseRows = await db
      .select({
        clinicId: licenses.clinicId,
        licenseKey: licenses.licenseKey,
        plan: licenses.plan,
        isActive: licenses.isActive,
        expiresAt: licenses.expiresAt,
      })
      .from(licenses)
      .where(
        inArray(
          licenses.clinicId,
          rows.map((r) => r.id),
        ),
      );

    // GET /:id (pastda) clinicId bo'yicha findFirst ishlatadi — orderBy yo'q,
    // birinchi topilgan qator. Bu yerda ham xuddi shu semantikani saqlaymiz.
    const licenseByClinic = new Map<string, (typeof licenseRows)[number]>();
    for (const l of licenseRows) {
      if (!licenseByClinic.has(l.clinicId)) licenseByClinic.set(l.clinicId, l);
    }

    const data = rows.map((clinic) => {
      const l = licenseByClinic.get(clinic.id);
      return {
        ...clinic,
        license: l
          ? { licenseKey: l.licenseKey, plan: l.plan, isActive: l.isActive, expiresAt: l.expiresAt }
          : null,
      };
    });

    return c.json(data);
  });
  ```

  Nothing else in the file (imports of `branches`/`clinics`/`licenseEvents`/`licenses`, the other three routes) changes.

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-api && bun run test src/modules/clinics/clinics.test.ts
  ```

  All tests in the file must pass (pre-existing + the 2 new ones). Then confirm no type regressions:

  ```bash
  cd apps/supervisor-api && bun run typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-api/src/modules/clinics/clinics.routes.ts \
    apps/supervisor-api/src/modules/clinics/clinics.test.ts
  git commit -m "$(cat <<'EOF'
  feat(supervisor-api): add license summary to GET /v1/admin/clinics

  Adds licenseKey/plan/isActive/expiresAt per clinic via one inArray
  query + in-memory grouping (same pattern as treatment-plans.repository
  .ts's N+1 fix), so the admin clinics list no longer needs a per-row
  detail lookup.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Remove N+1 from ClinicsPage frontend

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/clinics.types.ts:1-7` (the `Clinic` interface)
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx:1-89` (remove `useQueries`/`fetchClinicDetail`)
- Test: `apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

  In `apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx`, replace the fixtures and `beforeEach` (lines 8-59) with:

  ```tsx
  const clinicOne = {
    id: 'c1',
    name: 'Clinic One',
    contactEmail: 'one@test.com',
    contactPhone: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    license: {
      licenseKey: 'KEY-c1',
      plan: 'standard',
      isActive: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
  };
  const clinicTwo = {
    id: 'c2',
    name: 'Clinic Two',
    contactEmail: 'two@test.com',
    contactPhone: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    license: {
      licenseKey: 'KEY-c2',
      plan: 'standard',
      isActive: false,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
  };

  // ClinicDetail-shape license (full fidelity) — still used by the
  // '+ Yangi klinika' create flow, whose POST response is `{ clinic, license }`
  // (unaffected by this ticket — that's ClinicDetail, not the list summary).
  const licenseFor = (clinicId: string, overrides: Record<string, unknown> = {}) => ({
    id: `license-${clinicId}`,
    clinicId,
    branchId: `branch-${clinicId}`,
    licenseKey: `KEY-${clinicId}`,
    fingerprint: null,
    plan: 'standard',
    modules: ['patients'],
    gracePeriodDays: 30,
    expiresAt: '2027-01-01T00:00:00.000Z',
    isActive: true,
    lastHeartbeatAt: null,
    activatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body });

  describe('ClinicsPage', () => {
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/v1/admin/clinics')) {
          return jsonResponse([clinicOne, clinicTwo]);
        }
        throw new Error(`unhandled fetch: ${url}`);
      });
    });
  ```

  Update the second test (previously "har bir klinika uchun litsenziya faol/nofaol badge ko'rsatadi (detail-endpoint bilan boyitilgan)", lines 67-79) to drop the now-stale "detail-endpoint" comment/title, since the license now arrives on the first response:

  ```tsx
  it("har bir klinika uchun litsenziya kalit/tarif/holat ustunini ro'yxat javobidan (N+1siz) ko'rsatadi", async () => {
    renderApp(<ClinicsPage />);

    expect(await screen.findByText('KEY-c1')).toBeInTheDocument();
    expect(await screen.findByText('KEY-c2')).toBeInTheDocument();

    const badges = await screen.findAllByText(/Faol|Nofaol/);
    const labels = badges.map((b) => b.textContent);
    expect(labels).toContain('Faol');
    expect(labels).toContain('Nofaol');
  });
  ```

  Add a new regression test right after it — this is the one that actually proves the N+1 is gone (fails against today's code, which fires 2 extra detail requests):

  ```tsx
  it("N+1'siz — GET /v1/admin/clinics bitta marta chaqiriladi, per-klinika detail so'rovi yo'q", async () => {
    renderApp(<ClinicsPage />);
    await screen.findByText('Clinic One');
    await screen.findByText('KEY-c1');

    const calledUrls = fetchMock.mock.calls.map(([input]: [RequestInfo | URL]) => String(input));
    expect(calledUrls.filter((u) => u.endsWith('/v1/admin/clinics'))).toHaveLength(1);
    expect(calledUrls.some((u) => u.endsWith('/v1/admin/clinics/c1'))).toBe(false);
    expect(calledUrls.some((u) => u.endsWith('/v1/admin/clinics/c2'))).toBe(false);
  });
  ```

  Finally, update the last test (`"'+ Yangi klinika' bosilganda modal ochiladi..."`, lines 97-147) to drop the now-unused `/v1/admin/clinics/c1`/`/c2` detail stubs. **Keep the refetch returning only `[clinicOne, clinicTwo]`** (do not add `c3` to it) — the modal's success view (`created.license.licenseKey`, rendered via `<Code block>`) already displays `KEY-c3` from the `POST` response, and it never auto-closes (`handleClose` is manual). If the refetched list *also* contained a `c3` row with `licenseKey: 'KEY-c3'`, the table would render a second "KEY-c3" node and `findByText(/KEY-c3/)` (singular) would throw "multiple elements found" — the original test's `[clinicOne, clinicTwo]`-only refetch avoided this by design; preserve that:

  ```tsx
  it("'+ Yangi klinika' bosilganda modal ochiladi va yaratilgandan so'ng ro'yxat yangilanadi", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST' && url.endsWith('/v1/admin/clinics')) {
        const newClinic = {
          id: 'c3',
          name: 'New Clinic',
          contactEmail: null,
          contactPhone: null,
          createdAt: '2026-07-04T00:00:00.000Z',
        };
        return jsonResponse({
          clinic: newClinic,
          license: licenseFor('c3', { plan: 'standard' }),
        });
      }
      if (url.endsWith('/v1/admin/clinics')) {
        return jsonResponse([clinicOne, clinicTwo]);
      }
      throw new Error(`unhandled fetch: ${url} ${init?.method ?? 'GET'}`);
    });

    renderApp(<ClinicsPage />);
    await screen.findByText('Clinic One');

    const button = screen.getByRole('button', { name: '+ Yangi klinika' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Klinika nomi'), {
      target: { value: 'New Clinic' },
    });
    fireEvent.change(within(dialog).getByLabelText('Amal qilish muddati'), {
      target: { value: '2027-07-04' },
    });
    fireEvent.change(within(dialog).getByLabelText('Tarif'), { target: { value: 'standard' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yaratish' }));

    expect(await screen.findByText(/KEY-c3/)).toBeInTheDocument();
  });
  ```

  This test's only real changes from the original are (a) `clinicOne`/`clinicTwo` now carry an embedded `license` (from the fixture rewrite above) and (b) the `/v1/admin/clinics/c1`/`/c2` detail stubs are gone (dead code once `ClinicsPage` stops calling `fetchClinicDetail`) — the refetch body and the final assertion are unchanged from the pre-existing test, deliberately, to avoid the KEY-c3 double-match described above.

  The third test in the file (`"ro'yxat so'rovi muvaffaqiyatsiz bo'lsa..."`, lines 81-95) is unchanged — it only mocks the list endpoint returning an error, unaffected by this refactor.

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicsPage.test.tsx
  ```

  Expected: the new "N+1'siz" test fails — but note it likely fails via **timeout**, not via the `calledUrls` assertion: against today's component, `fetchClinicDetail('c1')`/`('c2')` still fire, hit the rewritten mock (which no longer stubs `/v1/admin/clinics/c1`/`/c2`), the mock's `throw new Error('unhandled fetch: ...')` rejects those detail queries, and `await screen.findByText('KEY-c1')` (which today only renders once the detail query resolves) times out before the `calledUrls` expectation ever runs. That's still a correct red — just via a different failure mode than a normal assertion mismatch. The updated license/create tests may also fail for the same reason (component still reads `detailQueries[index]?.data?.license`, not `clinic.license`) until Step 3 lands.

- [ ] **Step 3: Write minimal implementation**

  In `apps/supervisor-admin/src/features/clinics/clinics.types.ts`, change the `Clinic` interface (lines 1-7) from:

  ```ts
  export interface Clinic {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    createdAt: string;
  }
  ```

  to:

  ```ts
  export interface ClinicLicenseSummary {
    licenseKey: string;
    plan: string;
    isActive: boolean;
    expiresAt: string;
  }

  export interface Clinic {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    createdAt: string;
    license: ClinicLicenseSummary | null;
  }
  ```

  (Leave `License`/`ClinicDetail`/`CreateClinicInput` below it untouched.)

  In `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx`, change the import (line 3) from:

  ```tsx
  import { useQueries, useQuery } from '@tanstack/react-query';
  ```

  to:

  ```tsx
  import { useQuery } from '@tanstack/react-query';
  ```

  and (line 5) from:

  ```tsx
  import { fetchClinicDetail, fetchClinics } from './clinics.api';
  ```

  to:

  ```tsx
  import { fetchClinics } from './clinics.api';
  ```

  Delete the `detailQueries` block (lines 18-26):

  ```tsx
  // GET /v1/admin/clinics ro'yxatida litsenziya kiritilmagan (bare clinic
  // row'lar) — jadvalda litsenziya/tarif/holat ko'rsatish uchun har bir
  // klinika uchun detail endpoint'ni alohida so'raymiz.
  const detailQueries = useQueries({
    queries: clinics.map((clinic) => ({
      queryKey: ['clinic', clinic.id],
      queryFn: () => fetchClinicDetail(clinic.id),
    })),
  });
  ```

  entirely (nothing replaces it — `clinics` from the existing `useQuery` now already carries `license`).

  In the table body, change (lines 59-60) from:

  ```tsx
  {clinics.map((clinic, index) => {
    const license = detailQueries[index]?.data?.license;
  ```

  to:

  ```tsx
  {clinics.map((clinic) => {
    const license = clinic.license;
  ```

  Nothing else in the file (JSX structure, `CreateClinicModal`, imports of `Badge`/`Button`/`Group`/`Table`/`Text`/`Title`/`useDisclosure`/`Link`) changes.

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/supervisor-admin && bunx vitest run src/features/clinics/ClinicsPage.test.tsx
  ```

  All tests in the file must pass (4 pre-existing, refactored to the new fixture shape, + the 1 new N+1 regression test). Then confirm no type regressions across the app (the `Clinic` type change could affect other consumers):

  ```bash
  cd apps/supervisor-admin && bun run typecheck
  ```

  If `ClinicDetailPage.tsx` or any other file references `Clinic` (not `ClinicDetail`) and destructures it without a `license` field, typecheck will still pass (adding a required field to an object literal callers construct would break, but `Clinic` is a read-only API-response type, not something components construct — only `clinics.api.ts`'s `fetchClinics` return type changes, which is consumed structurally).

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/features/clinics/clinics.types.ts \
    apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx \
    apps/supervisor-admin/src/features/clinics/ClinicsPage.test.tsx
  git commit -m "$(cat <<'EOF'
  fix(supervisor-admin): remove ClinicsPage N+1 detail-per-row fetch

  GET /v1/admin/clinics now returns a license summary per clinic (see
  the paired supervisor-api commit), so the useQueries block firing one
  fetchClinicDetail per row is no longer needed. The table now reads
  clinic.license directly.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — every snippet (current code, new code, tests) is transcribed from files actually read in full (`clinics.routes.ts`, `clinics.test.ts`, `ClinicsPage.tsx`, `clinics.api.ts`, `clinics.types.ts`, `ClinicsPage.test.tsx`, `clinics.api.test.ts`, `CreateClinicModal.tsx`, `apps/supervisor-api/src/db/schema.ts`, `apps/api/.../treatment-plans.repository.ts`) plus the paired design spec.
- **Prior-art verified, not assumed:** confirmed via `grep -rn "= relations("` across the monorepo that Drizzle `relations()`/`with:` is unused anywhere, so the plan explicitly rules it out and points to the one existing N+1 fix (`treatment-plans.repository.ts`) as the pattern to mirror — same `inArray` + `Map` shape reused here.
- **Cardinality caveat carried through, not hidden:** `licenses.clinicId` is a non-unique FK (schema has no unique constraint), and `GET /:id`'s own `findFirst` has no `orderBy` — already non-deterministic if a clinic ever had >1 license. The new list-endpoint code deliberately preserves this exact "first found wins" semantic (documented in both the spec §3.1/§2 and the code comment) rather than silently fixing or silently making worse; genuinely fixing it (e.g., latest-by-`createdAt`) is out of scope for this Low-priority N+1 ticket and would need its own ticket if the invariant "one license per clinic" is ever broken by a future feature.
- **DoD field-naming decision made explicit, not glossed over:** the ticket text says "plan/status/expiresAt" but the plan uses `isActive` (matching the codebase's existing convention in `License`/`ClinicDetailPage.tsx`) and adds `licenseKey` (not mentioned in the ticket text but required — the "Litsenziya" column displays it, so omitting it would silently break that column). Both deviations from the literal DoD wording are called out in the spec (§3.2) so a reviewer can push back if they disagree.
- **Frontend test rewrite is the actual regression test, not incidental cleanup:** the new "N+1'siz" test asserts on `fetchMock.mock.calls` directly (not on rendered output), which is the only way to prove the *number* of HTTP calls dropped — matching this file's existing fetch-mock-based testing style (no internal React Query spying), consistent with how `ClinicDetailPage.test.tsx`'s cache-invalidation test (CLI-394) also asserts against call counts rather than internals.
- **Ordering justified, not just asserted:** Task 1 before Task 2 isn't a hard execution dependency (frontend tests mock `fetch` directly, independent of the real backend), but it's called out in Global Constraints so a partial-branch state never ships with the frontend already assuming a response shape the backend doesn't yet produce.
- **Scope minimal:** exactly the two files named in the ticket description (`clinics.routes.ts` list handler, `ClinicsPage.tsx`) plus their direct type dependency (`clinics.types.ts`) and test files — no touching of `GET /:id`, `POST /`, `PATCH /:id/deactivate`, `ClinicDetailPage.tsx`, or `fetchClinicDetail`, matching the ticket's Low priority and narrow DoD.
