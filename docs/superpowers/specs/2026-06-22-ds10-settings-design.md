# DS10 — Settings (6 sections) — Dental OS re-skin — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS10 (Sozlamalar — 6 bo'lim)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Dizayn manbasi:** `Dental OS.dc.html` (claude.ai/design), settings render `'settings'` (`scrSettings`)
**Gap brief:** `docs/superpowers/briefs/ds10-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), DS0 keystone (tokens/shell/primitives LOCKED)

---

## 1. Maqsad va doira

DS10 — settings feature shell'i + 5 non-user bo'limni Dental OS dizayniga **front-end-only re-skin** qiladi va 2 ta net-new statik bo'lim (Notifications, Integrations) qo'shadi. Funksiya, API kontraktlari, i18n semantikasi, permission/vertical gating O'ZGARMAYDI (Qaror #33). Forms `@mantine/form` + `zod4Resolver` qoladi.

**Doirada (FAQAT shu fayllar — `apps/web/src/features/settings/`):**
- `components/SettingsShell.tsx` (+ test) — nav frame qayta yoziladi (horizontal pill Tabs → 212px sticky left-nav, 4→6 element).
- `components/RolesSettingsScreen.tsx`, `components/PermissionBuilder.tsx`, `components/RoleFormModal.tsx` (+ testlar) — master-detail + pill-toggle permission grid.
- `components/TenantSettingsScreen.tsx` — single-card re-skin + vertical segmented toggle.
- `components/BranchesSettingsScreen.tsx` — CSS-grid jadval re-skin.
- `components/NotificationsSettingsScreen.tsx` (+ test) — **NET-NEW statik**.
- `components/IntegrationsSettingsScreen.tsx` (+ test) — **NET-NEW statik**.
- `settings.routes.tsx` — `/settings/notify` + `/settings/integrations` route'lari qo'shiladi.
- `packages/i18n/src/locales/{uz,ru}.json` — **faqat designated i18n task** tegadi (shared serial resurs).

**Doiradan TASHQARI (INVARIANT — tegilmaydi):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*` (tokenlar/primitivlar — DS0 LOCKED).
- `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts` (DS0 LOCKED).
- `components/UsersSettingsScreen.tsx` + `components/StaffProfileModal.tsx` — **DS9 OWNS**. DS10 bularga TEGMAYDI.
- `settings.api.ts`, `settings.keys.ts`, `settings.schema.ts`, `settings.mappers.ts`, `settings.types.ts` — data qatlam o'zgarmaydi. Yangi hook YO'Q, yangi endpoint YO'Q, migration YO'Q.
- `components/ConfirmModal.tsx` — shared, o'zgarmaydi.
- Backend — TEGILMAYDI.

## 2. Qulflangan qarorlar (brainstorm)

| # | Qaror |
|---|---|
| Re-skin chegarasi | Front-end-only; data hook/API/i18n-semantika/permission gating saqlanadi (#33). |
| Net-new bo'limlar | Notifications + Integrations = **statik chrome** (V3 scaffold posturasi). Hook YO'Q, persist YO'Q, toggle = lokal `useState` (vizual). i18n QO'SHILADI (front-end). |
| Roles flow o'zgarishi | Modal→inline + Checkbox→toggle = re-presentatsiya. Funksiya saqlanadi (bir xil `usePermissions` ~46 real perm, dinamik `groupPermissionsByResource`, bir xil `useUpsertRole` payload). #33 ostida himoyalanadi — alohida milestone'ga ESKALATSIYA QILINMAYDI. Mockup'ning 5 hardcoded kategoriyasiga PIN QILINMAYDI. |
| Status indikatorlari | Design `chip(tone)` → `StatusPill` (`@dental/ui`; enum `neutral/success/warning/danger/info/accent` design tonlariga mos). "Tizim shabloni" = yorliq (status emas) → `Tag`. Raw off-token rang YO'Q (STATUS-INDICATORS.md). |
| Shrift tokenlari | Kod `var(--font-sans)` / `var(--font-mono)`. Design `var(--ui)` / `var(--mono)` aliaslar MAVJUD EMAS. |
| Dark kontrast | Toggle knob ON = `--on-primary` (#FFFFFF light / #04130F dark), OFF = `--ink-3`. Brand fill'da `#fff` HARDCODE QILINMAYDI (DS0/CLI-80 WCAG AA). |
| `SettingsShell` kontrakt | Yangi dizaynda `PageHead` YO'Q va shell-darajali `actions` slot YO'Q. Har bo'lim o'z header amalini o'z kartasida render qiladi (§3.7). |
| Route fayli yagona egasi | `settings.routes.tsx` — **bitta task** (route-wiring) egasi; net-new ekranlardan keyin tushadi (ularni import qiladi). Shell frame route import QILMAYDI → mustaqil kompilyatsiya, oldin tushadi. |

## 3. Komponent-bo'yicha dizayn

### Token cheat-sheet (DS0 mavjud)
`--primary`, `--primary-soft`, `--on-primary`, `--ink`, `--ink-2`, `--ink-3`, `--border`, `--border-strong`, `--surface`, `--surface-2`, `--success`, `--warning`, `--violet`, `--shadow-sm`, `--font-sans`, `--font-mono`.
O'lchamlar: karta radius 16, input radius 10 / height 42, nav button radius 9, role button radius 10, toggle 38×22 (knob 18, inset 2px), karta header padding `16px 18px`, jadval header band `--surface-2` uppercase `11px/700`.

### 3.1 SettingsShell — left-nav frame (T2)

- Tashqi grid: `display:grid; grid-template-columns:212px minmax(0,1fr); gap:20px; align-items:start; animation:fadeUp .2s ease; padding:24px`. `PageHead` + horizontal `Tabs variant="pill"` OLINADI.
- **Left-nav** (212px, `position:sticky; top:0`):
  - Eyebrow: `11px/700 uppercase; letter-spacing:.06em; color:var(--ink-3); padding:4px 12px 8px` → `t('settings.title')` ("Sozlamalar").
  - **6 nav button** (`SettingsTab` superset): `tenant`→`nav_tenant`, `branches`→`nav_branches`, `roles`→`nav_roles`, `users`→`nav_users`, `notify`→`nav_notify`, `integrations`→`nav_integrations`. Tartib: tenant, branches, roles, users, notify, integrations.
  - Active button: `padding:9px 12px; margin:1px 0; border:none; border-radius:9px; background:var(--primary-soft); color:var(--primary); font-weight:600; font-size:13.5px`.
  - Inactive: `background:transparent; color:var(--ink-2); font-weight:500`, hover `{ background:var(--surface-2); color:var(--ink) }`.
  - Navigatsiya: button `onClick` → `navigate(path)` (mavjud naqsh saqlanadi).
- **Permission gating O'ZGARMAYDI:** `useAuthStore().hasPermission(tab.permission)` bilan filtr. Yangi 2 element permission'i: `notify` → `tenant_settings.view` (klinika-darajali sozlama, Tenant Admin), `integrations` → `tenant_settings.view`. (Yangi permission code YO'Q — mavjudini qayta ishlatadi.)
- **`SettingsTab` tipi:** `'tenant' | 'roles' | 'branches' | 'users' | 'notify' | 'integrations'`.
- **Kontrakt (DS9 bilan):** DS9 `active="users"` uzatishni davom ettiradi va shell'ga TEGMAYDI. `UsersSettingsScreen.tsx` (DS9-owned, forbidden) HOZIR `<SettingsShell active="users" actions={actions}>` chaqiradi → **`actions?: ReactNode` prop tipi SAQLANISHI SHART** (backward-compatible), aks holda DS9 fayli typecheck'da yiqiladi (verify gate). Yangi dizayn `actions`'ni render QILMAYDI (yoki e'tiborsiz qoldiradi), ammo signature'dan OLIB TASHLANMAYDI. DS10 o'z bo'limlari (T3/T5) `actions` uzatishni TO'XTATADI va amalni o'z kartasiga ko'chiradi (§3.8); DS9'ning `actions` uzatishi kompilyatsiya bo'lib qoladi (e'tiborsiz). (Tekshirildi: `ServicesScreen` o'z `PageHead`'ini ishlatadi, `SettingsShell`'ni EMAS → ta'sirlanmaydi.)

### 3.2 Roles — master-detail + pill-toggle grid (T3)

`RolesSettingsScreen.tsx` flat-table + modal'dan ikki-panel inline'ga.

- Grid `266px minmax(0,1fr); gap:16px`.
- **Chap panel** (rol ro'yxat kartasi, radius 16, `--shadow-sm`): header "Rollar" (`useRoles()`) + 28×28 `+` icon-button (`role.manage` gated, `t('roles.create')`). Body `padding:8px`. Har rol button (`roles.data`):
  - Active: `border:1px solid var(--primary); border-radius:10px; background:var(--primary-soft)`; nom `color:var(--primary); font-weight:700`; type-chip ("Tizim shabloni"/"Maxsus" → `Tag`); desc `11px var(--ink-2)`; users qatori `t('settings.role_users', {count}) 11px var(--ink-3)`. **Users-count manbai:** `useUsers()` assignment'laridan `roleId` bo'yicha client-side hisob (Branches CLI-159 naqshi); hook yo'q bo'lsa qatorni omit.
  - Inactive: transparent border, hover `surface-2`.
  - Tanlangan rol lokal `useState<Role|null>` (birinchi rol default).
- **O'ng panel** (permission grid kartasi, radius 16): header — rol nomi `16px/700` + agar `isSystem` → neytral "Tizim shabloni" pill (`Tag`, `t('roles.system_template')`); subtitle `t('settings.role_perm_count', {desc, count})`. O'ng tomonda **inline** "Nusxalash" (outline, `t('settings.copy')`) + "Saqlash" (`background:var(--primary); color:var(--on-primary)`, `t('common.save')`). Body `padding:6px 18px 18px`.
- **Permission grid** (`<PermissionBuilder>` qayta ishlatiladi, §3.3): dinamik `groupPermissionsByResource(usePermissions())` — **5 hardcoded kategoriyaga PIN QILINMAYDI**. Kategoriya label `t('settings.perm_group.{resource}', resource)`.
- **Save inline** (modal emas): `useUpsertRole()` mavjud payload bilan (`{ id, name, description, permissions: [...selected] }`). Tanlangan ruxsatlar `Set<string>` lokal state.
- **RoleFormModal** (`RoleFormModal.tsx`) — **default arxitektura (executor tanlamaydi):** chap-panel `+` button `RoleFormModal`'ni **faqat name/description** (yangi rol yoki nom tahriri) uchun ochadi; permission-tanlash endi inline o'ng panelda (`<PermissionBuilder>` toggle grid). Modal'dan `<PermissionBuilder>` OLIB TASHLANADI (yoki modal yangi-rol uchun name+desc'gacha qisqaradi). **Invariant:** `useUpsertRole` payload (`{id,name,description,permissions[]}`) va `roleSchema` validatsiya (`@mantine/form` + `zod4Resolver`) O'ZGARMAYDI — permission'lar inline panel `Set<string>`'idan keladi.

### 3.3 PermissionBuilder — Checkbox → pill toggle (T3)

`PermissionBuilder.tsx` Mantine `Checkbox` (group + child, mono `code` ko'rsatadi) → pill-toggle qator.

- Har kategoriya: uppercase label (`11px/700; letter-spacing:.05em; color:var(--ink-3)`).
- Har perm qatori: `display:flex; justify-content:space-between; padding:9px 0; border-top:1px solid var(--border)` — chap: perm label (`13px var(--ink)` — `i18n.language==='ru' ? p.descriptionRu : p.descriptionUz`, fallback `p.code`); **mono `code` endi KO'RSATILMAYDI** (faqat label).
- O'ng: **pill toggle 38×22** (knob 18, inset 2px): ON = `background:var(--primary)`, knob o'ngda `background:var(--on-primary)`; OFF = `background:var(--surface-2); border:1px solid var(--border)`, knob chapda `background:var(--ink-3)`. `role="switch"` + `aria-checked` + `aria-label={label}`.
- **Invariant:** signature `{ permissions, selected:Set<string>, onChange }` saqlanadi; toggle = bir xil `Set<string>`'ning re-presentatsiyasi. Group-toggle (kategoriya bosh checkbox) ixtiyoriy — agar olib tashlansa, characterization test faqat per-perm toggle xulqini tasdiqlaydi.

### 3.4 Clinic-info — single card + segmented vertical (T4)

`TenantSettingsScreen.tsx` uch stacked Card → bitta `max-width:620px` karta (+ transfer karta saqlanadi).

- Karta `padding:22px; max-width:620px; border-radius:16px`. Title `t('tenant_settings.clinic_section')` yoki "Klinika ma'lumotlari".
- Form grid `1fr 1fr; gap:14px`: Klinika nomi (span 2), Slug (mono input, read-only ko'rinish), Asosiy til (Select), **Vertical = segmented ikki-button toggle** (span 2):
  - "Stomatologiya" (`t('tenant_settings.vertical_dental')`) active = `border:1.5px solid var(--primary); background:var(--primary-soft); color:var(--primary)`.
  - "Umumiy klinika" (`t('tenant_settings.vertical_general')`) inactive = `border:1.5px solid var(--border); background:var(--surface)`.
  - `settingsForm.getInputProps('vertical')` qiymatini boqadi (Select o'rniga ikki-button; bir xil `'dental'|'general'`).
- **PRESERVE (#33 — demo'ga shrink QILINMAYDI):** `currency` (`TextInput`), `reminderLeadHours` (`NumberInput`), `defaultLanguage` (`Select`), va **transfer-ownership** karta + modal + confirm oqimi. Demo bularni omit qiladi — DS10 ularni dizayn-uslubida ICHIGA stillab joylashtiradi, tashlamaydi.
- Inputlar: `height:42px; border-radius:10px; background:var(--surface-2)`, focus `{ borderColor:var(--primary); background:var(--surface) }`.
- Footer qatori: subscription line (`data.subscriptionStatus` + token chip via `StatusPill` `success/warning`) + "Saqlash" primary button.
- **Invariant:** `useUpdateTenant`/`useUpdateTenantSettings`/`useTransferOwnership` hook'lar, `tenantSchema`/`tenantSettingsSchema`/`transferSchema`, permission gating (`tenant.edit`, `tenant_settings.edit`) O'ZGARMAYDI.

### 3.5 Branches — CSS-grid jadval (T5)

`BranchesSettingsScreen.tsx` Mantine `Table` → design CSS-grid 5-ustun jadval.

- Karta radius 16; header "Filiallar" + "Yangi filial" primary button (`branch.create` gated, `t('branches.create')`).
- Grid 5 ustun `minmax(0,1fr) minmax(0,1.3fr) 150px 110px auto` (Nomi / Manzil / Telefon / Xodimlar / Holat).
- Header band `background:var(--surface-2)` uppercase `11px/700`.
- Telefon = mono (`var(--font-mono)`); xodim soni o'ng-tekis mono; status chip o'ng-tekis. Xodim soni `t('branches.staff_n', {n})` — **client-side (CLI-159)** mavjud `useMemo` hisob SAQLANADI.
- Status chip → `StatusPill` (`count>0 ? 'success' : 'neutral'` yoki aktiv holat). Raw `Badge color` off-token YO'Q.
- Edit/delete amallari (`branch.edit`/`branch.delete` gated) + create/edit `Modal` (`PhoneInput`) + `ConfirmModal` SAQLANADI.
- **Invariant:** `useBranches`/`useUpsertBranch`/`useDeleteBranch`/`useUsers`, `branchSchema` O'ZGARMAYDI.

### 3.6 Notifications — net-new statik (T6)

Yangi `components/NotificationsSettingsScreen.tsx`. **Hook YO'Q, API YO'Q, persist YO'Q** (DS12 deferred — `ds12-deferred-backend.md` §DS10).

- `<SettingsShell active="notify">` ichida karta `max-width:680px; border-radius:16px`. Title `t('settings.notify_title')`.
- Statik pref ro'yxat (lokal massiv, i18n kalitlardan): har qator `padding:14px 18px; border-top:1px solid var(--border)` — nom `13.5px/600` + desc `12px var(--ink-3)` chapda, **38×22 pill toggle** (PermissionBuilder bilan bir xil token uslubi: ON `--primary`/knob `--on-primary`, OFF `--surface-2`/knob `--ink-3`) o'ngda.
- Toggle = lokal `useState` (vizual, hech qanday API chaqirmaydi).
- Pref'lar (i18n): `notify_pref_appointment` (eslatma), `notify_pref_recall`, `notify_pref_birthday`, `notify_pref_lab` — har biri `_title`/`_desc`. (Aniq ro'yxat T1 i18n task'da qulflanadi.)
- Permission gating: shell `notify` element `tenant_settings.view` bilan gated; ekran qo'shimcha guard talab qilmaydi.

### 3.7 Integrations — net-new statik (T7)

Yangi `components/IntegrationsSettingsScreen.tsx`. **Hook YO'Q, API YO'Q** (DS12 deferred).

- `<SettingsShell active="integrations">` ichida karta-grid `repeat(2,1fr); gap:14px`.
- Har karta (radius 16, `padding:18px`): 40×40 icon tile (`background:var(--surface-2)`) + status chip yuqori qatori (`StatusPill` `success`=ulangan / `neutral`=ulanmagan), nom `14px/700`, desc `12.5px var(--ink-3)`, keyin setup button — `on` → "Sozlash" (outline, `t('settings.integration_configure')`), `off` → "Ulash" (primary `--primary`/`--on-primary`, `t('settings.integration_connect')`).
- Statik kartalar (i18n): Eskiz.uz SMS, Telegram bot, Soliq.uz fiskal, 1C eksport — har biri `_name`/`_desc`. Button no-op yoki mavjud settings'ga link (yangi endpoint YO'Q).
- Icon: mavjud `lucide-react` (yoki `@tabler/icons-react`) eng yaqin ikonka. Yangi ikonka tizimi YO'Q.

### 3.8 Shell `actions` kontrakti (barcha bo'lim task'lari uchun)

Yangi `SettingsShell` shell-darajali `actions` slot'ni RENDER QILMAYDI (dizaynda `PageHead`/topbar-action yo'q). **Lekin `actions?: ReactNode` prop tipi SAQLANADI** (backward-compat — DS9'ning `UsersSettingsScreen` uni uzatadi va DS10 o'sha faylga tegmaydi; olib tashlash typecheck'ni buzadi). Har bo'lim o'z header amalini (roles "+", branches "Yangi filial") o'z **kartasi header**'ida render qiladi. T2 shell signature'ni shu shaklda pin qiladi (prop qabul qilinadi, ammo e'tiborsiz/render qilinmaydi); T3/T4/T5/T6/T7 amalni shell'ga uzatish O'RNIGA o'z kartasiga joylashtiradi. Bu fayl-konflikt emas — barcha bo'lim task'lari rioya qiladigan KONTRAKT.

## 4. i18n kalitlar (T1 — yagona egasi, BIRINCHI tushadi)

Quyidagilar `packages/i18n/src/locales/uz.json` VA `ru.json`'ga qo'shiladi. Mavjud kalitlar QAYTA ISHLATILADI (`settings.perm_group.*` kategoriyalar, `tenant_settings.vertical_dental/general`, `roles.create`, `common.save`/`common.cancel`) — DUPLIKAT QILINMAYDI.

**`settings.*`:**
- `nav_notify` ("Bildirishnomalar" / "Уведомления"), `nav_integrations` ("Integratsiyalar" / "Интеграции").
- `role_users` ("{{count}} foydalanuvchi"), `role_perm_count` ("{{desc}} · {{count}} ruxsat"), `copy` ("Nusxalash" / "Копировать").
- `notify_title` ("Bildirishnoma sozlamalari"), `notify_pref_{appointment,recall,birthday,lab}_{title,desc}`.
- `integration_configure` ("Sozlash"), `integration_connect` ("Ulash"), `integration_{eskiz,telegram,soliq,onec}_{name,desc}`, `integration_status_connected`/`integration_status_off`.

**`roles.*`:**
- `system_template` ("Tizim shabloni" / "Системный шаблон").

> Aniq kalit ro'yxati va ikkala-til parity T1'da yakuniylanadi. T2/T3/T6/T7 testlari tarjima qilingan stringlarni assert qiladi → **T1 birinchi tushishi SHART** (aks holda `t()` raw kalit qaytaradi, testlar yiqiladi).

## 5. Deferred / omit qilingan (DS12)

`ds12-deferred-backend.md` §DS10 ga muvofiq:
- **Notifications bo'limi** — ekran/route/i18n teriladi (front-end); API/persist DS12'ga DEFER. Toggle vizual, backend YO'Q.
- **Integrations bo'limi** — ekran/route/i18n teriladi; ulanish/holat real backend DS12'ga DEFER. Button no-op/link.

**Mockup demo-data e'tiborsiz (real manbaga ulanadi):** `PERM_CATS` (5 kat) → dinamik `groupPermissionsByResource`; `SET_ROLES` → `useRoles`; clinic-info'da demo omit qilgan currency/reminder/transfer → SAQLANADI (#33). Net-new bo'lim demo `NOTIFY_PREFS`/`INTEGRATIONS` → statik (hozir backend yo'q).

## 6. Test strategiyasi (TDD)

**Behavior-preserving — DOM o'zgaradi, xulq saqlanadi (executor uchun: bu sinishlar kutilgan):**
- `SettingsShell.test.tsx` — 4→6 nav element (DOM-query yangilanadi); navigatsiya naqshi + permission filtri (xulq) saqlanadi.
- `PermissionBuilder.test.tsx` — checkbox→toggle (role/markup yangilanadi); **xulq assert:** perm toggle qilinsa `onChange` bir xil `Set<string>`'ni beradi (checkbox bilan teng payload).
- `RoleFormModal.test.tsx` — agar modal→inline ko'chsa, markup-query yangilanadi; **xulq assert:** `useUpsertRole` payload (`{id,name,description,permissions[]}`) saqlanadi (characterization).

**Yangi testlar:**
- Roles master-detail: rol tanlash o'ng panelni almashtiradi; "Tizim shabloni" `Tag` faqat `isSystem` rolda; save `useUpsertRole`'ni mavjud payload bilan chaqiradi.
- Tenant: vertical segmented toggle `'dental'↔'general'` form qiymatini o'zgartiradi; currency/reminder/transfer hali render bo'ladi (preserve guard).
- Branches: 5-ustun grid render; client-side staff count (CLI-159) saqlanadi.
- Notifications: pref qatorlari render; toggle lokal (API chaqirilmaydi — mock spy bo'sh).
- Integrations: 4 karta render; Sozlash/Ulash button holat bo'yicha; no-op.

**Verify (har task yashil):**
- `typecheck` · `biome` · `turbo test --filter @dental/web`.
- **Dark-mode WCAG (DS0/CLI-80):** toggle knob (ON `--on-primary` on `--primary`, OFF `--ink-3` on `--surface-2`), primary tugmalar (Saqlash/Ulash/Taklif), `--primary-soft`/`--primary` active state — light + dark kontrast tekshiriladi. `#fff` hardcode YO'Q.
- Vizual side-by-side dizaynga (light + dark).
- **Permission gating regression:** `notify`/`integrations` nav `tenant_settings.view` siz rolga ko'rinmaydi; mavjud 4 element gating o'zgarmagan.

## 7. Xavf-xatarlar

- **DS9/DS10 sequencing (load-bearing):** DS9 re-skinned users jadvali DS10 yangi shell'i ICHIDA render bo'ladi. **T2 (shell) DS9 users re-skin'idan OLDIN tushishi** kerak (yoki koordinatsiya). Hard kontrakt: DS10 `SettingsTab` kengaytiradi (+notify|integrations); DS9 `active="users"` saqlaydi va `SettingsShell.tsx`'ga TEGMAYDI.
- **`settings.routes.tsx` shared fayl:** brief T1/T5/T6 hammasi route qo'shadi — DISJOINT EMAS. Hal: yagona **T8 route-wiring** task egasi (net-new ekranlardan keyin tushadi, ularni import qiladi). Shell frame (T2) route import QILMAYDI → mustaqil, oldin tushadi.
- **i18n serial:** T2/T3/T6/T7 testlari tarjima stringlarni assert qiladi → T1 i18n BIRINCHI. T1 barcha kalitlarni o'z ichiga oladi (self-contained).
- **Roles #33 tension:** modal→inline + checkbox→toggle flow/control o'zgarishi, ammo funksiya saqlanadi → #33 ostida himoyalanadi. Bitta task, eng chuqur komponent-bo'yicha; alohida milestone'ga eskalatsiya YO'Q. Mockup 5 kategoriyaga PIN QILINMAYDI.
- **Dark kontrast (CLI-80):** toggle knob aniq `--on-primary`/`--ink-3` (literal `#fff` EMAS). Users-avatar `#fff` gradient = DS9 fayli, doiradan tashqari.
- **Status chip → StatusPill:** off-token raw rang YO'Q. "Tizim shabloni" = `Tag` (yorliq, status emas).

## 8. Bajarish tartibi (plan uchun)

1. **T1 i18n** (yagona egasi, BIRINCHI — keyingi task testlari boqadi).
2. **T2 shell frame** (route import qilmaydi; DS9'dan oldin tushishi kerak).
3. **T3 roles** (eng katta — master-detail + toggle grid; T1 kalitlarini ishlatadi).
4. **T4 tenant** · **T5 branches** (parallel — disjoint fayllar).
5. **T6 notify** · **T7 integrations** (parallel — net-new, disjoint).
6. **T8 route-wiring** (`settings.routes.tsx` — net-new ekranlardan SO'NG; T2 + T6 + T7 ga bog'liq).
