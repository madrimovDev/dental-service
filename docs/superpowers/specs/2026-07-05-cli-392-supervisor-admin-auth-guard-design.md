# CLI-392 — Supervisor Admin auth route-guard yo'q (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-392 (Medium)
> **Scope:** `apps/supervisor-admin/src/App.tsx`, yangi `apps/supervisor-admin/src/components/auth/RequireAuth.tsx`, `apps/supervisor-admin/src/lib/api.ts`. Boshqa app (`apps/web`) o'zgarmaydi — faqat naqsh sifatida o'qildi.

---

## 1. Topilgan holat (kod o'qish natijasi)

**`apps/supervisor-admin/src/App.tsx`** (24 qator, to'liq o'qildi) — router **plain `<Routes>`** (`react-router-dom`'ning `BrowserRouter`/`<Routes>`/`<Route>` JSX API'si), **`createBrowserRouter` yoki data-router API EMAS**:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<AppLayout />}>
      <Route path="/" element={<ClinicsPage />} />
      <Route path="/clinics/:id" element={<ClinicDetailPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
</BrowserRouter>
```

`/` va `/clinics/:id` `AppLayout` ostida mount qilingan, lekin **hech qanday guard yo'q** — `admin_token` borligini hech kim tekshirmaydi. To'g'ridan-to'g'ri navigatsiya (masalan brauzer address bar'ga `/clinics/abc` yozish) `AppLayout` + ichki sahifani to'liq render qiladi; birinchi belgi muammo borligi haqida faqat `fetchClinics()`/`fetchClinicDetail()` 401 qaytarganda, `isError` orqali umumiy matn ko'rinishida keladi (`ClinicsPage.tsx:37-41`) — redirect yo'q.

**`apps/supervisor-admin/src/lib/api.ts`** (11 qator, to'liq o'qildi) — `authFetch` bitta joy, hamma tenant-fetch shu orqali o'tadi:

```ts
export const authFetch = (path: string, init?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}`,
      'Content-Type': 'application/json',
    },
  });
```

Hech qanday status-tekshiruv yo'q — `res.status === 401` hech qayerda handle qilinmaydi, faqat chaqiruvchi (`clinics.api.ts`) `!res.ok` ni umumiy `Error` ga aylantiradi (status-agnostik: 401 ham, 404 ham, 500 ham bir xil "yuklab bo'lmadi" matni). `LoginPage.tsx` token'ni `localStorage.setItem('admin_token', token)` bilan yozadi; `AppLayout.tsx`ning "Chiqish" tugmasi `localStorage.removeItem('admin_token')` + `navigate('/login')` bilan o'chiradi — demak **token yozish/o'chirish naqsh allaqachon localStorage-based**, Zustand yoki boshqa global auth store **yo'q** (supervisor-admin'da faqat bitta admin token, tenant/permission tushunchasi yo'q).

## 2. `apps/web`dagi mavjud konvensiya (mirror uchun o'qildi)

`apps/web/src/components/auth/ProtectedRoute.tsx` (23 qator, to'liq o'qildi) — xuddi shu muammoni **wrapper component** bilan hal qiladi, loader bilan emas:

```tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { accessToken, activeTenantId } = useAuthStore();
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!activeTenantId) return <Navigate to="/select-workspace" replace />;
  return <>{children}</>;
}
```

Bu `apps/web/src/app/App.tsx`da xuddi supervisor-admin'dagi kabi **plain `<Routes>`** ichida ishlatiladi (`apps/web` ham `createBrowserRouter` ishlatmaydi — u ham `<BrowserRouter><Routes>...` shakli), faqat farqi: token Zustand `useAuthStore()`dan o'qiladi (`apps/web`da global auth-store bor), supervisor-admin'da esa token to'g'ridan-to'g'ri `localStorage`da.

**Xulosa:** loyihada auth-guard uchun **route-loader hech qayerda ishlatilmaydi** — na `apps/web`da, na supervisor-admin'da router shunday sozlangan (loader mexanizmi faqat data-router API'sida mavjud, `<Routes>` JSX API'sida yo'q). Demak bu yerda "loader vs wrapper" degan tanlov aslida yo'q — **router konfiguratsiyasining o'zi wrapper-componentni yagona amalga oshiriladigan variant qiladi**. `apps/web`ning `ProtectedRoute`si — bevosita mirror qilinadigan tayyor naqsh, faqat auth-store o'rniga localStorage bilan soddalashtiriladi (supervisor-admin'da tenant/permission tushunchasi yo'q, faqat bitta token bor/yo'qligi).

## 3. Yechim — ikki qism

Ticket tavsifi aniq ikkita holatni sanaydi: **"admin_token missing OR 401"**. Bittasi render-vaqtidagi holat (token localStorage'da yo'q), ikkinchisi runtime holat (token bor, lekin server uni rad etadi — muddati o'tgan/noto'g'ri). Ikkalasi ham bitta mexanizm bilan yopilmaydi:

### 3.1 Render-vaqtidagi guard: `RequireAuth` wrapper component

`apps/web/src/components/auth/ProtectedRoute.tsx`ning soddalashtirilgan mirror'i — yangi `apps/supervisor-admin/src/components/auth/RequireAuth.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};
```

`App.tsx`da `AppLayout`ni o'rab beriladi:

```tsx
<Route element={<RequireAuth><AppLayout /></RequireAuth>}>
  <Route path="/" element={<ClinicsPage />} />
  <Route path="/clinics/:id" element={<ClinicDetailPage />} />
</Route>
```

Bu — to'g'ridan-to'g'ri navigatsiya (token yo'q holatda) ni to'xtatadi: `AppLayout`/`ClinicsPage`/`ClinicDetailPage` render bo'lishdan oldin `/login`ga redirect qilinadi, hech qanday tarmoq so'rovi (va demak hech qanday keyingi 401) yuz bermaydi.

### 3.2 Runtime guard: `authFetch` 401 handling

Token localStorage'da bor, lekin server uni rad etsa (muddati o'tgan/bekor qilingan) — `RequireAuth` bunga yordam bermaydi, chunki u faqat token *borligini* tekshiradi, *haqiqiyligini* emas. Bu holat faqat API javobidan bilinadi. `authFetch` — yagona choke-point (hamma tenant-fetch shu orqali o'tadi, `clinics.api.ts:1,5,11,17` tasdiqlaydi), shuning uchun fix shu yerda:

```ts
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
    localStorage.removeItem('admin_token');
    window.location.assign('/login');
  }
  return res;
};
```

**Nega `window.location.assign` va react-router `navigate` emas:** `authFetch` — oddiy modul funksiyasi, React komponent daraxti tashqarisida (hook chaqira olmaydi, `useNavigate()` faqat komponent ichida ishlaydi). Hard-navigation (`window.location.assign`) bu yerda to'g'ri tanlov — token allaqachon yaroqsiz, to'liq sahifa qayta yuklanishi (va shu bilan birga har qanday stale in-memory holat — masalan TanStack Query cache'dagi eski javoblar — tozalanishi) zarar emas, aksincha xavfsizroq.

**Nega `authFetch` signature o'zgarishi (sinxron `fetch(...)` qaytarish → `async` funksiya) mavjud chaqiruvchilarni buzmaydi:** barcha uchta chaqiruvchi (`clinics.api.ts:5,11,17-20`) allaqachon `await authFetch(...)` deb yozgan — qaytish tipi ikkala holatda ham `Promise<Response>`, faqat implementatsiya `async function` bo'lib qoladi (avval implicit Promise, endi explicit `await` ichkarida). Signature (`(path, init?) => Promise<Response>`) o'zgarmaydi.

## 4. Global constraint

1. **Loader-based yechim ko'rib chiqilmadi va rad etildi** — sabab yuqorida §2'da: bu loyihada (`apps/web` ham, supervisor-admin ham) router `createBrowserRouter`/data-router emas, `<Routes>` JSX API. Loader faqat data-router'da mavjud mexanizm; uni qo'shish butun router konfiguratsiyasini qayta qurishni talab qiladi — ticketning DoD doirasidan tashqarida (ticket faqat guard qo'shishni so'raydi, router migratsiyasini emas).
2. **Yangi global auth-store (Zustand) kiritilmaydi.** Supervisor-admin'da bitta admin token bor, tenant/permission konsepti yo'q — `localStorage.getItem('admin_token')` to'g'ridan-to'g'ri o'qish, `apps/web`dagi kabi `useAuthStore()` orqali emas, chunki bunday store hozircha yo'q va faqat shu ticket uchun qo'shish churn (over-engineering, YAGNI).
3. **`clinics.api.ts` ichidagi mavjud `!res.ok` xato-xabarlari o'zgarmaydi.** `authFetch`ning 401-handling'i alohida, oldindan (early) ishlaydi (`res.status === 401` tekshiruvi, keyin hali ham `res` qaytariladi) — chaqiruvchi kod hali ham `!res.ok` bo'yicha o'z xatosini tashlaydi (masalan `ClinicsPage`da "Klinikalar ro'yxatini yuklab bo'lmadi" xabari hali ko'rinadi, lekin sahifa allaqachon `window.location.assign('/login')` bilan tark etilayotgan bo'ladi — race emas, chunki `assign` browserning navigation'ni darhol boshlaydi).
4. **`AppLayout`ning "Chiqish" tugmasi (`navigate('/login')`, soft) o'zgarmaydi** — u faqat foydalanuvchi bosgan aniq logout, 401-triggered hard-redirect bilan aralashmaydi, ikkalasi ham bir xil `/login` manzilga olib boradi.

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] Yangi `RequireAuth` wrapper — `admin_token` localStorage'da yo'q bo'lsa `/login`ga redirect, `App.tsx`da `AppLayout`ni o'raydi.
- [ ] `authFetch` — javob `401` bo'lsa `admin_token`ni tozalaydi va `/login`ga hard-redirect qiladi (barcha chaqiruvchilar uchun avtomatik, `clinics.api.ts`ni o'zgartirmasdan).
- [ ] To'g'ridan-to'g'ri navigatsiya (token yo'q) `AppLayout`/`ClinicsPage` render qilinishidan oldin `/login`ga o'tadi — hech qanday tarmoq so'rovi yubormaydi.
- [ ] Testlar: `RequireAuth` (token yo'q/bor ikkala holat) + `App.tsx` integratsiya (haqiqiy router bilan, token yo'q/bor) + `authFetch` (401 va non-401 holat) — real Vitest + Testing Library, mock emas placeholder.
