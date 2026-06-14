# Frontend Review Fixes — Design Spec

**Sana:** 2026-06-14
**Manba:** 4 parallel review agenti (design system + shell, feature ekranlari, arxitektura/kod sifati, a11y/responsive/robustlik) topilmalari.
**Status:** Foydalanuvchi tomonidan oldindan tasdiqlangan (avtonom ijro, advisor bilan maslahat).
**Scope:** `apps/web` + `packages/ui`. Backend o'zgarishi yo'q (faqat F7 reports doctor-name uchun, frontend lookup orqali hal qilinadi).

---

## 1. Maqsad

Frontend review'da topilgan barcha muammolarni Linear tasklarga yozish va to'liq tuzatish. Har bir ish-oqimi = 1 Linear task = 1 branch → fix → verify → doc-sync → Linear-sync → commit → PR → merge.

## 2. Verification gate (HAR MERGE'dan oldin, MUZOKARASIZ)

Avtonom merge-to-main bo'lgani uchun **verification — yagona xavfsizlik mexanizmi**. Har task uchun, merge'dan oldin:

```
bun run lint          # biome check
bun run typecheck     # turbo run typecheck (tsc --noEmit)
bun --filter @dental/web test   # vitest run
cd apps/web && bun run build    # tsc --noEmit && vite build
```

Hammasi yashil bo'lmasa — **merge YO'Q**. PR ochiq qoldiriladi (Linear "In Review"), keyingi taskka o'tiladi, oxirida hisobot beriladi. Hech qachon qizil merge qilinmaydi.

Tasklar orasida: `git checkout main && git pull` (stale main'dan branch ochmaslik uchun).

## 3. Ijro printsiplari (advisor)

- **Foundation-first:** F1 (mutation toast), F2 (formatCurrency), F3 (StateView pattern) keyingi tasklar tayanadigan infra — birinchi.
- **Mechanical vs subjective:** correctness/a11y/i18n fixlar — xavfsiz auto-fix. Subjective/ijodiy ishlar (dashboard differentiation, micro-motion, spacing tokens) — **minimal + oxirida**, konservativ.
- **Yuqori blast-radius, lekin verifikatsiyalanadigan:** `--text-3` kontrast (global token) — AA nisbati (≥4.5:1) hisoblanib tasdiqlanadi.
- **Verifikatsiya halolligi:** unit-testlanadigan (StateView mavjudligi, aria-label, formatCurrency, mutation wiring) test bilan; runtime-vizual (focus ring, kontrast in situ, motion) faqat kod to'g'riligi bilan — ko'rilmagan runtime xulq da'vo qilinmaydi.

## 4. Ish-oqimlari (Linear tasklar)

Har task tavsifi o'z topilmalarini checklist sifatida sanaydi.

### F1 — Global mutation error feedback (Critical)
- **Muammo (C1):** `MutationCache.onError` yo'q; muvaffaqiyatsiz submit jimgina osiladi (modal `onSuccess: close`, xato bo'lsa hech narsa ko'rsatilmaydi).
- **Fix:** `apps/web/src/lib/query-client.ts` — `QueryClient`'ga `MutationCache({ onError })` qo'shib, default toast (`@mantine/notifications`) ko'rsatish. `ApiError`'dan xabar olish, fallback generic i18n matn. Per-mutation `onError` override'lar saqlanadi (default faqat handle qilinmaganda).
- **Verify:** unit test — mutationCache onError default toast chaqirishini tekshirish; i18n kalit qo'shilgan.

### F2 — formatCurrency helper + i18n `so'm` + money dedup (High)
- **Muammo (H i18n, M1):** hardcoded `so'm` 11+ faylda (RU tarjima bo'lmaydi); `Intl.NumberFormat` 14 faylda takrorlangan; `ManagerDashboard` `Math.round` qiladi, boshqalar yo'q → divergent rendering.
- **Fix:** `apps/web/src/lib/format.ts` — `formatCurrency(amount, t)` / `formatMoney` helper (`Intl.NumberFormat` + `t('common.currency_suffix')`). 14 faylni helperga ko'chirish. i18n `common.currency_suffix` (uz: `so'm`, ru: `сум`) qo'shish.
- **Verify:** unit test formatCurrency output; grep — hardcoded `so'm` 0 ga tushgan (language-picker self-label'lar bundan mustasno emas — ular boshqa).

### F3 — StateView rollout (High)
- **Muammo (H states):** klinik tablar (Odontogram/TreatmentPlans/Prescriptions/LabOrders/Consent/VisitNotes/Images) `StateView` ishlatmaydi; Audit/Expenses/Payroll/Stock raw `Loader`, error+retry yo'q; ba'zi settings ekranlari ham.
- **Fix:** `@dental/ui` `StateView` (loading/error+retry/empty) ni shu ekranlarga joriy etish. Pattern: `query.isLoading → StateView loading`, `query.isError → StateView error + refetch`, `empty → StateView empty`.
- **Verify:** grep — sanab o'tilgan fayllarda StateView ishlatilgani; har biri error branch'ga ega.

### F4 — Odontogram a11y (Critical)
- **Muammo (C2):** `ToothCell.tsx` `<Box onClick>` — `tabIndex`/`role`/`onKeyDown` yo'q (klaviatura yopiq); tish holati rang-only (WCAG 1.4.1); Tooltip focus qilib bo'lmaydi.
- **Fix:** `UnstyledButton`/`component="button"` + `aria-label` (tish raqami + holat nomi) + klaviatura faollashtirish. `prefers-reduced-motion` inline `scale(1.1)` hover uchun.
- **Verify:** test/render — tooth cell `button` role + aria-label.

### F5 — A11y + focus + contrast batch (High)
- **Muammolar:**
  - ~13 nomsiz ikon-only `ActionIcon` (ko'pi destructive) — UsersSettings(3), Roles, Branches, lab-orders/prescriptions/PlanFormModal trash, expenses delete/CategoryManager, ImageCard zoom → `aria-label`.
  - Shell navda `:focus-visible` ring yo'q — Sidebar `.item`, Topbar `.ws`/`.search`/`.lang`/`.prof`, BranchSwitcher, StateView retry → token ring qo'shish.
  - Navbat statusi rang-only (`QueueCard` Badge) → status matni/aria.
  - Search/filter inputlar placeholder-only → `aria-label`.
  - `--text-3` kontrast AA dan o'tmaydi (oq fonda ~2.85:1) → `tokens.css` `--text-3` ni AA (≥4.5:1) ga qoraytirish, hisoblab tasdiqlash (light + dark).
  - Input `invalid` `aria-invalid` qo'ymaydi; `danger` Button hover yo'q.
  - div/row `onClick` keyboardsiz (StockItemsTable, ImageCard, OnboardingChecklist) → `role/tabIndex/onKeyDown` yoki `UnstyledButton`.
- **Fix:** yuqoridagilar. Token o'zgarishi global — ehtiyotkor.
- **Verify:** kontrast nisbatini hisoblash (AA pass); aria-label grep; test render focus.

### F6 — Reports doctor name (High)
- **Muammo (H2):** doctor-workload jadvali xom UUID chiqaradi (`ReportsScreen.tsx` `{d.doctorId}`).
- **Fix:** doctor name lookup (mavjud `useDoctors()` / `GET /appointments/doctors` — CLI-154) bilan UUID→ism map. Topilmasa fallback (qisqartirilgan id).
- **Verify:** render — ism ko'rsatiladi.

### F7 — Cashier money safety (High)
- **Muammolar:**
  - Refund modali tranzaksiya tafsilotisiz (summa/bemor/chek) (H5) → modal body'ga detallar.
  - POS narx `min=0, max yo'q` (0/ortiqcha to'lov) (H4) → mantiqiy chegaralar.
  - Rejim almashganda savat/chegirma yo'qoladi ogohlantirishsiz (H4) → ogohlantirish yoki holat saqlash.
  - `PlanBillingPanel` `so'm` suffix yo'q → F2 helper bilan birxillashtirish.
- **Verify:** test/render — refund modal detallarni ko'rsatadi.

### F8 — Interaction safety: double-submit + overflow/truncation (Medium)
- **Muammolar:**
  - Double-submit guard yo'q: `PatientsListScreen` archive, `QueueCard` status tugmalari → `disabled={mut.isPending}`.
  - Uzun ism truncation yo'q: PatientsList `.name`, PatientCard header, QueueCard, UsersSettings cell → ellipsis/lineClamp.
- **Verify:** render — pending paytida disabled; CSS ellipsis mavjud.

### F9 — Responsive pass (Medium, desktop-defensible)
- **Muammolar:** kalendar grid responsive strategiyasiz (`CalendarGrid.module.css`); jadvallar `Table.ScrollContainer`/overflow-x yo'q (~19 jadval); toolbar fixed-width inputlar RU matnda overflow (kassa/audit).
- **Fix:** kalendarga overflow-x + min-width container; asosiy jadvallarga scroll container; toolbar `Group` `wrap`. Desktop-birinchi, konservativ.
- **Verify:** kod — overflow handling mavjud.

### F10 — Polish & nits batch (Low)
- `prefers-reduced-motion` global reset (`styles.css`); skip-link main'ga; `⌘K` hint cross-platform (Mac/non-Mac); `BranchSwitcher` `atob` base64url-safe (try/catch); teal shkala dedup (tokens.css ↔ mantine-theme yagona manba yoki test); GenericDashboard `🚀` → i18n/olib tashlash; `Badge` vs `Tag` birxillashtirish (klinik); status rang nomarkazligini markazlashtirish.
- **Verify:** kod review + lint.

### F11 — Subjective/creative (Medium, minimal + OXIRIDA)
- **Muammolar:** dashboard differentiation (Doctor/Assistant/Receptionist deyarli copy-paste) + lokal `StatCard` → `@dental/ui StatCard` (icon/unit/delta/accent); micro-interaction motion (transform-based hover/lift); spacing tokenlari (`--space-*`) primitivlarga; odontogram surface recording (MOD/buccal — feature gap).
- **Yondashuv:** konservativ, minimal, qaytariladigan. Real `StatCard` primitiviga o'tish + accent — eng katta "generic→designed" richagi. Motion/spacing — minimal. Surface recording — alohida kichik picker (agar vaqt/risk yo'l qo'ysa; aks holda alohida deferred task).
- **Verify:** typecheck + build + visual code review.

## 5. Doc-sync (har task fix'idan keyin)

Har merge'dan oldin (commit ichida):
- **Obsidian** `04-Progress.md` — task natijasini qo'shish (absolyut sana 2026-06-14).
- **Obsidian** `01-Qarorlar.md` — agar arxitektura qarori bo'lsa (masalan global mutation toast, formatCurrency konvensiyasi).
- **CLAUDE.md** — agar konvensiya/pattern o'zgarsa (masalan formatCurrency helper, mutation toast).
- **Linear task** — `In Progress` → fix → `Done`, PR linki qo'shilgan.

## 6. Git workflow (har task)

```
git checkout main && git pull
git checkout -b fix/cli-<n>-<slug>
# ... fix + doc-sync ...
# verify gate (lint/typecheck/test/build) — yashil
git commit (conventional, Co-Authored-By trailer)
gh pr create
# verify yashil → gh pr merge --squash --delete-branch
# Linear → Done
```

## 7. Bog'liqliklar / tartib

1. F1 (mutation toast) — foundation
2. F2 (formatCurrency) — foundation
3. F3 (StateView rollout) — foundation pattern
4. F4 (odontogram a11y) — critical
5. F5 (a11y/focus/contrast batch)
6. F6 (reports doctor name)
7. F7 (cashier money safety) — F2 ga tayanadi
8. F8 (interaction safety)
9. F9 (responsive)
10. F10 (polish nits)
11. F11 (subjective — oxirida, minimal)

## 8. Scope tashqarisi / qaror

- **Backend o'zgarishlar:** yo'q. F6 doctor-name — frontend lookup (mavjud endpoint).
- **Odontogram surface recording:** feature gap (bug emas). F11 ichida minimal yoki risk yuqori bo'lsa alohida deferred Linear task sifatida qoldiriladi.
- **Mobile/tablet to'liq responsive:** scope tashqarisi (desktop-birinchi, by-design). F9 faqat overflow/breakage'ni hal qiladi.
