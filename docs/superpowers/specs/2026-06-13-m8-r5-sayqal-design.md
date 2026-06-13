# M8 — R5 Sayqal: Dizayn

**Sana:** 2026-06-13
**Milestone:** M8 — R5 Sayqal (oxirgi milestone; 9/9 yopilsa loyiha R0–R5 to'liq)
**Linear:** CLI-78 (epik) + CLI-79, CLI-80, CLI-81, CLI-1 (sub-issue'lar, hozir Backlog)
**Ko'lam:** To'liq, ship-quality

---

## 1. Maqsad

Yakuniy sayqal. To'rt mustaqil soha:

1. **Vertical gating** (CLI-79) — klinika vertikaliga qarab modullarni shartlash + haqiqiy 2-chi vertical ("Umumiy klinika").
2. **Command palette** (CLI-81) — ⌘K navigatsiya + amallar + bemor jonli qidiruv.
3. **Onboarding** (CLI-1, qism) — bloklamaydigan dashboard setup checklist.
4. **Perf/edge UX** (CLI-1, qism) — skeleton + ErrorBoundary + izchil error/empty holatlar.
5. **Dark mode polish** (CLI-80) — audit-driven hardcoded rang tuzatishlari.

---

## 2. Hozirgi holat (kodbaza)

| Soha | Holat | Asosiy fayl |
|---|---|---|
| Vertical | `tenant_settings.vertical` ustuni bor (default `'dental'`, enum faqat `'dental'`); tab'lar faqat permission bilan gated | `packages/db-schema/src/tables/tenant-settings.ts:21`, `apps/web/src/features/patients/components/PatientCard.tsx:59-64` |
| Dark mode | Toggle ishlaydi (Topbar), Mantine theme sozlangan | `apps/web/src/shell/Topbar.tsx:20,62-65` |
| Command palette | Yo'q; Topbar'da `⌘K` placeholder (readOnly input) | `apps/web/src/shell/Topbar.tsx:47-57` |
| Onboarding | Yo'q; register → login; empty state'lar minimal matn | `apps/web/src/pages/auth/register-tenant.page.tsx` |

**Mavjud asoslar (qayta foydalaniladi):**
- `apps/web/src/shell/nav-config.ts` — `NAV_GROUPS[]` + `visibleGroups(has)` permission-aware registry.
- `apps/web/src/features/settings/settings.api.ts:196` — `useTenantSettings()` hook.
- `packages/core/src/` — shared source-of-truth (permissions.ts, role-templates.ts).
- `apps/web/src/features/dashboard/DashboardRouter.tsx` + `role-dashboard-map.ts` — owner/admin → `ManagerDashboard`.

---

## 3. Foundation (birinchi quriladi — qolgan 4 task shunga tayanadi)

### 3.A `packages/core/src/vertical-features.ts` — keystone

Yagona manba. Hamma joy (tab gating, palette, nav, backend guard) shundan oziqlanadi.

```ts
export const VERTICALS = ['dental', 'general'] as const;
export type Vertical = (typeof VERTICALS)[number];

export type VerticalFeature = 'odontogram' | 'labOrders';

export const VERTICAL_FEATURES: Record<Vertical, Record<VerticalFeature, boolean>> = {
  dental:  { odontogram: true,  labOrders: true },
  general: { odontogram: false, labOrders: false },
};

export const hasFeature = (vertical: Vertical, feature: VerticalFeature): boolean =>
  VERTICAL_FEATURES[vertical]?.[feature] ?? false;
```

`packages/core/src/index.ts` dan eksport qilinadi.

### 3.B `StateView` primitivi (`packages/ui`)

Yagona loading / error+retry / empty holat komponenti. Perf/edge va onboarding empty-state'lar shundan foydalanadi.

```
<StateView
  status="loading" | "error" | "empty"
  skeleton?: 'table' | 'cards' | 'detail'   // loading uchun
  icon? title? description? action?           // empty/error uchun
  onRetry?                                     // error uchun
/>
```

Mantine `Skeleton` + design-system token'lar (teal) ustida. i18n string'lar chaqiruvchidan keladi (komponent ichida hardcode yo'q).

---

## 4. CLI-79 — Vertical gating

1. **DB:** `tenant_settings.vertical` enum → `'dental' | 'general'`. Drizzle migration (`drizzle-kit generate` → review → commit).
2. **Backend:**
   - `tenant-settings.schema.ts`: `z.enum(['dental', 'general'])`.
   - Yangi yengil guard `requireFeature('odontogram')` / `requireFeature('labOrders')` — odontogram va lab order route'larida. Joriy tenant `vertical`'ini o'qib, feature o'chiq bo'lsa 403 (`core` map orqali). Sabab: UI yashirsa-da API ham yopiq bo'lsin (CLI-153 saboq: defense-in-depth, "UI yashiradi, API xizmat qiladi" gap'ini yopadi).
   - Vertical o'zgarishi — permission-protected mutation → **audit_log** yozuvi (before/after).
3. **Frontend:**
   - `nav-config.ts`: `visibleGroups(has, vertical)` — feature filtri qo'shiladi. Item'larga ixtiyoriy `feature?: VerticalFeature` maydoni; vertical feature'ni yoqmasa item tushib qoladi.
   - `Sidebar.tsx`: `useTenantSettings().vertical` ni `visibleGroups`'ga uzatadi.
   - `PatientCard.tsx`: tab'lar permission **VA** `hasFeature(vertical, feature)` bilan filtrlanadi. `general` vertikalda odontogram + lab tab'lari yashirin.
   - `TenantSettingsScreen.tsx`: Select 2 variant (`Stomatologiya` / `Umumiy klinika`) + i18n; o'zgartirishda ogohlantirish ("ma'lumot o'chmaydi, faqat yashiriladi").
4. **api-client regen** (`generate:contract`).

**DoD:** `general` tenant'da odontogram/lab UI'da ko'rinmaydi va API 403; `dental`'da hammasi ishlaydi; vertical o'zgarishi audit'da; i18n uz+ru.

---

## 5. CLI-81 — Command palette (⌘K)

- `@mantine/spotlight` install (`apps/web`).
- Topbar placeholder input → spotlight ochadi; global Ctrl/⌘+K shortcut (spotlight beradi).
- `CommandPalette` komponenti `shell/` da, AppShell ichida mount qilinadi.
- 3 guruh, hammasi **permission + vertical-aware** (`nav-config` registry'sidan qayta foydalanadi):
  1. **Navigatsiya** — `visibleGroups(has, vertical)` natijasidagi route'lar (Bemorlar, Yozilish, Navbat, Kassa, Hisobotlar, Sozlamalar…).
  2. **Amallar** — "Yangi bemor", "Yangi yozilish" va h.k. Har biri permission tekshiradi, create route'ga navigatsiya qiladi.
  3. **Bemor qidiruv** — debounced async (mavjud patients-search API, `?query=`). Natijaga bosib `/patients/:id` ga o'tadi. `patient.view` yo'q bo'lsa guruh ko'rinmaydi.
- Barcha label i18n (uz+ru).

**DoD:** ⌘K hamma joyda ochiladi; faqat ruxsat etilgan + vertical'ga mos elementlar; bemor qidiruv ishlaydi; i18n.

---

## 6. CLI-1 (qism A) — Onboarding setup checklist

- `OnboardingChecklist` komponenti `ManagerDashboard` da. **Bloklamaydi**, rad etiladi.
- Faqat setup amallariga ruxsati borlar ko'radi (owner/admin — branch/service/user create permission'lari).
- Qadamlar, bajarilgani **mavjud ma'lumotdan** aniqlanadi (count so'rovlari):
  - Filial qo'shish (branch)
  - Xizmat qo'shish (service)
  - Xodim qo'shish (user)
  - Ish jadvali (schedule)
  - Har qadam → tegishli ekranga olib boradi.
- **Dismissal:** `tenant_settings.onboardingDismissedAt timestamptz null` (ko'p qurilma uchun — localStorage emas). Migration + settings endpoint maydoni + api-client regen.
- Empty-state'lar bu yerda **emas** (foydalanuvchi checklist-only variantni tanladi; empty-state'lar §7 perf/UX bucket'ida).

**DoD:** yangi tenant dashboard'da checklist; progress real ma'lumotdan; dismissal saqlanadi; faqat admin ko'radi; i18n.

---

## 7. CLI-1 (qism B) — Perf / edge UX qatlami

- `StateView` (§3.B) ni quyidagi **aniq ekranlarga** joriy qilamiz (spinner/minimal matn o'rniga):
  - Bemorlar ro'yxati
  - Dashboard'lar (6 rol)
  - Kassa (POS + plan billing)
  - Yozilish (kalendar/ro'yxat)
  - Navbat
  - Hisobotlar
  - Xizmatlar
- Global route-level **ErrorBoundary** (React Router errorElement) + retry tugmasi.
- TanStack Query error/retry holatlari izchil (`isError` → StateView error).

**DoD:** sanab o'tilgan ekranlarda loading=skeleton, error=retry, empty=yo'naltiruvchi; ErrorBoundary ulangan; "hamma joy" emas, ro'yxat bo'yicha.

---

## 8. CLI-80 — Dark mode polish (audit-driven)

- Dark rejim allaqachon funksional (toggle bor). Bu task — **vizual audit**, "100% ishlaydi" da'vosiga ishonmaslik.
- Real audit: dark rejimni yoqib, har CSS Module'ni ko'rib chiqish; scheme'ga javob bermaydigan **hardcoded rang**larni (hex/rgb) Mantine token / `light-dark()` ga almashtirish; kontrast tekshiruvi.
- Aniq ekran o'tishi (enumerated, evidence bilan): shell (Sidebar/Topbar) + auth sahifalari + §7 dagi asosiy ekranlar.

**DoD:** sanab o'tilgan ekranlar dark'da to'g'ri (skrinshot/observatsiya bilan); hardcoded rang qolmaydi; kontrast yetarli.

---

## 9. Yetkazib berish

5 mustaqil PR/branch (har biri o'z Linear task'ini yopadi), Foundation birinchi:

1. **Foundation** (core vertical-features map + nav filtri infra + `StateView` primitivi) — CLI-78 epik ostida yoki birinchi PR.
2. **CLI-79** — Vertical gating
3. **CLI-81** — Command palette
4. **CLI-1** — Onboarding checklist + perf/edge UX
5. **CLI-80** — Dark mode polish

Har biri merge'dan keyin tegishli Linear issue "Done" ga o'tadi; hammasi tugagach CLI-78 epik yopiladi.

### Definition of Done (umumiy, har task)
- i18n uz+ru — **har** yangi string (palette label, checklist, vertical nomlari, StateView matnlari).
- Permission-protected mutation → `audit_log` yozuvi (vertical o'zgarishi, onboarding dismissal).
- Schema o'zgarsa → api-client regen (`generate:contract`), web RESPONSE surface generated qoladi.
- `biome` + `typecheck` o'tadi (pre-commit).
- RLS: yangi tenant_settings maydonlari mavjud RLS ostida (tenant-scoped jadval).

---

## 10. Qamralmaydi (YAGNI / kelajak)

- 3-chi vertical (kosmetologiya va h.k.) — mexanizm tayyor, lekin hozir faqat dental+general.
- Majburiy onboarding wizard (bloklaydigan) — foydalanuvchi bloklamaydigan checklistni tanladi.
- Boy per-screen empty-state illustratsiyalar — `StateView` yetarli.
- Granular per-modul toggle (vertical o'rniga) — vertical map yondashuvi tanlandi.
