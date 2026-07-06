# CLI-392 — Supervisor Admin auth route-guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop unauthenticated direct navigation (e.g. typing `/clinics/abc` in the address bar) from rendering the full `AppLayout` shell in `apps/supervisor-admin`. Today `App.tsx:13-20` mounts `/` and `/clinics/:id` under `AppLayout` with zero check of `admin_token` — the only feedback an unauthenticated user gets is a generic "yuklab bo'lmadi" error text once `fetchClinics()` gets a 401 back, with no redirect to `/login`. Close both gaps: (1) render-time — a guard that redirects to `/login` before the shell renders when `admin_token` is missing from `localStorage`, and (2) runtime — a 401 response (stale/invalid token) also clears the token and redirects, instead of surfacing only an inline error.

**Architecture:** `apps/supervisor-admin`'s router is `<BrowserRouter><Routes>...` (plain JSX API, confirmed by reading `App.tsx` in full) — **not** `createBrowserRouter`/data-router, so React Router loaders are not available here at all (this matches `apps/web`'s own router, which is also plain `<Routes>` and guards via a wrapper component, `apps/web/src/components/auth/ProtectedRoute.tsx`, never a loader). The fix therefore mirrors that established project convention: a wrapper component (`RequireAuth`), simplified for supervisor-admin's single-token model (no Zustand auth store exists here, unlike `apps/web` — `admin_token` is read directly from `localStorage`, as `AppLayout.tsx`'s logout button and `LoginPage.tsx`'s login success handler already do). The 401 runtime case is closed in `apps/supervisor-admin/src/lib/api.ts`'s `authFetch`, the single choke point all tenant-fetch calls already go through (`clinics.api.ts` has three callers, all `await authFetch(...)`).

**Tech Stack:** React, React Router (plain `<Routes>`, no data router), Mantine v7, TanStack Query, Vitest + Testing Library.

## Global Constraints

- No route-loader mechanism is introduced or considered — confirmed by reading both `apps/supervisor-admin/src/App.tsx` and `apps/web/src/app/App.tsx` that this project's router setup (plain `<Routes>`) has no loader support; adding one would mean migrating to `createBrowserRouter`, which is out of this ticket's scope.
- No new global auth store (Zustand or otherwise) is added to supervisor-admin. It has exactly one auth primitive (`localStorage.getItem('admin_token')` / `setItem` / `removeItem`, already used in `LoginPage.tsx` and `AppLayout.tsx`) and no tenant/permission concept — introducing a store just for this guard would be scope creep beyond the ticket's DoD.
- `authFetch`'s signature stays `(path: string, init?: RequestInit) => Promise<Response>` — all three existing callers in `clinics.api.ts` (`fetchClinics`, `fetchClinicDetail`, `createClinic`) already `await authFetch(...)`, so making the function body `async` (to inspect `res.status` before returning) requires zero caller changes.
- `clinics.api.ts`'s existing `!res.ok` → thrown `Error` logic is untouched — the 401 hard-redirect in `authFetch` fires before the function returns, so by the time a caller's `!res.ok` check runs, `window.location.assign('/login')` has already been invoked (real browser navigation begins synchronously); no race, no duplicate error UI to reconcile.
- `AppLayout.tsx`'s "Chiqish" (logout) button — `localStorage.removeItem('admin_token')` + soft `navigate('/login')` — is untouched; it is a distinct, user-initiated path to the same destination and doesn't overlap with the 401 hard-redirect.

---

### Task 1: `RequireAuth` guard component

**Files:**
- Create: `apps/supervisor-admin/src/components/auth/RequireAuth.tsx`
- Test: `apps/supervisor-admin/src/components/auth/RequireAuth.test.tsx`

**Interfaces:**
- Consumes: `localStorage.getItem('admin_token')` (read-only, no new abstraction).
- Exposes: `RequireAuth({ children }: { children: ReactNode })` — mirrors `apps/web/src/components/auth/ProtectedRoute.tsx`'s shape (`children` prop, `<Navigate replace>` on failure), minus the `activeTenantId` check (no tenant concept in supervisor-admin).

- [ ] **Step 1: Write the failing test**

  ```tsx
  // apps/supervisor-admin/src/components/auth/RequireAuth.test.tsx
  import { render, screen } from '@testing-library/react';
  import { MemoryRouter, Route, Routes } from 'react-router-dom';
  import { beforeEach, describe, expect, it } from 'vitest';
  import { RequireAuth } from './RequireAuth';

  const renderWithRoutes = (initialEntry: string) =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

  describe('RequireAuth', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("admin_token yo'q bo'lsa /login ga redirect qiladi", () => {
      renderWithRoutes('/');
      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('admin_token mavjud bo\'lsa children render qilinadi', () => {
      localStorage.setItem('admin_token', 'jwt-token-123');
      renderWithRoutes('/');
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
      expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });
  });
  ```

  Run: `bun --filter @supervisor/admin test -- RequireAuth` (or the monorepo's equivalent per-package vitest command) — expect failure: `Cannot find module './RequireAuth'` (file doesn't exist yet).

- [ ] **Step 2: Run test to verify it fails**

  Confirm the failure is the expected "module not found" / import error, not an unrelated setup problem.

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // apps/supervisor-admin/src/components/auth/RequireAuth.tsx
  import type { ReactNode } from 'react';
  import { Navigate } from 'react-router-dom';

  /**
   * Render-time auth guard.
   * - admin_token yo'q (localStorage) → /login
   * - admin_token bor → children
   *
   * apps/web/src/components/auth/ProtectedRoute.tsx bilan bir xil shakl,
   * lekin supervisor-admin'da tenant/permission tushunchasi yo'q — faqat
   * bitta token borligi tekshiriladi (CLI-392).
   */
  export const RequireAuth = ({ children }: { children: ReactNode }) => {
    const token = localStorage.getItem('admin_token');

    if (!token) {
      return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  Both cases (missing token → "Login Page" shown; token present → "Protected Content" shown) green.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/components/auth/RequireAuth.tsx \
    apps/supervisor-admin/src/components/auth/RequireAuth.test.tsx
  git commit -m "$(cat <<'EOF'
  feat(supervisor-admin): add RequireAuth render-time guard component

  Mirrors apps/web's ProtectedRoute pattern (wrapper component, not a
  loader — this router is plain <Routes>, no data-router loaders
  available), simplified to supervisor-admin's single admin_token model.
  Not yet wired into App.tsx — that's Task 2.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: Wire `RequireAuth` into `App.tsx` and prove the redirect end-to-end

**Files:**
- Modify: `apps/supervisor-admin/src/App.tsx:15` (the `<Route element={<AppLayout />}>` line)
- Test: `apps/supervisor-admin/src/App.test.tsx`

**Interfaces:**
- Consumes: `RequireAuth` from Task 1.

- [ ] **Step 1: Write the failing test**

  This exercises the *real* `App` component (real `BrowserRouter`, not `MemoryRouter` — `App.tsx` hardcodes `BrowserRouter` internally so the test drives it via `window.history.pushState`, not a router prop) to prove the actual wiring, not just the isolated component from Task 1.

  `App.tsx` itself only wraps `QueryClientProvider` + `BrowserRouter` — `MantineProvider` is added one level up, in `main.tsx` (confirmed by reading both files in full). Rendering bare `<App />` in a test crashes with "MantineProvider was not found in component tree" the instant `LoginPage`/`AppLayout` mounts (both use Mantine components), which would fail Step 2 for the wrong reason (a provider crash, not the guard assertion). Wrap the same way `main.tsx` does:

  ```tsx
  // apps/supervisor-admin/src/App.test.tsx
  import { MantineProvider } from '@mantine/core';
  import { render, screen } from '@testing-library/react';
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { App } from './App';

  const fetchMock = vi.fn();

  const renderApp = () => render(<MantineProvider><App /></MantineProvider>);

  describe('App routing guard (CLI-392)', () => {
    beforeEach(() => {
      localStorage.clear();
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      window.history.pushState({}, '', '/');
    });

    it("admin_token yo'q holda to'g'ridan-to'g'ri / ga navigatsiya qilinsa /login ko'rsatiladi", async () => {
      renderApp();
      expect(await screen.findByText('Kirish')).toBeInTheDocument();
      expect(screen.queryByText('Klinikalar')).not.toBeInTheDocument();
      // No API calls should happen — the guard blocks before ClinicsPage mounts.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('admin_token mavjud holda / ClinicsPage render qilinadi', async () => {
      localStorage.setItem('admin_token', 'jwt-token-123');
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

      renderApp();

      expect(await screen.findByText('Klinikalar')).toBeInTheDocument();
      expect(screen.queryByText('Kirish')).not.toBeInTheDocument();
    });
  });
  ```

  Note: the no-token case uses `findByText` (not a sync `getByText`) — the `<Navigate>` redirect resolves via an effect, so waiting is safer than asserting before it has necessarily flushed.

  Run: expect the first case to currently **fail** (today's `App.tsx` has no guard, so `ClinicsPage` — and its "Klinikalar" title — renders regardless of `admin_token`, and `fetchMock` gets called).

- [ ] **Step 2: Run test to verify it fails**

  Confirm the first assertion (`"Kirish"` should appear, `"Klinikalar"` should not) fails against the *current* `App.tsx` — i.e. `"Klinikalar"` is found because the shell renders unguarded today. It should fail on the content assertion, not crash on a missing `MantineProvider` (the test wraps `<App />` in `MantineProvider` up front precisely so this failure mode is ruled out, matching `main.tsx`'s real provider tree).

- [ ] **Step 3: Write minimal implementation**

  ```tsx
  // apps/supervisor-admin/src/App.tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
  import { AppLayout } from './components/AppLayout';
  import { RequireAuth } from './components/auth/RequireAuth';
  import { LoginPage } from './features/auth/LoginPage';
  import { ClinicDetailPage } from './features/clinics/ClinicDetailPage';
  import { ClinicsPage } from './features/clinics/ClinicsPage';

  const queryClient = new QueryClient();

  export const App = () => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<ClinicsPage />} />
            <Route path="/clinics/:id" element={<ClinicDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
  ```

  Only change from the current file: import `RequireAuth` and wrap `<AppLayout />` with it in the layout route's `element`. Nothing else moves.

- [ ] **Step 4: Run test to verify it passes**

  Both cases green: no token → `/login` shown, zero fetch calls; token present → `ClinicsPage` renders (`"Klinikalar"` visible), no login form.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/App.tsx apps/supervisor-admin/src/App.test.tsx
  git commit -m "$(cat <<'EOF'
  fix(supervisor-admin): wrap AppLayout route with RequireAuth guard

  Direct navigation to / or /clinics/:id with no admin_token in
  localStorage previously rendered the full AppLayout shell before any
  API call revealed the problem (401 surfaced only as an inline error
  text, no redirect). RequireAuth now redirects to /login before the
  shell mounts, confirmed end-to-end against the real App router.

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: `authFetch` 401 handling (stale/invalid token discovered at runtime)

**Files:**
- Modify: `apps/supervisor-admin/src/lib/api.ts`
- Test: `apps/supervisor-admin/src/lib/api.test.ts`

**Interfaces:**
- Consumes: none new. `clinics.api.ts`'s three callers are unmodified — they keep calling `authFetch` the same way.

- [ ] **Step 1: Write the failing test**

  ```ts
  // apps/supervisor-admin/src/lib/api.test.ts
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { authFetch } from './api';

  const fetchMock = vi.fn();
  const assignMock = vi.fn();

  describe('authFetch', () => {
    beforeEach(() => {
      fetchMock.mockReset();
      assignMock.mockClear();
      vi.stubGlobal('fetch', fetchMock);
      localStorage.clear();
      localStorage.setItem('admin_token', 'stale-token');
      // configurable: true is required — this runs in beforeEach across 3
      // tests, and jsdom's original `location` descriptor is not itself
      // configurable by default, so a 2nd/3rd redefinition without it would
      // throw "Cannot redefine property: location".
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, assign: assignMock },
      });
    });

    it('javob 401 bo\'lsa admin_token tozalanadi va /login ga hard-redirect qilinadi', async () => {
      fetchMock.mockResolvedValue({ status: 401, ok: false, json: async () => ({}) });

      await authFetch('/v1/admin/clinics');

      expect(localStorage.getItem('admin_token')).toBeNull();
      expect(assignMock).toHaveBeenCalledWith('/login');
    });

    it('javob 401 bo\'lmasa admin_token va navigatsiya o\'zgarmaydi', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => [] });

      const res = await authFetch('/v1/admin/clinics');

      expect(res.ok).toBe(true);
      expect(localStorage.getItem('admin_token')).toBe('stale-token');
      expect(assignMock).not.toHaveBeenCalled();
    });

    it('Authorization header hamon localStorage tokenidan qo\'yiladi', async () => {
      fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => [] });

      await authFetch('/v1/admin/clinics');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/v1/admin/clinics'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer stale-token' }),
        }),
      );
    });
  });
  ```

  Run: expect the first test to fail (current `authFetch` never inspects `res.status`, so `assignMock` is never called and `admin_token` is never removed).

- [ ] **Step 2: Run test to verify it fails**

  Confirm failure is specifically on the 401-handling assertions (`assignMock` not called, token not cleared) — the third test (header passthrough) should already pass against the current implementation, confirming the test file itself is wired correctly before the fix.

- [ ] **Step 3: Write minimal implementation**

  ```ts
  // apps/supervisor-admin/src/lib/api.ts
  const API = import.meta.env.VITE_API_URL ?? '';

  export const authFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401) {
      // Token yaroqsiz (muddati o'tgan/bekor qilingan) — tozalab /login ga
      // hard-redirect qilamiz. authFetch React komponent daraxti tashqarisida
      // ishlaydigan oddiy modul funksiyasi, useNavigate() shu yerda ishlamaydi
      // (CLI-392).
      localStorage.removeItem('admin_token');
      window.location.assign('/login');
    }

    return res;
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  All three cases green: 401 clears token + redirects; non-401 leaves both untouched; header passthrough still works.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/supervisor-admin/src/lib/api.ts apps/supervisor-admin/src/lib/api.test.ts
  git commit -m "$(cat <<'EOF'
  fix(supervisor-admin): clear stale admin_token and redirect on 401

  authFetch is the single choke point every tenant-fetch call goes
  through (clinics.api.ts's three callers). Previously a 401 (expired/
  invalid token) was surfaced only as a generic inline error by the
  caller's !res.ok check, no redirect. Now authFetch itself clears the
  token and hard-redirects to /login on 401, closing the runtime half
  of CLI-392 (RequireAuth in the prior commit only covers the
  missing-token-at-render case).

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-review

- **Placeholders:** none — `RequireAuth.tsx`, the `App.tsx` diff, and `api.ts`'s new body are literal code, derived from the actual files read (`App.tsx` 24 lines, `api.ts` 11 lines, `AppLayout.tsx` 27 lines, `LoginPage.tsx` 45 lines, `ClinicsPage.tsx` 89 lines, `clinics.api.ts` 23 lines, plus `apps/web/src/components/auth/ProtectedRoute.tsx` 23 lines as the mirrored convention).
- **Loader vs wrapper — settled by evidence, not preference:** confirmed by reading `App.tsx` that the router is plain `<Routes>` (JSX API), not `createBrowserRouter`. Loaders don't exist in this setup at all, and `apps/web`'s equivalent guard (`ProtectedRoute`) is also a wrapper component under the same plain-`<Routes>` shape — so this isn't a judgment call, it's the only mechanism the existing router configuration supports without a much larger, out-of-scope router migration.
- **Two-part fix justified by two distinct failure states:** `RequireAuth` only catches "token absent at render time" (direct navigation with nothing in `localStorage`). It cannot catch "token present but rejected by the server" (expired/revoked) — that's only observable from an API response, hence Task 3's `authFetch` change. Both are explicitly named in the ticket ("missing/401"), so both are required for the DoD, not scope creep.
- **No new abstractions:** no Zustand store, no axios interceptor, no new query-client-level error handler — `RequireAuth` reads `localStorage` directly (matching `AppLayout.tsx`'s and `LoginPage.tsx`'s existing pattern) and `authFetch` gets a single new `if` block at its one existing choke point.
- **Signature compatibility double-checked:** `authFetch` changes from a sync arrow returning `fetch(...)`'s promise to an `async` function — verified all three callers (`fetchClinics`, `fetchClinicDetail`, `createClinic` in `clinics.api.ts`) already `await` it, so the `Promise<Response>` return type is unchanged and no caller edits are needed.
- **Test realism:** Task 2's test renders the actual `App` component (real `BrowserRouter`, driven via `window.history.pushState`) rather than only unit-testing `RequireAuth` in isolation — this is what actually proves the wiring in `App.tsx` works, not just that the component itself has correct internal logic. Task 3's test defines `window.location` via `Object.defineProperty` (the standard jsdom technique for stubbing `assign`, since `window.location` isn't directly reassignable) and includes a passthrough case (non-401) so the fix can't silently regress the existing Authorization-header behavior.
- **Two defects caught and fixed on review (both confirmed against files actually read, not assumed):** (1) `App.tsx` does not itself include `MantineProvider` — that's added by `main.tsx` one level up (read both files in full). Rendering bare `<App />` in Task 2's test would crash with "MantineProvider was not found in component tree" the moment `LoginPage`/`AppLayout` mount, failing Step 2 for the wrong reason (a provider crash, not the guard assertion) — fixed by wrapping the test render in `MantineProvider`, mirroring `main.tsx`'s real tree (same technique `test-utils.tsx`'s `renderApp` already uses for feature-level tests). (2) Task 3's `window.location` stub runs in `beforeEach` across 3 tests; without `configurable: true` on the `Object.defineProperty` call, a 2nd/3rd redefinition can throw "Cannot redefine property: location" depending on jsdom's original descriptor — added `configurable: true` as zero-cost insurance.
