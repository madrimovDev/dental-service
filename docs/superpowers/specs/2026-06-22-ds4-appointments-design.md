# DS4 — Appointments / Yozilish kalendar (Dental OS re-skin) — Design Spec

**Sana:** 2026-06-22
**Milestone:** DS4 (Dental OS pixel-parity re-skin)
**Roadmap:** Obsidian `07-Dental-OS-Roadmap.md`
**Dizayn manbasi:** `Dental OS.dc.html` — `scrAppt` (byte ~91542), `apptCalendar()` (byte ~212770), right rail (byte ~95558)
**Gap brief:** `docs/superpowers/briefs/ds4-gap.md`
**Deferred katalog:** `docs/superpowers/briefs/ds12-deferred-backend.md`
**Qarorlar:** #32 (token remap-in-place, DS0'da bajarilgan), #33 (pixel-parity, funksiya saqlanadi)

---

## 1. Maqsad va doira

Faqat `apps/web/src/features/appointments/` ekranini Dental OS dizayniga **vizual moslashtirish**. Funksiya, API, i18n kalit semantikasi, permission/vertical gating O'ZGARMAYDI (Qaror #33). Foundation (`tokens.css`, shell, primitivlar) DS0'da qulflangan — TEGILMAYDI.

**Doirada (faqat shu fayllar tahrirlanadi):**
- `apps/web/src/features/appointments/components/*` (CalendarScreen, CalendarGrid, AppointmentSlot, WeekGrid + yangi komponentlar)
- `apps/web/src/features/appointments/appointments.types.ts`, `appointments.mappers.ts`
- `apps/web/src/features/appointments/components/CalendarGrid.module.css`
- `packages/i18n/src/locales/{uz,ru}.json` (FAQAT i18n taski; serial resurs)

**Doiradan tashqari (INVARIANT — o'zgarmaydi):**
- `packages/ui/src/**` (primitivlar, tokenlar, theme) — faqat ISHLATILADI, tahrirlanmaydi.
- `apps/web/src/shell/**`, `apps/web/src/stores/ui-store.ts`.
- Backend — yangi endpoint/migration/field YO'Q.
- Data hooklar (`appointments.api.ts`), schema (`appointments.schema.ts`), routing (`appointments.routes.tsx`), wizard mantiqi (`NewAppointmentWizard.tsx` server-side `useAvailability` konflikt-guard).
- Permission gating (`hasPermission('appointment.create'|'cancel')`).

## 2. Qulflangan qarorlar (brief + ds12 deferred asosida)

| # | Qaror | Manba |
|---|---|---|
| Ish soati 18 vs 20 | **Kod qiymati 20 SAQLANADI**; dizayn 18:00 kosmetik deb e'tiborsiz qoldiriladi (20→18 post-18:00 yozilishlarni yashiradi = data yo'qolishi). FAQAT 88px/soat zichlik qabul qilinadi. | ds12 §DS4, brief R2 |
| Drag-drop / bo'sh-joyga-bosish | **Port QILINMAYDI** — joriy kodda yo'q, dizaynniki API'siz lokal mock. Legend "surib ko'chiring · bosib qo'shing" maslahati **OLIB TASHLANADI** (qayta yozilmaydi — mavjud bo'lmagan interaksiyani reklama qiladi). | brief R1, G18 |
| Blok rangi | **Doktor-toni** bo'yicha (ustun identifikatori), status emas. Status **dot/check indikator** bilan beriladi. | brief G12, R4 |
| Tone-cycling | Dizayn 3 tonni hardcode qiladi; ishlab chiqarishda N doktor → `TONES[index % TONES.length]`. | brief G12 |
| Right-rail data | Jami/Tasdiqlangan/Kutilmoqda — fetch qilingan `appts`'dan client-side. "Bo'sh slot" → `—` placeholder (data manbai yo'q). Waiting list → faqat chrome + bo'sh-holat (live "Slotga joylashtirish" amali YO'Q — yangi feature). | brief R5, ds12 §DS4 |
| StatCard primitivi | Ishlatilmaydi — dizayn 2×2 tile bir qatorli StatCard layout'iga mos kelmaydi → bespoke tile. | advisor |

## 3. Token xaritasi (faqat mavjud tokenlar; DS0'da qulflangan)

Hammasi `tokens.css`'da mavjud (light + dark). Mockup `--ui`/`--mono` aliaslari YO'Q → `--font-sans`/`--font-mono`. Brendli to'ldirishda `#fff` hardcode YO'Q → `--on-primary`/`--text-on-danger`.

| Dizayn maqsadi | Token |
|---|---|
| Kalendar/rail karta foni | `--surface` |
| Tile / track / done-blok foni | `--surface-2` |
| Ramka / grid chiziq | `--border` · kuchli `--border-strong` |
| Matn | `--ink` · ikkilamchi `--ink-2` · uchlamchi `--ink-3` |
| Primary tugma / "Bugun" pill | `--primary` · matn `--on-primary` · soft `--primary-soft` · hover `--primary-strong` |
| Doktor tonlari | `--primary`/`--primary-soft`, `--info`/`--info-soft`, `--violet`/`--violet-soft`, `--success`/`--success-soft`, `--danger`/`--danger-soft`, `--warning`/`--warning-soft`, muted `--ink-3`/`--surface-2` |
| In-progress dot | `--warning` + `--warning-soft` halqa |
| Joriy-vaqt chizig'i / badge | `--danger` + matn `--text-on-danger` (`#fff` EMAS — dark kontrast) |
| Soya | `--shadow-sm` |
| Mono (vaqt/raqam) | `font-family: var(--font-mono)` |

## 4. Status → indikator xaritasi (TO'LIQ — Task 1 yadrosi)

Dizayn mock faqat 4 holatni modellashtiradi; ishlab chiqarishda **6** holat bor. Hammasi vizual farqlanishi shart (brief R4). Indikator blok ichida (o'ng-yuqori) va legend'da bir xil manbadan (`StatusIndicator`) keladi.

| Status (real) | Indikator | Blok modifikatori | Legend label (mavjud `appointments.status.*`) |
|---|---|---|---|
| `scheduled` | halqa (`border:2px solid var(--ink-3)`, ichi shaffof) | tone-soft to'ldirish | Rejalashtirilgan |
| `confirmed` | to'la dot `--ink-3` | tone-soft to'ldirish | Tasdiqlangan |
| `in_progress` | to'la dot `--warning` + `0 0 0 3px var(--warning-soft)` halqa (pulse) | tone-soft to'ldirish | Davom etmoqda |
| `completed` | `check` ikonka `--ink-3` | `background:var(--surface-2); opacity:.74` (dim) | Bajarilgan |
| `no_show` | to'la dot `--danger` | tone-soft to'ldirish + `--danger` border-left override | Kelmagan |
| `cancelled` | qiya chiziq / dim dot `--ink-3` | `background:var(--surface-2); opacity:.5` | Bekor qilingan |

Legend strip 4 elementni ko'rsatadi (dizayn: Tasdiqlangan/Kutilmoqda/Qabulda/Yakunlandi). Joriy real status nomlari bilan moslash: legend mavjud `appointments.status.confirmed/scheduled/in_progress/completed` kalitlarini qayta ishlatadi (yangi kalit minimal). `cancelled`/`no_show` legend'da emas, lekin blok indikatorida farqlanadi.

## 5. Tone-cycling (Task 1)

```
const TONES = ['primary','info','violet','success','warning','danger'] as const;
// doctor (yoki day) ustun indeksi → tone = TONES[index % TONES.length]
// 'muted' (--ink-3/--surface-2) faqat fallback (doktorsiz/noma'lum ustun) uchun.
```

Har ustun (CalendarGrid: doktor; WeekGrid: kun) o'z indeksidan barqaror tone oladi. Tone → `[--<tone>, --<tone>-soft]` juftligi (blok border-left + soft bg, ustun-header tile + count badge).

## 6. Komponent-ma-komponent

### 6.1 CalendarGrid internallari (geometriya — coupled magic numbers)
Bu fayllar **bitta birlik** — hour-height konstantalari lockstep'da harakatlanadi va toza ajratib bo'lmaydi:
- `appointments.types.ts` — `GRID.pxPerMin: 88/60` (eski `40/30`). `GRID.dayEndHour: 20` **SAQLANADI** (§2). `stepMin: 30`.
- `appointments.mappers.ts` — `toSlotPosition` min-height `pxPerMin*10` saqlanadi (10 daq min). Hech bir TZ/lane mantiq o'zgarmaydi (faqat `pxPerMin` orqali masshtab).
- `CalendarGrid.module.css` — `.grid` → 16px radius + `--shadow-sm`; header strip `border-bottom:1px solid var(--border)`; `.times` gutter 56→50px, mono label `--ink-3`, hour-only; `.col` min-width 120→160px; `.colBody` per-30-min grid chiziq (hour `opacity:1`, half `opacity:.4`, **solid** `--border`, dashed EMAS); `.slot` 9px radius, 5×9 padding, `--shadow-sm`, tone-soft bg + tone border-left (CSS o'zgaruvchi inline `style`'dan), `[data-status]` modifikatorlari (§4).
- `CalendarGrid.tsx` — header spacer balandligi 40→header strip balandligiga moslanadi; ustun-header = chap-tekis 30×30 tinted initials tile + ism(700/12.5) + sub(10.5, **specialty data yo'q → faqat ism yoki bo'sh fallback**, yangi endpoint YO'Q) + mono count badge (`col.events.length`); tone'ni indeks bo'yicha uzatadi.
- `WeekGrid.tsx` — bir xil grid/CSS qayta ishlatadi; ustun-header kun formati saqlanadi; tone kun-indeksidan.
- `AppointmentSlot.tsx` — `top: pos.top + <headerH>` offset header strip balandligiga moslanadi; mono "HH:MM · Ndaq" header qatori + `StatusIndicator` (o'ng), qalin bemor ismi, xizmat qatori (faqat `pos.height > 44` bo'lsa). Tone prop oladi.
- **`StatusIndicator.tsx`** (YANGI, Task 1 egasi) — `status` → dot/halqa/check/check render qiluvchi kichik komponent (§4). Legend (Task 2) ham buni import qiladi → vizual drift yo'q.
- **`CurrentTimeLine.tsx`** (YANGI, Task 1 egasi) — faqat day-view; joriy local daqiqa (`localMinutes` qayta ishlatadi) → `top` offset 08:00 dan; 2px `--danger` bar + mono vaqt badge (`--text-on-danger` on `--danger`) + chap-chekka dot; 08–20 oynasidan tashqarida yashirinadi; `setInterval` (60s) bilan yangilanadi, unmount'da tozalanadi.

### 6.2 Screen chrome (CalendarScreen.tsx — header + body grid + montaj)
- **Header row** (flex, gap 14, wrap): chevron nav tugmalari (mavjud `IconButton bordered` primitivi, 34×34, chap `rotate(180deg)`, lucide `chevron`), sana sarlavha bloki ("DD-oy · hafta-kuni" 17/700 `--ink` + sub "N ta yozilish · M doktor · filial" 12 `--ink-3` — `appts`/`doctors`/branch'dan client-side), joriy-kun uchun statik "Bugun" pill (`--primary-soft`), Day/Week segmented toggle (mavjud `Tabs variant="pill"` SAQLANADI — theme-convergent; segmented track shakli pixel-parity emas, lekin funksional ekvivalent + churn nomutanosib), branch `Select` (SAQLANADI — funksional filter), "Yangi yozilish" primary `Button` (`appointment.create` gated, SAQLANADI).
- **Legend strip** (`StatusLegend` montaji — Task 2 komponenti).
- **Body** `display:grid; grid-template-columns:minmax(0,1fr) 296px; gap:16` — chap kalendar (CalendarGrid/WeekGrid + StateView wrapper SAQLANADI), o'ng 296px rail (`DayStatsCard` + `WaitlistCard`, Task 2 komponentlari).
- Modal'lar (NewAppointmentWizard + detail/cancel) O'ZGARMAYDI.
- "Bugun" reset `Button` (mavjud) — chevron-nav bilan birga: reset funksiyasi saqlanadi (sana → bugun), lekin statik "Bugun" pill semantik jihatdan boshqa (joriy-kun markeri). Reset amalini chevron qatoriga joylashtirish mumkin; funksiya yo'qolmaydi.

### 6.3 Rail + legend komponentlari (YANGI fayllar — Task 2 egasi)
- **`StatusLegend.tsx`** — 4 dot/check element (`StatusIndicator` qayta ishlatadi) + label. Trailing drag-hint OLIB TASHLANADI (§2).
- **`DayStatsCard.tsx`** — "Bugungi kun" 2×2 bespoke tile grid. Jami / Tasdiqlangan / Kutilmoqda `appts`'dan client-side (`appts ?? []` xavfsiz — bo'sh → 0). "Bo'sh slot" → `—` (data manbai yo'q, ds12). Mono raqam (`--font-mono`), tile `--surface-2`.
- **`WaitlistCard.tsx`** — "Kutish ro'yxati" karta chrome + bo'sh-holat ("hozircha bo'sh" / omit). Live data/endpoint YO'Q → "Slotga joylashtirish" amali YO'Q (data-gap, ds12). Foydasiz tugma JO'NATILMAYDI.

## 7. Deferred / omitted (chrome ter, data yo'q — ds12)

- **Ish soati 18** — qabul qilinmaydi; 20 saqlanadi (§2).
- **"Bo'sh slot" statistikasi** — `—` placeholder.
- **Waiting list ma'lumotlari + "Slotga joylashtirish"** — chrome + bo'sh-holat, live data/amal yo'q.
- **Drag-to-reschedule / bo'sh-joyga-bosib-qo'shish** — port qilinmaydi; legend hint olib tashlanadi.
- **Doktor specialty/cabinet sub-qatori** — `DoctorListItem` faqat `{id,name}` → sub bo'sh/ism fallback (yangi endpoint yo'q).

## 8. Test strategiyasi (TDD)

- **Mavjud characterization YASHIL qoladi:** `CalendarScreen.test.tsx` ("Kun"/"Hafta" toggle), `CalendarGrid.test.tsx` ("Dr. Ali" ustun + "Bemor X" slot), `appointments.mappers.test.ts` (lane/pozitsiya — `pxPerMin` o'zgarsa **pozitsiya px kutilgan qiymatlari yangilanadi**, lane mantiqi emas).
- **`CalendarScreen.test.tsx` mock cheklovi:** `useAppointments` → `{data:[], isLoading:false}` (no `isError`/`refetch`). Rail stats `appts ?? []`'dan xavfsiz hisoblanishi shart (bo'sh → nol) — aks holda test buziladi. Task 2/3 buni hisobga oladi.
- **Yangi unit testlar:** `StatusIndicator` har 6 status → to'g'ri indikator; `CurrentTimeLine` oynadan tashqarida yashirinadi + offset hisobi; `DayStatsCard` `appts`'dan to'g'ri sanaydi + bo'sh → 0 + "Bo'sh slot" `—`; tone-cycling `index % TONES.length`.
- **Dark-mode kontrast (MAJBURIY — DS0/CLI-80 darsi):** (a) `done`/`cancelled` blok `--surface-2` @ opacity .74/.5 — matn (`--ink`/tone) ≥ WCAG AA ikkala temada; (b) tone-soft bg + tone-rangli mono vaqt matni har tonda (info/violet/primary/success/warning/danger) ikkala temada; (c) joriy-vaqt badge `--text-on-danger` on dark `--danger`. `#fff` hardcode YO'Q.
- **Verify:** `typecheck` · `biome` · `turbo test --filter @dental/web` · vizual side-by-side (light + dark).

## 9. Bajarish tartibi (plan uchun)

1. **Task 1 (Grid internals)** birinchi — `StatusIndicator` + `CurrentTimeLine` + geometriya. Task 2 `StatusIndicator`'ni import qiladi.
2. **Task 2 (Rail + legend new files)** — Task 1'dan keyin (StatusIndicator import).
3. **Task 3 (Screen chrome)** — Task 1+2 komponentlarini montaj qiladi.
4. **Task 4 (i18n)** — istalgan vaqt; serial resurs (boshqa DS i18n bilan ketma-ket).

> Fayl-egaligi disjoint: Task 1/2/3 hech qanday fayl bo'lishmaydi (Task 2 yangi fayllar yaratadi, Task 3 ularni import qiladi — import ≠ fayl tahriri). Task 4 yagona i18n egasi.
