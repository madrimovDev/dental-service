# CLI-407 — Tenant almashtirishda stale cross-tenant query-kesh qoladi

> Audit: H3 (HIGH). Cross-tenant ma'lumot oshkorligi (§3.1/§3.2 ogohlantirgan sinf).

## 1. Muammo va ildiz sabab

`apps/web/src/features/auth/pages/select-workspace.page.tsx:41-54` — `useSwitchWorkspace().onSuccess`:

```ts
onSuccess: (data) => {
  const payload = JSON.parse(atob(...));
  setTokens(data.accessToken, data.refreshToken);
  setContext(payload.atid, payload.abid, payload.perms, payload.roleKey ?? null);
  navigate('/');
},
```

Yangi token + kontekst o'rnatiladi, lekin **`queryClient.clear()` chaqirilmaydi**. TanStack Query keshi Tenant A ma'lumotlari (bemorlar, dashboard, hisobotlar) bilan to'la qoladi. Foydalanuvchi sidebar orqali Tenant B'ga o'tsa — JWT B'ga o'tadi, lekin `staleTime` (30s) ichida **A ma'lumotlari B sessiyasida ko'rinadi**.

`useBranchSwitch` (`auth.api.ts:107-136`) buni **to'g'ri** qiladi — `onSuccess` ichida `queryClient.clear()` (auth.api.ts:134) chaqiradi. `auth.api.ts:101-106` docstring bu nomuvofiqlikni ochiq tan oladi: *"SelectWorkspacePage — boshqa tartib ... queryClient.clear() yo'q ... alohida qoldi."*

## 2. Dizayn qarori

**DECISION (audit'dan):** `select-workspace.page.tsx`ning `useSwitchWorkspace().onSuccess`ga `queryClient.clear()` qo'shish — `useBranchSwitch`ni aynan takrorlab.

Tartib `useBranchSwitch` bilan bir xil: **setTokens → setContext → clear → navigate**. `queryClient.clear()` faqat TanStack keshini tozalaydi; Zustand `auth-store` tokenlari/konteksti (`setTokens`/`setContext`) o'z store'ida qoladi — **hech qanday post-switch holat yo'qolmaydi**. `navigate('/')` `clear()`dan keyin ishlaydi: yangi sahifa yangi (bo'sh) keshdan yangi tenant kontekstida qayta so'raydi.

**Rad etilgan alternativalar:**
- *Faqat `invalidateQueries()`* — tanlab invalidatsiya barcha cross-tenant keyni qamramaydi (query-key'larda `tenantId` scope yo'q), `clear()` yagona to'g'ri kafolat. Rad.
- *`SelectWorkspacePage`ni `useBranchSwitch`ga migratsiya qilish* — docstring aytganidek tartiblar farq qiladi (bu sahifada revocation → `session_expired` toast; `useBranchSwitch`da jim `/login`). Bitta qatorlik fix xavfsizroq, refactor keyingi ishga. Rad (scope tashqarisi).

## 3. Spec — tuzatilgandan keyingi xulq

Xulq-shartnoma: workspace muvaffaqiyatli almashtirilganda, navigatsiyadan **oldin** TanStack query-kesh butunlay tozalanadi. Yangi tenant'da eski tenant ma'lumotining bir zumlik ko'rinishi bo'lmaydi.

Edge cases:
- **Auto-select** (yagona workspace, login'dan keyin) — `onSuccess` bir xil, kesh ham tozalanadi (login'dan keyin kesh bo'sh, zararsiz no-op).
- **Xato yo'li** (`onError`) — o'zgarmaydi; `session_expired`/toast mantiqiy saqlanadi.
- **Zustand holati** — `clear()`dan keyin ham token/kontekst mavjud (regresssiya yo'q).

Test holatlari (**vitest**, mavjud `select-workspace.page.test.tsx`ni kengaytir):
1. Muvaffaqiyatli switch'dan keyin `queryClient.clear()` chaqirilgan (spy/mock).
2. `clear()` `navigate('/')`dan **oldin** chaqilgan (tartib).
3. `setTokens`/`setContext` hali ham chaqilgan (holat yo'qolmagan).

## 4. Implementatsiya rejasi (TDD)

**1-qadam — failing test:** `apps/web/src/features/auth/pages/select-workspace.page.test.tsx`ga holat qo'sh. `QueryClient` instansiyasini `clear` spy bilan (`vi.spyOn(queryClient, 'clear')`) yoki `useQueryClient`ni mock qilib, switch mutation muvaffaqiyatidan keyin `clear` chaqilganini tekshir.
Verify: `cd apps/web && bunx vitest run select-workspace` → RED.

**2-qadam — impl:** `select-workspace.page.tsx`:
- `import { useQueryClient } from '@tanstack/react-query';`
- Komponent ichida: `const queryClient = useQueryClient();`
- `onSuccess` (41-54) ichiga, `navigate('/')`dan oldin: `queryClient.clear();`

```ts
setTokens(data.accessToken, data.refreshToken);
setContext(payload.atid, payload.abid, payload.perms, payload.roleKey ?? null);
queryClient.clear(); // CLI-407: cross-tenant stale kesh — useBranchSwitch bilan bir xil
navigate('/');
```
Verify: `bunx vitest run select-workspace` → GREEN.

**3-qadam — verify:** `cd apps/web && bunx vitest run select-workspace` + `bun run --filter @dental/web typecheck`.

> DB/schema/migratsiya yo'q.

## 5. Migratsiya / rollout / xavflar

- **DB migratsiya:** yo'q (frontend-only).
- **Backwards-compat:** to'liq mos; xatti-harakat faqat qattiqroq (stale kesh tozalanadi).
- **RLS:** tegmaydi (frontend).
- **Xavf:** past. Yagona nozik nuqta — `clear()` almashtirishdan keyingi birinchi renderda barcha query'larni qayta so'ratadi (kutilgan). Zustand holati saqlanadi.

## 6. Qabul mezonlari

- [ ] `useSwitchWorkspace().onSuccess` `queryClient.clear()` chaqiradi.
- [ ] `clear()` `navigate('/')`dan oldin, `setTokens`/`setContext`dan keyin.
- [ ] Almashtirishdan keyin Tenant A bemorlar/dashboard/hisobot keshi tozalangan.
- [ ] vitest test yashil; typecheck toza.
- [ ] `onError` yo'li o'zgarmagan.

## 7. Ta'sirlangan fayllar

- `apps/web/src/features/auth/pages/select-workspace.page.tsx` — `useQueryClient` + `clear()`.
- `apps/web/src/features/auth/pages/select-workspace.page.test.tsx` — test kengaytmasi (vitest).
