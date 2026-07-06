# UI Vizual Audit — Frontend (2026-06-27)

> **Scope:** FAQAT vizual/UI nomuvofiqliklar. UX, funksional yoki content o'zgarishi YO'Q.
> **Metod:** 5 parallel read-only agent (layout · page-header · spacing · surfaces · typography), har topilma `fayl:satr` bilan tasdiqlangan. Hech narsa o'zgartirilmadi.
> **Holat:** Tuzatish QILINMAGAN — foydalanuvchi qaysi topilmalarni tuzatishni o'zi belgilaydi.

Token shkalasi (kontekst uchun): spacing `xs=10 sm=12 md=16 lg=20 xl=32`; radius `--radius-xs:5 -sm:6 --radius:8 -md:9 -lg:12 -xl:14` (**16px uchun token YO'Q**); shrift `--font-sans` Hanken Grotesk + `--font-mono` JetBrains Mono; og'irlik `--fw-regular/medium/semibold/bold` = 400/500/600/700.

---

## 🔴 YUQORI — eng ko'zga tashlanadigan tizimli nomuvofiqliklar

### A1. Content kengligi: yarmi `Container size="xl"` (markazda, ~1320px), yarmi fullwidth
**(foydalanuvchi ko'rgan asosiy muammo — 3 agent mustaqil tasdiqladi)**

Shell (`shell/AppShell.tsx:18`) faqat `padding="md"` (16px) beradi, content kengligini cheklamaydi. Natijada keng monitorda sahifadan sahifaga content kengligi keskin sakraydi.

- **Cheklangan (`<Container size="xl">`):** `cashier/CashierScreen.tsx:47`, `services/ServicesScreen.tsx:61`, `audit/AuditScreen.tsx:101`, `expenses/ExpensesScreen.tsx:103`, `stock/StockScreen.tsx:57`, `payroll/PayrollScreen.tsx:73`, `reports/ReportsScreen.tsx:201`, `queue/QueueBoard.tsx:77`
- **Fullwidth (Container yo'q):** `appointments/CalendarScreen.tsx:176`, `patients/PatientsListScreen.tsx:40`, `patients/PatientCard.tsx:99`, `schedule/ScheduleScreen.tsx:44`, barcha `settings/*`, barcha 6 rol dashboard (`dashboard/components/*Dashboard.tsx`)

**Taklif:** yagona yondashuv — yo hammasi `Container size="xl"`, yo shell darajasida bitta max-width qatlam.

### A2. Settings ikki barobar padding + capsiz
`settings/components/SettingsShell.tsx:118` root grid'da `padding: 24` — bu AppShell `padding="md"` (16px) ustiga qo'shiladi → settings gutter ≈40px, boshqa fullwidth sahifalarda 16px. Grid (`212px minmax(0,1fr)`) capsiz.
**Taklif:** qo'shimcha `padding:24` ni olib tashlab yagona shell gutter'ga tayanish.

### A3. PatientNewScreen chap chetga yopishgan (markazlashmagan cap)
`patients/components/PatientNewScreen.module.css:3` — `.form { max-width: 1140px }`, lekin `margin: 0 auto` YO'Q. Keng ekranda o'ngda katta asimmetrik bo'sh joy. Ustiga 1140 ≠ 1320 (`xl`).
**Taklif:** markazlashtirish + cap qiymatini umumiy shkala bilan birlashtirish.

### B1. Sahifa sarlavhasi ikki marta chiqadi (Topbar + in-screen) — ba'zan farqli matn bilan
**(2 agent tasdiqladi)** — Topbar har doim `pageTitle` ko'rsatadi (`shell/Topbar.tsx:36`), lekin ~10 ekran yana o'z `PageHead`/sarlavhasini render qiladi; dashboardlar esa qasddan in-screen sarlavhani bermaydi (`ManagerDashboard.tsx:149`) → to'g'ridan-to'g'ri qarama-qarshilik.

Dublikat sarlavha: `cashier/CashierScreen.tsx:49`, `services/ServicesScreen.tsx:63`, `reports/ReportsScreen.tsx:203`, `stock/StockScreen.tsx:59`, `audit/AuditScreen.tsx:103`, `payroll/PayrollScreen.tsx:75`, `expenses/ExpensesScreen.tsx:105`, `schedule/ScheduleScreen.tsx:45`, `appointments/CalendarScreen.tsx:177`, `patients/PatientsListScreen.tsx:43`.

**Matn FARQ qiladi:** Appointments → Topbar "Kalendar" / PageHead "Yozilishlar"; Patients → "Bemorlar ro'yxati" / "Bemorlar"; Services → "Xizmatlar va narxlar" / "Xizmatlar katalogi" (`nav-config.ts:49,64,119` ↔ Screen'lar).

**Taklif:** bitta konvensiya (yo Topbar, yo in-screen PageHead) + bir sahifa = bitta i18n kalit manbasi.

### B2. `/settings/notify` va `/settings/integrations` sahifalarida sarlavha umuman yo'q
Bu ikki path `nav-config.ts` da yo'q → Topbar `app.name` fallback ko'rsatadi (`use-page-title.ts:15`), `SettingsShell.tsx:95` esa h1 bermaydi.
**Taklif:** bu pathlarni nav-config'ga qo'shish yoki SettingsShell'ga sarlavha berish.

### C1. Karta radiusi 4 xil qiymatda + token bo'lmagan 16px 18+ faylda tarqalgan
**(asosiy surface muammosi)** — bir xil "panel-karta" sirti:
- `@dental/ui Card` primitivi → **14px** (`--radius-xl`)
- Qo'lda yasalgan → **16px** (token YO'Q): `CARD_RADIUS=16` const 5 faylda (`dashboard/ManagerDashboard.tsx:82`, `AccountantDashboard.tsx:18`, `widgets/QueueCard.tsx:58`, `widgets/ScheduleList.tsx:67`, `widgets/StatCard.tsx:60`); inline `borderRadius:16` yana 13+ joyda (`GenericDashboard.tsx:8`, barcha `settings/*`, `odontogram/OdontogramTab.tsx:234,252,398,561,581`, `lab-orders/LabOrdersTab.tsx:144`, ...)
- Schedule kartalari → **9px** (`--radius-md`)
- Reports/audit/billing Mantine `radius="md"` → **8px**

**Taklif:** `tokens.css` ga yagona `--radius-card` (masalan 16px) kiritib hamma kartani shunga (yoki primitiv `Card`'ga) ko'chirish — DS token-remap-in-place faqat shunda 16px'ni qamrab oladi.

### D1. Karta/panel sarlavhasi 6+ xil usul va o'lcham
Bir xil "karta sarlavhasi" roli: `<Title order={4}>` (18px), `order={5}` (`stock/MovementHistory.tsx:29`), `<Text fw={700} fz={16}>` (`TenantSettingsScreen.tsx:166,292`), `fw={700} style fontSize:16` (`BranchesSettingsScreen.tsx:96`, `NotificationsSettingsScreen.tsx:84`), `fw={700} fz="md"` (`AccountantDashboard.tsx:153`, `ManagerDashboard.tsx:224`), raw `<span style fontSize:14/14.5>` (`widgets/QueueCard.tsx:81`, `widgets/ScheduleList.tsx:99`, `IntegrationsSettingsScreen.tsx:113`, `RolesSettingsScreen.tsx:108`), `fontSize:15` (`PosPanel.tsx:228`). Title vs Text vs span; 14–18px; 600 vs 700.
**Taklif:** yagona karta-sarlavha primitivi yoki doimiy `<Title order={4}>`.

### D2. Sahifa H1 uchun 3 xil davolash
`PageHead.module.css:8` 22px/700 ↔ `profile.page.tsx:79` + `GenericDashboard.tsx:24` `<Title order={2}>` ~26px/600 ↔ `PatientHeaderCard.tsx:98` `<h1>` 22px/**800**.
**Taklif:** hammasi `PageHead` (22px/700) ga.

---

## 🟡 O'RTA

### E1. Card/Paper aralash bir xil maqsadda
- @dental/ui `Card` + Mantine `Paper radius="md"` bir tab ichida yonma-yon: `RecallTab.tsx:78↔139`, `MedicalTab.tsx:144↔41`, `FamilyTab.tsx:53,108↔160,225` (14px va 8px chetlar yonma-yon)
- Schedule: `TimeOffList.tsx:82` Card ↔ `WeeklyHoursEditor.tsx:99` Paper (bir xil qator-kartasi)
- Reports/cashier/audit raw Mantine sirt ↔ patients/clinical/services @dental/ui Card
**Taklif:** panel sirtlari uchun yagona primitiv (`@dental/ui Card`).

### E2. Card/Paper padding aralash (bir sahifada ham)
`reports/ReportsScreen.tsx` `padding="lg"` va `="md"` aralash; `payroll/PayrollScreen.tsx` `="md"` va `="lg"`; `audit/AuditScreen.tsx` `p="md"` va `p="lg"`. Umumiy: `lg`×8, `md`×6, `sm`×4 bir xil "kontent kartasi" uchun.
**Taklif:** asosiy kontent kartasi = bitta qiymat (masalan `lg`).

### E3. Spacing tokenlari nomuvofiq + magic raqamlar
- Root `<Stack gap="lg">` aksariyatda, lekin `schedule/ScheduleScreen.tsx:46` `gap="md"`.
- Numeric magic gap: dashboard `<Group gap={8}>` (5+ fayl), `<Stack gap={16}>` (`ReceptionistDashboard.tsx:120,138`, `ManagerDashboard.tsx:221,242`), `TenantSettingsScreen.tsx:165,218` `gap={18}/{10}`, `mb/mt={6}`.
- `appointments/CalendarScreen.tsx:189-196` butunlay inline `style={{ gap:14, marginTop:16 }}` — token tizimidan tashqarida.
**Taklif:** numeric → token (`gap={8}→"xs"`, `gap={16}→"md"`, inline → `Group gap`).

### E4. Muted matn: `dimmed` vs `--ink-3`/`--text-3` ikki parallel tizim
`c="dimmed"` ~65 joyda (Mantine default gray) ↔ inline `color:'var(--ink-3)'` ~62 joyda + `c="var(--ink-3)"` 3 joyda. Ikki xil rang qiymati (`dimmed` ≠ `--text-3 #7a857e`).
**Taklif:** bitta manba — `mantine-theme.ts` da `dimmed` ni `var(--text-3)` ga moslash (bir joyda, churn'siz).

### E5. Pul/raqamda mono font izchil emas (DS niyatiga zid)
Mono ishlatadi: cashier/dashboard (`DailySummaryCard.tsx:48`, `PosPanel.tsx:274`, `StatCard.tsx:80`, `PatientHeaderCard.tsx:173`). Mono ISHLATMAYDI: `treatment-plans/EstimateView.tsx:88-104` (balans/total/subtotal oddiy `<Text>`).
**Taklif:** barcha pul qiymatlariga `<Mono>`/`.t-mono`.

### E6. `color="gray"`/`color="dark"` — token bo'lmagan Mantine palitra
Theme faqat `teal`+`red` belgilaydi; `gray`/`dark` Mantine defaultiga tushadi (teal-undertone `--neutral-*` ga mos emas): `queue/QueueBoard.tsx:91`, `clinical/images/ImageCard.tsx:79`, `UsersSettingsScreen.tsx:173,189`, `odontogram/OdontogramTab.tsx:199`, `NotificationBell.tsx:100`.
**Taklif:** token-asosli neytral rang.

### E7. ReceiptModal — ekran chrome'i to'liq hardcoded hex
`cashier/ReceiptModal.tsx:53-118` — overlay `#0a100e`, header `#10201c`, Print tugma `#27b49c`, va h.k. Qog'oz tanasi (print-ready) light bo'lishi o'rinli, lekin **ekranda ko'rinadigan chrome** (overlay/header/tugmalar) tokensiz, dark-mode'ga ergashmaydi, `#27b49c` brend `--teal` ga mos emas.
**Taklif:** qog'oz tanasini light qoldirib, modal chrome'ini tokenlarga ko'chirish.

### E8. Danger matn: `c="red"`/`color:'red'` vs `var(--danger)`
`treatment-plans/EstimateView.tsx:89` + ~9 joy `'red'` literal ↔ `MedicalTab.tsx:179`, `PatientHeaderCard.tsx:168` `var(--danger)`.
**Taklif:** matn ranglarida `var(--danger)` ga birlashtirish.

---

## 🟢 PAST (mayda / churn nomutanosib bo'lishi mumkin)

- **F1.** Off-shkala `fontWeight: 800` (`PatientHeaderCard.tsx:84,99,207`) — shkala 700 da tugaydi.
- **F2.** Hardcoded `fontSize` px (11/11.5/12/.../26/30) o'nlab joyda token (`--text-*`) o'rniga.
- **F3.** `fontWeight: 600` hardcode vs `var(--fw-semibold)` (`schedule/WeeklyHoursEditor.tsx:24` token ↔ ko'p joyda raqam).
- **F4.** PageHead `margin-bottom:20px` parent `Stack gap` (lg/md) bilan qo'shilib sarlavha-content oralig'i farq qiladi; Patients 16px.
- **F5.** `MovementHistory.tsx:29` `Title order={5}` ↔ qolgan karta sarlavhalari `order={4}`.
- **F6.** Settings forma cap qiymatlari ad-hoc: `maxWidth:620` (`TenantSettingsScreen.tsx:43`) vs `680` (`NotificationsSettingsScreen.tsx:71`).
- **F7.** `profile.page.tsx:75` `<Container size="sm">` (720px) — shell ichidagi yagona `sm` istisno (qolgani `xl`).
- **F8.** Divider uslubi aralash: Card `--border-subtle` ↔ ReceiptModal `1px dashed #c4ccc4`.

---

## Konsolidatsiyalangan ustuvorlik (taklif tartibi)

| # | Mavzu | Ta'sir | Taxminiy churn |
|---|---|---|---|
| 1 | **A1+A2+A3** Content kengligi/Container birxillashtirish | Yuqori (foydalanuvchi ko'rgan) | O'rta — har Screen root |
| 2 | **C1** `--radius-card` token + 16px konsolidatsiya | Yuqori | O'rta — 18+ fayl |
| 3 | **B1+B2** Sahifa sarlavhasi ikkilanishini hal qilish | Yuqori | O'rta — ~12 Screen + nav-config |
| 4 | **D1+D2** Sarlavha tipografikasini birxillashtirish | Yuqori | O'rta |
| 5 | **E1+E2** Card/Paper primitiv + padding | O'rta | O'rta |
| 6 | **E4** `dimmed`→token (1 joyda) | O'rta | Past (theme-level) |
| 7 | **E3+E5+E6+E7+E8** spacing/mono/rang tozalash | O'rta | O'rta-Yuqori |
| 8 | **F1–F8** mayda nitlar | Past | Past |

> **Eslatma:** Auth sahifalari (`features/auth/pages/*`) o'zaro izchil — nomuvofiqlik emas. `var(--primary-soft)`/`var(--surface-2)`/`var(--radius-sm)` ishlatadigan joylar to'g'ri namuna — tegmaslik kerak.
