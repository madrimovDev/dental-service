# DS6 — Kassa (POS) + Chek + (Konsent) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS6 (Dental OS pixel-parity redesign — Kassa + chek + konsent)
**Worktree:** `/home/madrimov/Projects/ds-wt-ds6`
**Gap brief:** `docs/superpowers/briefs/ds6-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Qarorlar:** #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi — RE-SKIN, RE-ARCHITECTURE EMAS), DS0 keystone (token/shell/primitive QULF), defer (2026-06-22, front-end-only re-skin)

---

## 1. Maqsad va doira

DS6 — **faqat front-end re-skin** of two features to the Dental OS design:
- `apps/web/src/features/cashier/` — POS / kassa ekrani, savat, to'lov, kunlik xulosa, tranzaksiya + **net-new print-ready chek modal**.
- `apps/web/src/features/services/` — xizmatlar katalogi (CRUD + narx) DS card chrome.

**Doirada (faqat shu fayllar tahrirlanadi):** `apps/web/src/features/cashier/**`, `apps/web/src/features/services/**`, va (faqat bitta belgilangan i18n task) `packages/i18n/src/locales/{uz,ru}.json`.

**Doiradan TASHQARI (INVARIANT — TEGILMAYDI):**
- `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `packages/ui/src/patterns/*` (token/primitive/Mono — DS0 QULF).
- `apps/web/src/shell/*`, `apps/web/src/stores/ui-store.ts` (DS0 QULF).
- `cashier.mappers.ts` — **PUL MATEMATIKASI QULF** (`computeNetTotal`, `buildCreatePayload`, `buildAllocationPayload`, `findActivePrice`, VM mapperlar). Byte-o'zgarmaydi.
- `cashier.api.ts` / `cashier.keys.ts` / `cashier.schema.ts` / `cashier.types.ts` / `cashier.routes.tsx` (data/hook/keys/zod/route) — DS6 da o'zgarmaydi.
- `services.api.ts` / `services.mappers.ts` / `services.keys.ts` / `services.types.ts` — data layer o'zgarmaydi.
- Backend / API kontrakt / migration / yangi endpoint / yangi hook — **HECH QACHON**.
- Permission gating (`cashier.view`/`cashier.create_transaction`/`cashier.refund`/`service.manage`), vertical gating, i18n kalit semantikasi — o'zgarmaydi.

**Behavior invariant:** Characterization testlar yashil qoladi: `cashier.mappers.test.ts`, `PlanBillingPanel.test.tsx`, `PosPanel.test.tsx`, `CashierScreen.test.tsx`, `TransactionsTable.test.tsx`, `services.mappers.test.ts`, `ServicesScreen.test.tsx`, `ServiceFormModal.test.tsx`, `cashier.keys.test.ts`, `services.keys.test.ts`. Re-skin uchun zarur **UI-interaksiya** testlari (qidiruv → pill; discount NumberInput → percent pill) yangilanadi (quyida §7), lekin **emitilgan payload** xulqi characterized qoladi.

---

## 2. Maqsad dizayn (gap brief §1 dan)

### 2.A POS ekran layout (`scrCashier`)
2-ustun grid: `grid-template-columns: minmax(0,1fr) 360px; gap:16px; align-items:start`. Fade-in `fadeUp .2s`.

- **CHAP — "Joriy chek" karta:** `background:var(--surface); border:1px solid var(--border); border-radius:16px; box-shadow:var(--shadow-sm); overflow:hidden`.
  - Header row (`padding:16px 18px; border-bottom`): sarlavha "Joriy chek" + o'ng tomonda bemor chip (pill — gradient 26px avatar, ism, mono `#BM-….` id).
  - Qidiruv + xizmat pillari (`padding:14px 18px; border-bottom`): 40px qidiruv input (leading search icon) + 7 quick-add pill (`height:31px; radius:99px; border; green +`, hover → `border:var(--primary); bg:var(--primary-soft); color:var(--primary)`).
  - Savat jadval: ustun-header row (`bg:var(--surface-2); 11px/700 uppercase; var(--ink-3)`): Xizmat | Narx (o'ng) | (bo'sh). Har row: nom `13.5px/600` + kategoriya sub `11.5px/var(--ink-3)`; narx o'ng `var(--font-mono)/600`; `×` remove (`28×28; radius:7px`; hover → `bg:var(--danger-soft); color:var(--danger)`).
  - Subtotal footer (`padding:14px 18px; border-top`): "Oraliq jami · {N} xizmat" + `{sum} so'm` (mono).
- **O'NG (360px) — stacked karta:** `flex-direction:column; gap:16px`.
  1. **To'lov karta** (`surface/border/radius:16px/shadow-sm/padding:18px`):
     - Summary rows: "Oraliq jami" → mono qiymat; "Chegirma" row + **percent pill** `[0 5 10 15]%` (active = `border+bg:var(--primary); color:var(--on-primary)`; inactive = `border:var(--border); bg:var(--surface); color:var(--ink-2)`).
     - 1px divider.
     - "Jami to'lov" + qiymat (`var(--font-mono)/700/22px/var(--primary)`).
     - **To'lov usuli toggle** — label "TO'LOV USULI" (uppercase, `var(--ink-3)`); `grid 3×1fr; gap:8px`; har 54px tugma (icon+label, column). Active = `border:1.5px var(--primary); bg:var(--primary-soft); color:var(--primary)`; inactive = `border:1.5px var(--border); bg:var(--surface); color:var(--ink-2)`. 3 tugma: Naqd / Karta / **O'tkazma** (§5.5).
     - **Accept** tugma: full-width 46px `bg:var(--primary); color:var(--on-primary); radius:12px; 14.5px/700`; hover → `var(--primary-strong)`; label "To'lovni qabul qilish". Caption: NoOp fiskal eslatma (`var(--ink-3)/center`).
  2. **"Bugungi kassa" karta** (`surface/border/radius:16px/shadow-sm`): "Jami tushum" + 2 stat box (`flex:1; bg:var(--surface-2); radius:10px`) — naqd/karta foiz + summa (mono).

### 2.B Chek modal (`chekOpen`) — print-ready
Overlay `rgba(10,16,14,.55); backdrop-blur(3px)`; dialog `min(420px,96vw); #fff; radius:8px; shadow-lg`.
- Dark header bar `#10201c; padding:12px 16px`: "Chek · R-…" (`'JetBrains Mono'/12.5px/600/#cfe3dd`) + "Chop etish" tugma (`#27b49c bg; #04130f`) + "Yopish" (`border:1px #2c4842; #cfe3dd`).
- Body `padding:26px 28px; #192420; 'Hanken Grotesk'`: klinika header centered, `1px dashed #c4ccc4`, bemor qatori, savat satrlari (nom `#3c4a45`, narx `'JetBrains Mono'/600`), totals (Oraliq / Chegirma · %/ JAMI `'JetBrains Mono'/700/20px`), to'lov usuli, NoOp footer.
- **Print document — fiks light palitra + literal mono/Hanken fonts. Token YO'Q. Dark-mode reaktiv EMAS.** Yagona istisno: `so'm` matni `t('common.currency')` (CLI-166).

### 2.C Konsent modal (`consentOpen`) — **DEFER, §6 ga qarang**
Dizayn print-ready konsent hujjat modali nazarda tutadi. Joriy kodda `features/cashier`/`features/services` da konsent UI **YO'Q** (yagona konsent = `features/clinical/components/consent/ConsentTab.tsx`, sign/template flow — boshqa surface). Buni qurish `features/clinical` ga tegadi → **DS6 fayl-doirasidan TASHQARI**. **Owner qarori talab qiladi — §6.**

---

## 3. Token / font cheat-sheet (DS0 dan, faqat o'qish)

> Mockup `var(--ui)` / `var(--mono)` aliaslari **MAVJUD EMAS** → `var(--font-sans)` / `var(--font-mono)` ishlatiladi.

| Mockup ishlatadi | Kodda yoziladi |
|---|---|
| `var(--ui)` | `var(--font-sans)` (Hanken Grotesk) — **faqat interaktiv POS chrome** |
| `var(--mono)` | `var(--font-mono)` (JetBrains Mono) — **faqat interaktiv POS chrome** |
| `var(--ink) / --ink-2 / --ink-3` | bir xil token nomi |
| `var(--surface) / --surface-2 / --border / --border-strong` | bir xil |
| `var(--primary) / --primary-soft / --primary-strong / --on-primary` | bir xil |
| `var(--danger) / --danger-soft` | bir xil |
| `var(--violet)` (avatar gradient) | bir xil |
| `var(--shadow-sm) / --shadow-lg` | bir xil |
| pul `so'm` matni | `t('common.currency')` — HECH QACHON hardcode |
| pul format | `formatCurrency(amount, t)` / count → `formatNumber` (CLI-166) |

**Ikki xil qoida:**
1. **Interaktiv POS chrome** (CashierScreen / PosPanel / CartTable / DailySummaryCard / Services) — TOKEN-DRIVEN, light+dark ishlaydi. `--font-sans`/`--font-mono`.
2. **Print modal** (ReceiptModal — chek) — **TOKEN EMAS**: literal `'Hanken Grotesk'` / `'JetBrains Mono'` + fiks light palitra (`#fff`, `#192420`, `#5a6a64`, `#3c4a45`, `#c4ccc4`, dark header `#10201c`/`#cfe3dd`/`#27b49c`/`#04130f`/`#2c4842`). Dark-token YO'Q. Yagona dinamik = `t('common.currency')` + `formatCurrency`/`formatNumber`.

**Dark-mode kontrast geyti (DS0/CLI-80 darsi):** brand fillda HECH QACHON `color:#fff` hardcode qilma — `var(--on-primary)` / `var(--text-on-danger)` ishlat. Aktiv discount pill (`bg:var(--primary)` + `var(--on-primary)`) va to'lov toggle (`bg:var(--primary-soft)` + `var(--primary)`) ni dark da WCAG AA tekshir. Geyt = i18n/verify task (§5 Task F).

**Radii:** karta 16px; pill/toggle 7–12px; remove `×` 7px; print dialog 8px. O'ng panel kengligi **360px**.

---

## 4. Komponent-ma-komponent delta

### 4.1 `CashierScreen.tsx` (Task A)
- `SimpleGrid cols={{base:1,lg:2}}` → fiks 2-ustun `minmax(0,1fr) 360px; gap:16` (mobil `base:1`). LEFT/RIGHT **semantikasi o'zgarmaydi** (churn xavfi) — LEFT = POS/Plan panel, RIGHT = DailySummary + Transactions paper. Faqat grid + card chrome re-skin.
- `Paper withBorder p="lg" radius="md"` (transactions) → DS chrome (`radius:16`, `shadow-sm`, header padding) — `style`/`classNames` orqali. `PageHead` + branch `Select` + patient `Select` + `SegmentedControl` restyle (token spacing), funksiya o'zgarmaydi.
- StateView (loading/error) — o'zgarmaydi.
- **Mode dirty-guard** (`posCartDirty`, `switch_mode_confirm`) — o'zgarmaydi.

### 4.2 `PosPanel.tsx` (Task B) — eng katta funksional xavf
- `Card withBorder radius="md"` → "Joriy chek" DS card chrome.
- **Xizmat qo'shish: `Select` → qidiruv input + quick-add pill row.** `addService()` semantikasi (dedupe → qty++, `fetchServicePrices`/`findActivePrice` async narx) **o'zgarmaydi** — faqat trigger surface. Pillar `servicesQuery.data.filter(isActive)` dan (dizayn 7 ko'rsatadi, biz mavjud katalogni ko'rsatamiz; agar >N, qolganlar qidiruv orqali). Pill label = `nameUz`, leading green `+`.
- **Discount: so'm `NumberInput` → percent pill `[0 5 10 15]`.** Yangi local state `discountPct: 0|5|10|15` (default 0). Render-vaqt: `const gross = computeNetTotal(cart, 0)` (=savat jami, chegirmasiz) yoki `cart.reduce(...)` ekvivalenti; `const discAmt = Math.round(gross * discountPct / 100)`; `discAmt` ni **mavjud** `computeNetTotal(cart, discAmt)` va `buildCreatePayload({discount: discAmt})` ga uzatadi. **`cashier.mappers.ts` BYTE-O'ZGARMAYDI.** Pillar percent emitadi → call-site so'm hisoblaydi → mapper o'zgarmagan absolute-so'm qabul qiladi (DS12 inline qarori). Paid amount NumberInput restyle (saqlanadi). Notes Textarea restyle (saqlanadi).
- **To'lov usuli: 4-option `Select` → 3-tugma toggle** (Naqd/Karta/O'tkazma). `paymentMethod` state + payload wiring o'zgarmaydi; `other` enum saqlanadi lekin toggle dan tashqarida (§5.5). Default `cash`.
- **Accept tugma:** inline `Group` Button → full-width 46px primary + NoOp caption. `handleCharge` o'zgarmaydi. `disabled = cart.length===0 || netTotal<=0`, `loading` saqlanadi.
- **Chek modali:** charge `onSuccess` da `ReceiptModal` ochiladi (oxirgi tranzaksiya snapshot). ReceiptModal yangi fayl (Task B owns import) — wiring shu yerda (PosPanel B ga tegishli, D EMAS — §5 disjointness).

### 4.3 `CartTable.tsx` + `DailySummaryCard.tsx` (Task C)
- **CartTable:** `Stack`/`Group` → 3-ustun grid (nom+kategoriya sub / mono narx / `×`). **Editable qty/unit-price NumberInput SAQLANADI** (funksiya), faqat re-skin — dizayn read-only ko'rinadi, lekin biz qty/narx tahrirlashni saqlaymiz (kichikroq/inline). Kategoriya sub-line `i.service.category` (mavjud). Remove `ActionIcon color="red"` → token `×` (hover `danger-soft`/`danger`). `formatCurrency` ishlatiladi.
- **DailySummaryCard:** `Table` breakdown → "Jami tushum" + 2 stat box (`surface-2`, naqd/karta foiz). `summary.breakdown` dan agregatsiya **client-side display only** (mavjud data; yangi hisob-kitob backend EMAS). `formatCurrency`/`formatNumber`. Bo'sh holat saqlanadi.

### 4.4 `ReceiptModal.tsx` — NET-NEW (Task D, history-only wiring)
- Yangi `components/ReceiptModal.tsx`: dark header (`#10201c`) + "Chop etish"/"Yopish", print fonts/palitra (§3 qoida 2), savat/subtotal/chegirma/jami/usul + NoOp footer. Print-only — dark-token YO'Q. `so'm` = `t('common.currency')`.
- **Wiring (disjointness, §5):** `TransactionsTable.tsx` chek-ko'rish tugmasi (tarix dan) → ReceiptModal ochadi. PosPanel (Task B) ham ReceiptModal ni **import** qiladi (import ≠ edit; B owns PosPanel). Hech bir task `PosPanel.tsx` ni baham ko'rmaydi.

### 4.5 Services (Task E)
- `ServicesScreen.tsx` / `ServicesTable.tsx` / `ServiceFormModal.tsx` / `ServiceInfoTab.tsx` / `ServicePricesTab.tsx`: DS card chrome (`radius:16`, `shadow-sm`, header padding), qidiruv/kategoriya restyle, jadval token-sweep. Grouping (`groupByCategory`/`filterServices`) + CRUD + pricing **o'zgarmaydi**. Past vizual prioritet.

### 4.6 i18n + token/contrast geyt (Task F — SERIAL, single-owner)
- Yangi kalitlar uz+ru: "Joriy chek" (`cashier.current_receipt`), "Oraliq jami" (`cashier.subtotal`), "Bugungi kassa" (`cashier.cash_today`), "Jami tushum" (`cashier.total_revenue`), chek matnlari (`cashier.receipt_modal.*` — print/yopish/jami/fiskal NoOp), discount pill suffix, NoOp caption (`cashier.noop_fiscal`), search placeholder ("Xizmat qidirish yoki kod kiritish…"). **Mavjud `cashier.method.{cash,card,transfer,other}` SAQLANADI** (toggle shularni ishlatadi). uz/ru parity + dark-mode WCAG AA kontrast tekshiruvi (active discount pill / toggle).

---

## 5. Disjoint task fayl-egaligi (qat'iy bo'lingan)

| Task | Egalik fayllar (faqat) | i18n |
|---|---|---|
| **A** Cashier layout shell | `cashier/components/CashierScreen.tsx` (+ `CashierScreen.test.tsx`) | no |
| **B** POS panel re-skin + chek wiring | `cashier/components/PosPanel.tsx` (+ `PosPanel.test.tsx`) | no |
| **C** Cart row + daily summary | `cashier/components/CartTable.tsx`, `cashier/components/DailySummaryCard.tsx` | no |
| **D** ReceiptModal (net-new) + history wiring | `cashier/components/ReceiptModal.tsx` (yangi), `cashier/components/TransactionsTable.tsx` (+ `TransactionsTable.test.tsx`) | no |
| **E** Services re-skin | `services/components/*` (5 fayl + testlar) | no |
| **F** i18n + parity + dark-contrast geyt | `packages/i18n/src/locales/{uz,ru}.json` | **YES** |

**Fayl-disjointness isboti:**
- A, B, C, D, E **hech bir manba-faylni baham ko'rmaydi**. B `PosPanel.tsx` ni egallaydi; D `ReceiptModal.tsx`+`TransactionsTable.tsx` ni egallaydi. B `ReceiptModal` ni **import** qiladi (D yaratgan) — import ≠ edit, konflikt yo'q.
- **Bog'liqlik tartibi:** D `ReceiptModal.tsx` ni B import qilishidan oldin yaratishi kerak → **D B dan oldin** (yoki B stub-import bilan, keyin D to'ldiradi). Plan da: **D → B** ketma-ketlik (yoki paralel, B import path'ni oldindan kelishadi). C, E, A mustaqil — paralel.
- **F SERIAL** — A–E tushgandan keyin, yagona owner i18n locales ga tegadi (DS i18n-parity geyt).

### 5.5 Karor qaydlari (impl uchun)
- **Discount percent→so'm:** pill percent state → call-site `Math.round(gross*pct/100)` → mavjud mapper. Mapper o'zgarmaydi. `PosPanel.test.tsx` da discount NumberInput **assertion YO'Q** → percent pill ga o'tish charge payload testini buzmaydi (test `paymentMethod:'cash'` + items ni tekshiradi, discount=0 default). **Lekin** qidiruv-interaksiya testi (`getByPlaceholderText('Xizmatni qidirish...')` + `findByText('PL-001 — Plomba')`) `Select` o'rniga pill ga o'tgani uchun **YANGILANADI** (Task B): yangi placeholder matni + pill label ("Plomba") bo'yicha bosish. Emitilgan payload xulqi characterized qoladi.
- **To'lov toggle:** 3 tugma → `cash`/`card`/`transfer`. "Aralash" (mixed) enum YO'Q — qo'shilmaydi (type/backend o'zgarishi taqiqlangan). `other` type da saqlanadi, toggle da yo'q. i18n: `cashier.method.transfer` "O'tkazma" mavjud — toggle 3-tugma uchun shu ishlatiladi (dizayn "Aralash" labeli `transfer` ga map qilinadi yoki "O'tkazma" qoldiriladi — Task F reconcile).
- **Print modal currency:** literal `so'm` EMAS → `t('common.currency')`. Count → `formatNumber`.

---

## 6. Deferred — owner qarori talab qiladi (KONSENT)

> Brief: "deliverable tushib qolmaydi" — shuning uchun bu yerda **prominent** qoldiriladi, jim hal qilinmaydi.

**Holat:** DS6 sarlavhasi konsent print-modalini (`consentOpen`) nomlaydi. Lekin:
- `features/cashier` va `features/services` da konsent UI **YO'Q** (tasdiqlangan: `grep -ril consent` → NONE).
- Yagona konsent = `features/clinical/components/consent/ConsentTab.tsx` — bu **sign/template flow**, dizaynning print-ready hujjat ko'rinishi (`consentOpen`) EMAS. Dizayn modal **net-new** (chek kabi).
- DS12 deferred katalogi konsentni **data-gap deb sanab CHIQMAGAN** → `features/cashier` ichida placeholder konsent qurish klinik data (doktor/diagnoz/allergiya) ixtiro qilishni majbur qiladi — **taqiqlangan**.

**Qaror variantlari:**
- **Option A (DS6 egasi):** Task G qo'shish — `features/clinical` ga tegadi. **DS6 fayl-doirasi (faqat cashier+services) buni TAQIQLAYDI.** Foreclosed.
- **Option B (klinik milestone'ga defer):** konsent sign/template flow allaqachon yashaydigan joyda qoladi; net-new print-hujjat modali klinika-tegadigan milestone'da quriladi.

**Tavsiya: Option B (defer).** Sabab: (1) fayl-scope policy klinik tahrirni taqiqlaydi; (2) konsent ≠ `ConsentTab` re-skin, u net-new; (3) cashier ichida placeholder qurish taqiqlangan data ixtirosini talab qiladi. **DS6 faqat chek (ReceiptModal) yetkazadi. Konsent — owner DS clinical milestone (DS7 nomzod, roadmap'da tasdiqlanmagan) ga tayinlasin.** Task list da Task G **YO'Q**, placeholder konsent **YO'Q**.

---

## 7. Test strategiyasi (TDD)

- **Invariant (o'zgarmaydi, yashil qolishi shart):** `cashier.mappers.test.ts`, `PlanBillingPanel.test.tsx`, `CashierScreen.test.tsx` (mode-guard/layout render), `services.mappers.test.ts`, `ServicesScreen.test.tsx`, `ServiceFormModal.test.tsx`, `cashier.keys.test.ts`, `services.keys.test.ts`.
- **Yangilanadigan UI-interaksiya testlari:**
  - `PosPanel.test.tsx` (Task B): qidiruv `Select` → pill. Yangi: pill label "Plomba" bosish → narx 50000 auto-fill; charge → payload `paymentMethod:'cash'` + items o'zgarmagan. Yangi discount pill testi: pct=10 tanlash → emitilgan `discount` = `round(gross*0.1)` (mapper o'zgarmagan). To'lov toggle testi: "Karta" bosish → payload `paymentMethod:'card'`.
  - `TransactionsTable.test.tsx` (Task D): refund flow o'zgarmaydi; yangi "chek ko'rish" tugma → ReceiptModal render (print matnlar mavjud).
  - `CartTable` (agar test bor bo'lsa — yo'q): re-skin, qty/price editable saqlanishi smoke.
- **Yangi test:** `ReceiptModal` render (Task D) — chek raqami, totals, NoOp footer, `t('common.currency')` ishlatilishi.
- **Verify (har task + yakuniy):** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`.
- **Dark-mode kontrast (Task F):** active discount pill + to'lov toggle WCAG AA (light+dark). `--on-primary`/`--text-on-danger` resolve.
- **Vizual:** dizaynga side-by-side (light+dark) POS; print modal paper-fidelity.

## 8. Xavf-xatarlar

- **PUL INVARIANT (eng katta tuzoq):** `cashier.mappers.ts` QULF. Discount unit mismatch (dizayn percent, kod absolute so'm) — pill call-site'da so'm hisoblaydi, mapper o'zgarmaydi. Aks holda so'm NumberInput ni qoldirib faqat restyle (fallback).
- **Disjointness:** B+D `PosPanel.tsx` ni baham ko'rmasligi uchun ReceiptModal D da, wiring B da (import). D B dan oldin.
- **Print modal tokenlanishi:** ReceiptModal ni dark-token ga ulanmasligi (paper). Faqat `so'm` dinamik.
- **Toggle mixed enum:** "Aralash" uchun enum YO'Q — `transfer` ga map, type kengaytirilmaydi.
- **i18n serial:** faqat Task F locales ga tegadi (parity churn oldini olish).
- **Yangi API/permission YO'Q** — barcha data mavjud hooklar orqali.
