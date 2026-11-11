# UI-0 — Asos (tokenlar, holat lug'ati, komponentlar, rolga moslashuvchi menyu) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** UI qayta dizaynining poydevori — keyingi UI-1…UI-4 ekranlari shu primitivlar va tokenlar ustiga quriladi.

**Architecture:** **bitta ketma-ket lane** (tokenlar, `packages/ui`, sidebar — hamma joyda umumiy). `packages/ui` primitivlari + `apps/web/src/shell` (Sidebar, nav-config, DesignSystemPage = UI kit sahifasi). P bosqichlarida qurilgan ekranlar yangi primitivlarga ko'chiriladi (qayta qurilmaydi).

**Spec:** `docs/superpowers/specs/2026-11-11-ui-redesign-design.md` §0–§1 (ekran manbasi: `docs/design/ui-redesign-2026-11/canvas/{Tokens,Components,Sidebar,Navigation}.dc.html`). Yakunlash roadmap'i §4.

## Global Constraints

- Stack: React 18 + Mantine v7 + `@dental/ui` + RFC-0010. Kanvas HTML ko'chirilmaydi — Mantine bilan qayta quriladi; **tuzilish, ierarxiya, matn, holatlar** mos bo'lishi shart, pixel-parity emas.
- Barcha matn `t()` — `packages/i18n/src/{uz,ru}.json` (ru tarjimani o'zing yoz). Kanvasdagi namuna ma'lumot kodga kirmaydi.
- Tokenlar 1.1: asosiy matn **15px**, eng kichik 13px (12px faqat badge), izoh/yorliq `--text-2`, bosish zonasi ≥44px; vaqt/pul/tish raqami/telefon — Mono. **Har yangi rang juftligi uchun light VA dark kontrast ≥ 4.5:1** (matn) — `scripts/ui/contrast-check.ts` bilan.
- Holat lug'ati 1.2 — `StatusPill` variantlari **ma'no** bo'yicha: `planned | confirmed | waiting | active | done | failed` (jadvaldagi fon/matn ranglari). Rang doim yorliq bilan.
- Mavjud `StatusPill` iste'molchilari buzilmaydi: eski variant nomlari yangi ma'nolarga map qilinadi (`grep -rn "StatusPill" apps/web/src` bilan ro'yxat).
- Navigatsiya 1.5: rolga qarab guruhlangan menyu (registrator / shifokor / rahbar / texnik); rol `roleKey`dan, custom rol → mavjud permission-filter fallback. Ruxsatli har sahifa ⌘K orqali topiladi. **Rol bo'yicha test real permset bilan, `@owner` emas.**
- `StateView.forbidden` — 403'da hech qachon default qiymat ko'rsatilmaydi (ID-11).
- Vizual qabul: har vazifa oxirida `scripts/ui/canvas-shot.ts` (kanvas artboard) va `scripts/ui/app-shot.ts` (ilova, light+dark) PNG'lari olinadi; reviewer ularni **Read** bilan ko'rib solishtiradi.

## Review Focus

1. **Dark mode kontrasti** — har yangi/o'zgargan token juftligi (DS0 regressiya darsi).
2. **Mavjud ekranlar 15px matnga o'tganda siqilib/buzilib ketmaydi** — Bosh ekran, Bemorlar, Kassa, Sozlamalar skrinshotlari.
3. **Custom rol (shablon emas) foydalanuvchisi menyuda bo'sh qolmaydi** — permission fallback.
4. **Registrator menyusida Sozlamalar yo'q, lekin ruxsati bo'lsa ⌘K'da bor**.
5. **Eski `StatusPill` variantlari** bilan yozilgan ekranlar (yozilish, navbat, lab) ranglari yangi ma'noga to'g'ri tushadi.

---

### Task 0: Vizual vositalar + spec tozalash
**Tier:** T2 `sonnet`·`medium`.
**Files:** Create `scripts/ui/canvas-shot.ts` (playwright-core, Chromium `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`; `support.js` so'rovi `.cache/dc-runtime.js`ga route qilinadi; `bun scripts/ui/canvas-shot.ts <Name> [out.png]` → `docs/design/ui-redesign-2026-11/canvas/<Name>.dc.html`), `scripts/ui/app-shot.ts` (`--base http://localhost:PORT --phone … --password … --tenant <name> --paths /,/patients --out <dir> [--dark]`: login → workspace tanlash → har path light/dark PNG; dark = `localStorage['mantine-color-scheme-value']='dark'`), `scripts/ui/contrast-check.ts` (`packages/ui/src/theme/tokens.css` dan light va `[data-mantine-color-scheme=dark]` juftliklari ro'yxati bo'yicha WCAG nisbatini hisoblaydi, <4.5 bo'lsa exit 1), `scripts/ui/seed-roles.ts` (`--base URL --out creds.json`: register-tenant + har rol shabloni uchun xodim invite + majburiy parol almashtirish → `{tenant, users:{receptionist,doctor,owner,technician,accountant,custom}:{phone,password}}`; custom rol = faqat `patient.view`+`appointment.view`), `scripts/ui/README.md` (ishlatish: lane bazasida API'ni `API_PORT=80xx WEB_DIST_DIR=$PWD/apps/web/dist` bilan ishga tushirish, web `VITE_API_BASE_URL= bun run build`, seed, keyin shot'lar). Modify `docs/superpowers/specs/2026-11-11-ui-redesign-design.md` §4 — 6 savolga javoblar (roadmap §4 jadvali: navbat ikkalasi, kreslo YO'Q — Calendar «Kreslolar» ko'rinishi qurilmaydi, lab ko'radigan ma'lumot → lab portali, zaxira papkaga + UI tiklash, karta sub-turi, 4 bo'lim) va yangi §1.6 «P bosqichi ekranlari → primitivlar» jadvali (Task 4 ro'yxati).
- [ ] `bun scripts/ui/canvas-shot.ts Sidebar /tmp/claude-1000/sb.png` → PNG (Read bilan tekshiring); contrast-check hozirgi tokenlarda ishlaydi (natija qanday bo'lsa ham exit kodini hisobotga yozing). Commit `chore(ui): kanvas/ilova skrinshot va kontrast vositalari; spec §4 qarorlar`.

### Task 1: Tokenlar (1.1)
**Tier:** T2 `sonnet`·`medium`.
**Files:** `packages/ui/src/theme/tokens.css` (`--text-base: 15px`, kichik o'lchamlar, `--text-2`/`--text-3` qoidasi, `--tap-min: 44px`, `--tap-chair: 60px`), `mantine-theme.ts` (fontSizes, Button/ActionIcon/Input min-height 44), `teal-sync.test.ts`/`danger-red-sync.test.ts` kabi sync testlari, `scripts/ui/contrast-check.ts` juftliklari.
- [ ] Failing: sync testi `--text-base` 15px, contrast-check yangi juftliklarda. → implementatsiya → `cd packages/ui && bunx vitest run` + `bun scripts/ui/contrast-check.ts` exit 0 + `cd apps/web && bunx vitest run src/shell` + typecheck. Skrinshot: `/`, `/patients`, `/cashier`, `/settings` light+dark (Review Focus 2). Commit `feat(ui): tokenlar — 15px matn, 44px bosish zonasi, kontrast (UI-0)`.

### Task 2: Holat lug'ati + PatientFlag + AlertBanner (1.2, 1.3)
**Tier:** T2 `sonnet`·`medium`.
**Files:** `packages/ui/src/primitives/StatusPill*` (6 ma'no + eski nomlar map'i), yangi `PatientFlag`, `AlertBanner` (3 daraja: `critical` modal emas — banner faqat 2/3; 1-daraja `CriticalActionDialog` Task 3 da), `packages/ui/src/index.ts`, `apps/web/src/shell/DesignSystemPage.tsx` (UI kit: barcha variantlar), `packages/ui/STATUS-INDICATORS.md` yangilanadi.
- [ ] Failing testlar (har variant yorliq + rang tokeni; eski variant → yangi ma'no) → implementatsiya → `cd packages/ui && bunx vitest run` + web typecheck. Skrinshot: DesignSystemPage vs `canvas-shot Tokens`, `canvas-shot Components`. Commit `feat(ui): 6 ma'noli holat lug'ati, PatientFlag, AlertBanner (UI-0)`.

### Task 3: CriticalActionDialog, UndoToast, StateView.forbidden, ConnectionStatus, UpdateBanner, PhoneInput
**Tier:** T3 `sonnet`·`high`.
**Files:** `packages/ui/src/primitives/*` (yangilari + `StateView` `forbidden` varianti: kimga murojaat qilish matni prop orqali), `PhoneInput` (`+998` prefiks, istalgan formatda yozish → kanonik `+998XXXXXXXXX`, Mono; `@dental/core` `normalizePhone` bilan), `UndoToast` (10 s, `onUndo`; pul amallari uchun ishlatilmasligi hujjatda), `ConnectionStatus` (`lan | offline | cloud | noserver` — desktop/cloud aniqlash `GET /api/license/status` `mode` dan yoki prop), DesignSystemPage.
- [ ] Failing testlar (CriticalActionDialog: sabab tanlanmaguncha xavfli tugma disabled, xavfsiz variant asosiy; UndoToast: 10 s ichida undo chaqiriladi, keyin commit; PhoneInput: `90 123-45-67` → `+998901234567`; StateView forbidden matn) → implementatsiya → `cd packages/ui && bunx vitest run`. Commit `feat(ui): kritik amal dialogi, undo toast, forbidden holat, ulanish holati, telefon kiritish (UI-0)`.

### Task 4: Rolga moslashuvchi Sidebar + P-ekranlarni primitivlarga ko'chirish
**Tier:** T3 `sonnet`·`high` · risky (RBAC — verifier).
**Files:** `apps/web/src/shell/nav-config.ts` (+ test), `Sidebar.tsx` (+ test; rol guruhlari 1.5, pastida `ConnectionStatus` + foydalanuvchi/rol + chiqish), command palette (barcha ruxsatli sahifalar). P-ekranlar: `features/license/components/LicenseBanner.tsx` → `AlertBanner` (2-daraja), `LicenseBlockedScreen.tsx` → `StateView`/AlertBanner uslubi, `features/auth/pages/change-password-required.page.tsx` va `select-workspace.page.tsx` takliflar kartasi → yangi tokenlar/primitivlar, `UsersSettingsScreen` «Kutilmoqda» → `StatusPill waiting`. Mavjud testlar yangilanadi (xulq o'zgarmaydi).
- [ ] Failing testlar: real permset fixture'lar bilan (Receptionist, Doctor, Tenant Admin/Owner, Technician, custom rol faqat `patient.view`+`appointment.view`) — har birida kutilgan guruhlar va bandlar; Receptionist menyusida «Sozlamalar» yo'q, ⌘K'da ruxsat bo'lsa bor; custom rol bo'sh emas. → implementatsiya → `cd apps/web && bunx vitest run src/shell src/features/license src/features/auth src/features/settings` + typecheck. Skrinshot: har rol uchun sidebar (app-shot) vs `canvas-shot Sidebar`/`Navigation`. Commit `feat(web): rolga moslashuvchi menyu + P-ekranlar yangi primitivlarda (UI-0)`.

---

## Ijro
- Bitta lane, Task 0→4 ketma-ket. Lane: `scripts/wf-lane.sh prep ui0 1 --db` (app-shot uchun API+web build lane bazasida; setup: `scripts/ui/app-shot.ts` README'dagi seed tartibi).
- Verifier: Task 4. Har vazifa reviewer'i skrinshotlarni Read bilan ko'radi.
- Merge gate: `bunx turbo typecheck`, `packages/ui` + `apps/web` vitest to'liq, `contrast-check`, `check:rls` (o'zgarmaydi), API to'plami **shart emas** (API'ga tegilmaydi — agar tegilsa, to'liq).
