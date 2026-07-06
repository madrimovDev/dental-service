# DS5 — Navbat + Fullscreen display board (Dental OS re-skin) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS5 (Dental OS pixel-parity redesign to'lqini)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Dizayn manbasi:** `Dental OS.dc.html` (claude.ai/design) — `scrQueue` + `scrBoard` template'lari
**Gap brief:** `docs/superpowers/briefs/ds5-gap.md` (asosiy manba, ground)
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Qarorlar:** #19 (theme-convergent), #32 (token remap-in-place), #33 (pixel-parity, funksiya saqlanadi), #35 (per-milestone sikl); DS0 foundation LOCKED.

---

## 1. Maqsad va doira

DS5 — **faqat `queue` feature'ini** Dental OS dizayniga vizual moslashtirish (front-end-only re-skin). Ikki ekran:
1. **Navbat ekrani** (`/queue`, `scrQueue`) — header + **now-serving hero** + **next panel** + 3-ustunli kanban board.
2. **Fullscreen display board** (yangi `/queue/board`, `scrBoard`) — 2 kabinet showcase (84px mono) + "Keyingi navbatlar" kartalari + jonli soat (dotpulse).

**Doirada (TANISH FAYLLAR — faqat shular):** `apps/web/src/features/queue/**` + i18n `queue.*` (uz/ru) yangi kalitlar. Tokenlar mavjud (`packages/ui/src/theme/tokens.css`) — ishlatiladi, TAHRIRLANMAYDI.

**Doiradan tashqari (INVARIANT — o'zgarmaydi):**
- Funksiya: status o'tishlari (`waiting→in_progress→done/missed`), branch filter, 10s polling, check-in oqimi, `queue.manage`/`queue.create`/`queue.view` permission gating.
- API/hooks: yangi endpoint/field/migration/hook YO'Q (`useQueueToday`, `useUpdateQueueStatus`, `useCreateTicket`, `useCheckInCandidates`, lookuplar qayta ishlatiladi).
- `queue.mappers.ts`, `queue.types.ts`, `queue.schema.ts`, `queue.keys.ts`, `queue.api.ts` — TEGILMAYDI (display reshaping komponent ichida lokal hisoblanadi).
- DS0: `tokens.css`, `packages/ui/src/theme/*`, `packages/ui/src/primitives/*`, `apps/web/src/shell/*`, `stores/ui-store.ts` — LOCKED.
- CheckInDialog logikasi (faqat agar token-sweep zarur bo'lsa, mayda).

## 2. Qulflangan qarorlar (gap brief asosida)

| # | Qaror | Asos |
|---|---|---|
| Render strategiya | **Token + CSS-module driven**, *selektiv* primitiv (theme-convergent #19). Raw Mantine → primitiv ommaviy migratsiya YO'Q. | CSS-module presedent: `NotificationBell.module.css`, `CalendarGrid.module.css` |
| Display board | **In-shell route `/queue/board`** (dizayn `scrBoard` ham shell content ichida, `position:fixed` EMAS). Fullscreen overlay = funksiya qo'shilishi → YO'Q (#33). | Gap brief §5; advisor |
| Off-brand status rang | QueueCard'dagi `yellow/blue/teal/red` Badge **olib tashlanadi** — status ustun orqali ifodalanadi (dizayn ham shunday). Ustun count chip toned (`muted/warning/success`). | Gap brief §3.5; CLI-181 StatusPill konvensiyasi (DS5 = vizual-parity milestone, off-brand ranglar SHU YERDA tekislanadi — CLI-181 won't-fix theme-convergence epigiga tegishli edi, geri olinmaydi) |
| `A-NN` raqam | **Presentation formatter** (`A-${String(queueNumber).padStart(2,'0')}`), mono token. Schema o'zgarmaydi. | Gap brief §3.4, §5 |
| "Now serving" / "Next" | `useQueueToday`'dan lokal derivatsiya: now = birinchi `in_progress` ticket; next = birinchi `waiting` ticket. Yangi hook YO'Q. | Gap brief §4 DS5-1 |
| "Chaqirish →" CTA | Mavjud `useUpdateQueueStatus` — waiting head → `in_progress` (yangi API yo'q). | Gap brief §3.2 |
| Cabinet/doktor/kabinet yorlig'i | API'da **cabinet field yo'q** → dizayn mock. Doktor/kabinet faqat ma'lumot bor bo'lsa ko'rsatiladi, aks holda omit (DATA-GAP). | Gap brief §5; DS12 ruhi |
| Keyframes | `dotpulse` + `fadeUp` shipped CSS'da YO'Q (DS0 globalga kirmagan) → display board `.module.css` ichida LOKAL e'lon qilinadi (shell LOCKED). | Tekshirildi (grep, 0 hit) |

## 3. Token xaritasi (mavjud DS0 tokenlar — TAHRIRLANMAYDI)

| Dizayn alias | Mavjud token |
|---|---|
| `--mono` | `var(--font-mono)` (JetBrains Mono) — barcha navbat raqamlari + soat |
| `--ui` | `var(--font-sans)` (Hanken Grotesk) |
| `--ink` / `--ink-2` / `--ink-3` | `var(--text)` / `var(--text-2)` / `var(--text-3)` |
| `--on-primary` | `var(--on-primary)` (mavjud, gradient ustidagi matn) |
| Now-serving + cabinet-1 gradient | `linear-gradient(135deg, var(--primary), var(--primary-strong))` |
| Cabinet-2 gradient | `linear-gradient(135deg, var(--violet), color-mix(in srgb, var(--violet) 75%, #000))` |
| Surfacelar | `--surface`, `--surface-2`, `--border`, `--border-strong` |
| Shadow | `--shadow` (hero panel), `--shadow-sm` (kartalar) |
| Radii | 8/10/11/13/16/20/22px — `--radius*` shkalasi yoki to'g'ridan px (dizayn aniq qiymatlar) |

> ⚠️ **Mockup aliaslar `--ui`/`--mono` KOD'DA YO'Q** → har doim `var(--font-sans)`/`var(--font-mono)`.
> ⚠️ **Dark contrast (CLI-80/255 darsi):** gradient ustida `--on-primary`; cabinet-2 dizayn `color:#fff` (literal) ishlatadi — light VA dark da WCAG AA tekshiriladi. Brand fill ustiga hech qachon ko'r-ko'rona `#fff` qo'yilmaydi — `--on-primary` afzal; cabinet-2 violet ustidagi oq kontrast ikkala temada tasdiqlanadi.

## 4. Komponent-bo'yicha re-skin

### 4.1 `QueueBoard.tsx` (+`QueueBoard.module.css`) — header + now-serving + next
- **Header:** `Title order={2}` ("Bugungi navbat") → kichik sarlavha blok (`17px/700/--text`) + subtitle (`12px/--text-3`, masalan "<branch> · jonli boshqaruv"). O'ngda **"Display board" outline tugma** (grid icon, hover border/color → primary) `/queue/board` ga navigatsiya qiladi (`useNavigate`). **Branch Select + "Yangi navbat" tugma SAQLANADI** (funksional).
  - In-page sarlavha DS0 topbar page-title bilan takrorlanishi mumkin → blok ichida hal qilinadi (subtitle qo'shib farqlash); **route `title` metadata QO'SHILMAYDI** (u `queue.routes.tsx`'ni ikkinchi task'ga bog'lab disjointlikni buzadi).
- **Now-serving hero** (`flex:1 1 360px`): primary→primary-strong 135deg gradient, `radius:16`, `padding:20px 22px`, `--on-primary`, `--shadow`. Eyebrow ("Hozir chaqirilmoqda", uppercase) + **46px mono raqam** (`A-06`) + vertikal divider (`rgba(255,255,255,.25)`) + bemor/xizmat/meta blok. **Animatsiya YO'Q** (dizaynda now-serving'da pulse yo'q). Manba: birinchi `in_progress` ticket; bo'sh bo'lsa placeholder ("Hozircha chaqirilmagan").
- **Next panel** (`flex:1 1 260px`): `--surface`, `--border`, `radius:16`, `--shadow-sm`. Eyebrow ("Keyingi navbat") + 30px mono raqam + ism + "X daqiqa kutdi" + **"Chaqirish →" tugma** (`height:44`, `radius:11`, primary/on-primary) → `useUpdateQueueStatus` head-of-waiting → `in_progress`. Manba: birinchi `waiting` ticket; bo'sh bo'lsa tugma yashirin/disabled.
- 3-ustun board `Group grow` → `display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:start` (CSS module). `StateView` loading/error saqlanadi.
- **DATA-GAP:** "X daqiqa kutdi" — agar ticket'da kutish-vaqti maydoni bo'lsa (`createdAt`'dan hisob) ko'rsatiladi; aks holda placeholder/omit. Cabinet/kabinet meta omit.

### 4.2 `QueueColumn.tsx` (+`QueueColumn.module.css`) — kanban ustun
- Mantine `Card radius="md"` → `--surface`, `border:1px --border`, `radius:16`, `--shadow-sm`, `overflow:hidden`.
- Header: title (`13.5px/700/--text`) + **toned count chip** (`muted` waiting / `warning` in_progress / `success` completed) — `(N)` parens o'rniga. Ustun tonini `QueueColumnKey`'dan deriva qiladi.
- Body: `padding:10px`, flex column, `gap:8px`, `min-height:80px`.
- **Funksiya saqlanadi:** `column`, `title`, `lookups`, `canManage`, `busyId`, `onStatus` proplari va `toQueueCardVM` chaqiruvi o'zgarmaydi.

### 4.3 `QueueCard.tsx` (+`QueueCard.module.css`) — ticket karta
- `--surface-2` bg, `border:1px --border`, `radius:11`, `padding:11`, hover `borderColor:--border-strong`. flex row `gap:11`.
- **Mono raqam chip:** `#{queueNumber}` colored Badge → `A-NN` mono chip (`var(--font-mono)`, `13px/700/--text`, `--surface` bg, `border:1px --border`, `radius:8`, `padding:6px 8px`). `statusColor` xaritasi **olib tashlanadi**.
- Matn: bemor (`13px/600`, ellipsis) + "xizmat · meta" (`11.5px/--text-3`, ellipsis).
- **Funksiya saqlanadi:** `vm`, `canManage`, `busy`, `onStatus` proplari **o'zgarmaydi** (DS5-2'ni DS5-3'ga bog'lamaslik uchun). Amal tugmalari (call Play / done / missed X) `canManage`+status sharti bilan saqlanadi; `busy` per-card disable saqlanadi. Status endi rang-badge orqali emas, ustun orqali ifodalanadi (amal tugmalari qoladi).

### 4.4 `QueueDisplayBoard.tsx` (+`.module.css`) — YANGI fullscreen tablo (`/queue/board`)
- In-shell, column flex `gap:20`, `fadeUp` enter animatsiya (lokal keyframe).
- **Header:** logo kvadrat (`48px`, `radius:13`, primary/on-primary, "DD") + klinika nomi (`22px/800`) + subtitle ("Navbat — jonli tablo · <branch>"). O'ngda **jonli soat** (`var(--font-mono)`, `30px/700`, oldida `9px` `--danger` nuqta `dotpulse 1.4s infinite`) + **"Chiqish" tugma** → `/queue` (`useNavigate`).
- **2 kabinet showcase** (`grid 1fr 1fr; gap:20`): cabinet-1 primary gradient, cabinet-2 violet gradient (`color-mix(in srgb, var(--violet) 75%, #000)`, matn `#fff` literal — dizayn aniq). Har biri: eyebrow + **84px mono raqam** + bemor + xizmat. Manba: `in_progress` ticketlar (≤2). Bo'sh slot placeholder.
- **"Keyingi navbatlar" panel:** `--surface`, `radius:20`, `--shadow-sm`. Title (uppercase) + kartalar qatori (flex wrap, `min-width:220`, `--surface-2`, `radius:16`): **38px mono raqam** (birinchi karta `--primary`, qolgani `--text-3`) + ism + xizmat. Manba: birinchi 3 `waiting` ticket.
- **Jonli soat:** client `setInterval(1000)`, unmount'da `clearInterval` (cleanup).
- **DATA-GAP:** kabinet/doktor nomi API'da yo'q → dizayn mock; doktor/kabinet faqat lookup'da bor bo'lsa ko'rsatiladi, aks holda omit. Bemor/xizmat nomi mavjud lookuplar (`usePatientsAll`/`useServices`) orqali.
- **Keyframes LOKAL:** `dotpulse` + `fadeUp` shu `.module.css`'da e'lon qilinadi (shell CSS'da yo'q, shell LOCKED).
- Route: `queue.routes.tsx`'ga `{ path: '/queue/board', perm: 'queue.view', element: <QueueDisplayBoard /> }`. `index.ts`'ga eksport (agar kerak bo'lsa). `app/routes.tsx` allaqachon `...queueRoutes` spread qiladi → TEGILMAYDI.

### 4.5 i18n (`uz.json` + `ru.json`, `queue.*`) — faqat YANGI kalitlar
Yangi: `now_serving` ("Hozir chaqirilmoqda"), `next_in_queue` ("Keyingi navbat"), `display_board` ("Display board"), `exit` ("Chiqish"), `live_subtitle` ("jonli boshqaruv"), `board_subtitle` ("Navbat — jonli tablo"), `next_queues` ("Keyingi navbatlar"), `waited_minutes` ("{{count}} daqiqa kutdi"), `cabinet` ("Kabinet {{n}}"), `not_called_yet` ("Hozircha chaqirilmagan"), `call_arrow` ("Chaqirish →") va shu kabilar. Mavjud kalitlar SAQLANADI; semantika o'zgarmaydi (faqat qo'shiladi). uz va ru parity.

## 5. Deferred / omitted (DATA-GAP — chrome teriladi, data omit/placeholder)

| Element | Sabab | DS5 xulqi |
|---|---|---|
| Kabinet/room raqami (cabinet-1/2 yorlig'i) | API ticket modelida cabinet field yo'q | Mock dizayn → omit yoki lookup'dagi doktor; placeholder |
| Real-time push (WebSocket) | Backend yo'q | Mavjud 10s polling saqlanadi |
| "X daqiqa kutdi" aniq estimate | Per-ticket wait-estimate field yo'q | `createdAt`'dan oddiy hisob yoki placeholder/omit |
| Now-serving audio/ovoz e'loni | Scope tashqarisi | YO'Q |
| Bemor fotosi | Avatar field yo'q | Initials Avatar (mavjud primitiv) |

**Hech qachon:** backend call, yangi field, migration, yangi endpoint/hook qo'shilmaydi (DS12 katalogi).

## 6. Test strategiyasi (TDD, characterization)

- **`QueueBoard.test.tsx`** (mavjud, kengaytiriladi): 3 ustun sarlavhasi (`Kutmoqda/Davom etmoqda/Bajarilgan`) ko'rinadi (regression); "Display board" tugma render + navigatsiya; now-serving/next panel mock data bilan render (in_progress/waiting bor/yo'q holatlar); "Chaqirish →" tugma `useUpdateQueueStatus` chaqiradi. Mock hooklar mavjud naqsh bilan.
- **`QueueCard`** (yangi/kengaytirilgan test): mono `A-NN` chip render; off-brand rang badge YO'Q (regression — `yellow/blue/teal/red` className yo'q); amal tugmalari `canManage`+status bo'yicha (call/done/missed) saqlanadi; `busy` disable.
- **`QueueColumn`** (yangi test ixtiyoriy): toned count chip statusga mos; `min-height` body; proplar o'zgarmagan.
- **`QueueDisplayBoard.test.tsx`** (yangi): cabinet showcase `in_progress`'dan, ≤2; "Keyingi navbatlar" 3 `waiting`'dan; "Chiqish" → navigatsiya; soat render (mock timer); permission `queue.view` route guard.
- **i18n parity:** uz/ru `queue.*` yangi kalitlar ikkala faylda mavjud (shell parity testi yoki manual diff).
- **Verify:** `typecheck` · `biome` · `turbo test --filter @dental/web` · `build`. Dizaynga side-by-side (light + dark, kontrast tekshiruvi gradient + cabinet-2 violet).

## 7. Xavf-xatarlar

- **Mono token render** — barcha raqamlar (46/84/38/30/13px) `var(--font-mono)` 700 + tabular figures (`A-06`/`A-07` tekislanishi). DS5'ning eng yuk ko'taruvchi tipografik detali. Tekshiriladi.
- **dotpulse ≠ scale/glow** — bu faqat opacity blink (`0%,100%{opacity:1}50%{opacity:.35}`). Scale-pulse ixtiro qilinmaydi. Keyframe shell'da yo'q → lokal e'lon.
- **Gradient kontrast (dark)** — `--on-primary` va cabinet-2 violet-ustidagi-oq AA, light+dark da tasdiqlanadi (CLI-80/255 darsi).
- **`color-mix` qo'llab-quvvatlash** — Electron/Chromium = OK.
- **Disjointlik** — `queue.routes.tsx`/`index.ts` faqat DS5-3 (display board) ega bo'ladi; QueueCard proplari barqaror qoladi (aks holda DS5-2 DS5-3'ga qo'shiladi); `mappers/types` tegilmaydi (display reshape lokal). i18n faqat DS5-4 (serial).
- **Topbar page-title takrorlanishi** — in-page sarlavha subtitle bilan farqlanadi, route metadata qo'shilmaydi.

## 8. Bajarish tartibi (plan uchun)

1. **DS5-4 i18n** (SERIAL, birinchi land — keyingi tasklar kalitlardan foydalanadi).
2. **DS5-2 QueueCard + QueueColumn** re-skin (proplar barqaror).
3. **DS5-1 QueueBoard** header + now-serving + next (DS5-2 kartalarini ishlatadi).
4. **DS5-3 QueueDisplayBoard** + route (mustaqil, lokal keyframes).
5. Verify (test + build + typecheck + dev fidelity light/dark).
