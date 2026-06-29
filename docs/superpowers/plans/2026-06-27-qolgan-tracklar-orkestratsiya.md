# Qolgan ishlar — Parallel Orkestratsiya Rejasi (2026-06-27)

## 0. Yer-haqiqati (git, Linear emas)

Tekshiruv natijasi — foydalanuvchi/Linear tasavvuridan jiddiy farqli:

- **DS0–DS11 redesign'ning BARCHA branchlari main'ga merge qilingan** (`merged_into_main=1`, `ahead=0`, `changed_files=0`). Main `typecheck` **16/16 sog'lom** (FULL TURBO).
- Linear'da DS2/3/4/5/8 epiklari "ochiq/0%" — **eski sync gap**, bajarilmagan ish emas.
- Scope nuance: merge **front-end-only** (#33) — backend/data gap'lar `ds12-deferred-backend.md` katalogida.
- **ds12-a** (read-only aggregatlar: KPI delta/sparkline/donut/heatmap/recall/activity + demo seed) main'da → DS12 katalogning **DS1+DS8 qismi ko'p jihatdan yopilgan**.
- **DS13 (8 task, CLI-324…331)** — yagona haqiqatan implementatsiya talab qiladigan ish (`--radius-card` grep bo'sh = yozilmagan).

**Foydalanuvchi qarorlari (2026-06-27):**
1. **Scope = uchala track:** DS13 + eski epiklarni yopish + DS12 backend gaplar.
2. **DS13 rejimi = to'liq avtonom** (konvensiyani agentlar tanlaydi, tasdiqsiz).
3. **Ijro = parallel workflow (worktree)** — to'liq orkestratsiya.

> ⚠️ Avtonom "fix everything" restraint-tarixiga zid (CLI-177/180/181 won't-fix; DS13-8 "har birini baholang"). Foydalanuvchi tanlovi hurmat qilinadi, lekin **xavfsizlik chegaralari (§6) majburiy** — ayniqsa holistik review va dark-kontrast.

---

## 1. Uch track va ketma-ketlik

| Track | Mazmun | Og'irlik | Mexanizm | Tartib |
|---|---|---|---|---|
| **T1 — DS13** | 8 vizual izchillik task | ~50–60 fayl, mexanik | Workflow: serial foundation → parallel papka-sweep | **Birinchi** (validatsiya) |
| **T2 — Bookkeeping** | Linear DS2/3/4/5/8 epik → Done + Obsidian sync | Arzon, kodsiz | 1 sync-agent (worktree YO'Q) | T1 bilan parallel/keyin |
| **T3 — DS12 backend** | DS9/DS10/DS7/DS4 data-gaplar | Katta, full-stack, migration | Workflow: backend waves (migration+OpenAPI serial nuqtalar) | **Oxirgi**, T1 dan keyin |

**Sabab T1 birinchi:** harness ishlashini tasdiqlash (DS0 5× timeout, DS6/DS8 hang tarixi). Mexanik, past-risk → validatsiya to'lqini. T3 (migration/OpenAPI) eng murakkab → oxirgi.

---

## 2. TRACK 1 — DS13 (parallel workflow)

### 2.1 Nega DS1–DS11 dan farqli
DS1–DS11 toza parallellashdi: disjoint feature papka + DesignSync orakul → mexanik impl. DS13 da **orakul yo'q** — "izchillashtirish" = konvensiya tanlash. Va 8 task **concern bo'yicha fayl-kesishadi** (radius↔Card, container↔title, color↔color). ⇒ partition **papka bo'yicha**, concern bo'yicha emas; konvensiya **serial foundation'da** qotiriladi, sweep so'zma-so'z qo'llaydi.

### 2.2 Faza 0 — Konvensiya-spec (serial, 1 agent, avtonom)
Aniq qaror-spec yozadi `docs/superpowers/specs/2026-06-27-ds13-konvensiya.md`:
- `--radius-card` qiymati (**16px** — audit C1 tavsiyasi, eng keng tarqalgan).
- Karta-sarlavha primitivi (**`<Title order={4}>` 18px/700** — D1) + sahifa H1 (**PageHead 22px/700** — D2).
- Container yondashuvi: **shell-darajada bitta max-width qatlam** (A1) yoki hammasi `Container size="xl"` — agent tanlaydi, bitta.
- Sarlavha-manbasi qoidasi (B1): **Topbar yagona manba**, in-screen PageHead dublikat olib tashlanadi; sahifa = bitta i18n kalit; `/settings/notify`+`/settings/integrations` nav-config'ga qo'shiladi (B2).
- `dimmed → --text-3` mexanizmi (E4): **theme-darajada bir joyda** (mantine-theme `c="dimmed"` ni `--text-3` ga map yoki global override).
- Per-finding **fix-vs-won't-fix** ro'yxati (ayniqsa DS13-8 Low — F1…F8 har biri qiymat/churn bo'yicha).

### 2.3 Faza 1 — Foundation (serial, markaziy fayllar)
DS13 izchillik passi sifatida DS0-lock fayllarga **tegishi mumkin** (DS1–DS11 lock'i endi amal qilmaydi). Foundation agent BARCHA shared/markaziy faylga egalik qiladi (sweep'lar tegmaydi):
- `packages/ui/src/theme/tokens.css` — `--radius-card: 16px` qo'shish.
- `packages/ui/src/theme/mantine-theme.ts` — `dimmed` → `--text-3` map.
- `packages/ui/src/patterns/PageHead.module.css` — H1 22/700 kanonik.
- `apps/web/src/shell/AppShell.tsx` — container max-width qatlam.
- `apps/web/src/shell/nav-config.ts` + `use-page-title.ts` — title kalitlar + yetishmagan path'lar.
- `packages/i18n/src/locales/{uz,ru}.json` — title kalit yarashtirish (serial, yagona egasi).

### 2.4 Faza 2 — Sweep (parallel worktree, disjoint papka)
Har agent disjoint papka(lar)ga egalik + konvensiya-spec'ni so'zma-so'z qo'llaydi (radius→`--radius-card`, dimmed→token, heading→primitiv, dublikat title olib tashlash, container, padding, spacing magic→token, fw800→700). 7 partition:

| P | Papkalar | Asosiy topilmalar |
|---|---|---|
| P1 | `dashboard/` (25) | `CARD_RADIUS=16` const, header D1, spacing magic, dimmed |
| P2 | `settings/` (21) | ikki barobar padding A2, radius16, card-header D1, B2 title |
| P3 | `clinical/` (27) | odontogram radius16, Card/Paper aralash E1, lab-orders |
| P4 | `patients/` (16) | PatientHeaderCard fw800 (F1/D2), Card/Paper, container A1, title dup |
| P5 | `cashier/`+`services/`+`reports/`+`audit/` | PosPanel fontSize15, Container, title dup, surface E1 |
| P6 | `expenses/`+`stock/`+`payroll/` | Container, title dup, MovementHistory order5 |
| P7 | `appointments/`+`queue/`+`schedule/`+`recalls/` | Container, title dup, QueueCard radius16/header, schedule gap/radius9 |

Disjoint papka → merge konfliktsiz. i18n foundation egaligida (serial).

### 2.5 Faza 3 — Merge → Holistik review → Verify → Sync
- **Merge agent:** disjoint partition-branch → `feat/ds13-visual-consistency`.
- **Holistik review (MAJBURIY gate):** butun diff — konvensiya bir xil qo'llanganmi (re-fragmentatsiya yo'q), regressiya yo'q.
- **Verify (real chiqish):** `bunx turbo typecheck` 16/16, `biome check` 0, `turbo test --filter @dental/web` (vitest), **dark-mode kontrast** (CLI-80 darsi). Vizual: ekran screenshot side-by-side (light+dark). Funksional o'zgarish YO'Q (audit kafolati).
- **Sync:** Linear CLI-324…331 → Done; Obsidian `07-Dental-OS-Roadmap.md`.

### 2.6 Workflow skeleti (T1)
```js
phase('Faza 0 — Konvensiya')
const spec = await agent(conventionSpecPrompt(), {schema: CONVENTION})        // serial
phase('Faza 1 — Foundation')
await agent(foundationPrompt(spec), {isolation:'worktree'})                   // serial, central+i18n
phase('Faza 2 — Sweep')
const built = await parallel(PARTITIONS.map(p => () =>
    agent(sweepPrompt(p, spec), {phase:'Sweep', isolation:'worktree', schema:TASKRESULT})))
phase('Faza 3 — Integratsiya')
await agent(mergePrompt(built.filter(Boolean)))
const review = await agent(holisticReviewPrompt(), {schema:REVIEW})
if (review.issues.length) await agent(fixPrompt(review))
const verify = await agent(verifyPrompt(), {schema:VERIFY})                   // real tsc/biome/test/contrast
await agent(syncPrompt(verify))                                              // Linear + Obsidian
return {verify}
```
> Foundation worktree → sweep worktree'lar foundation branch'idan fork bo'lishi kerak (token+theme mavjud bo'lsin). Agar `isolation:'worktree'` main'dan fork qilsa → sweep'lar `--radius-card` ni ko'rmaydi. **Yechim:** foundation'ni asosiy ish-tree'da (worktree'siz) qil VA commit, keyin sweep worktree'lar uni meros oladi; YOKI har sweep prompt foundation-diff'ni o'z ichiga qo'llaydi. (Impl paytida tasdiqlash — DS0 gotcha.)

---

## 3. TRACK 2 — Bookkeeping (arzon, kodsiz)

1 sync-agent (worktree YO'Q, Linear MCP + Obsidian):
- Linear epik **CLI-263 (DS2), CLI-264 (DS3), CLI-265 (DS4), CLI-266 (DS5), CLI-269 (DS8)** → **Done** (kod main'da; izoh: "front-end-only scope'da merge, design-completeness → DS12 katalog").
- Obsidian `07-Dental-OS-Roadmap.md` + `project_ds_execution_state` memory yangilash.
- Prunable worktree registrlarini tozalash: `git worktree prune`.

---

## 4. TRACK 3 — DS12 backend (full-stack, oxirgi)

> ⚠️ **Front-end-only emas** — migration + RLS + OpenAPI regen. 6-fayl modul pattern (RFC-0009). ds12-a DS1+DS8 read-only aggregatlarni yopgani uchun **qolgan**:

| Sub | Mazmun | Tabiat |
|---|---|---|
| **T3-A: DS9 stock** | `stock_items` ga `category` + `price` ustun (migration + RLS + schema + repo + mapper + UI). Reorder tugma omit. | Migration |
| **T3-B: DS10 Notifications** | Yangi settings bo'lim: route+ekran+API+i18n (toggle list). | Yangi modul |
| **T3-C: DS10 Integrations** | Yangi settings bo'lim: route+ekran+API+i18n (card grid). | Yangi modul |
| **T3-D: DS7 tenant-wide plans** | `GET /treatment-plans` tenant-wide (patientId'siz) + yangi ekran (nav `disabled` olib tashlash). | API kengaytma |
| **T3-E: DS7 tenant-wide labs** | Xuddi shunday lab-orders. | API kengaytma |
| **T3-F: DS7 recall depth** | Recall 4 KPI aggregate endpoint + `RecallDto` SMS-delivery field (workflow-status ≠ SMS-delivery). | API + schema |
| **T3-G: DS4 free-slot/waitlist** | Right-rail bo'sh slot + kutish ro'yxati endpoint. | API |

### 4.1 DS12 parallellashtirish chegarasi
- **Migration raqami serial:** T3-A va T3-F (schema o'zgartiradigan) migration-raqamini ketma-ket olishi shart (collision yo'q). Workflow ichida migration-yaratuvchi task'lar **serial**.
- **OpenAPI regen serial nuqta:** har backend task `generate:contract` (`@hono/zod-openapi` → orval) ni qayta ishga tushiradi — **bitta serial regen barrier** hamma backend o'zgarishdan keyin, keyin web-hook'lar.
- **Parallel xavfsiz:** disjoint modul (stock ≠ settings ≠ treatment-plans ≠ lab-orders ≠ recalls ≠ appointments) — impl parallel, faqat migration-raqam + OpenAPI-regen serial.

### 4.2 DS12 to'lqin shakli
```
Wave T3-1 (parallel): T3-B, T3-C, T3-D, T3-E, T3-G  (migration-siz / disjoint modul)
Wave T3-2 (serial):   T3-A, T3-F                     (migration — raqam ketma-ket)
Barrier:              generate:contract (OpenAPI regen) → web-hook update
Wave T3-3:            holistik review + verify (check:rls 35!, role-by-role) + sync
```
> Har DS12 task `ds12-deferred-backend.md` dagi aniq elementga bog'lanadi. Linear'da yangi DS12 milestone + sub-task'lar yaratiladi (hozir yo'q).

---

## 5. Umumiy ijro ketma-ketligi

1. **T1 DS13 workflow** ishga tushirish → tugagach holistik-review+verify ko'rib chiqaman (harness validatsiya). Foydalanuvchi `feat/ds13-visual-consistency` ni main'ga merge qiladi (push'siz ethos).
2. **T2 Bookkeeping** — T1 bilan parallel yoki keyin (arzon).
3. **T3 DS12 backend** — Linear milestone+task yaratish → backend waves → OpenAPI barrier → verify. Eng murakkab, oxirgi.
4. Hammasidan keyin: integratsiya branch → foydalanuvchi main merge + push.

> ⚠️ **T1 ni validatsiya sifatida ishlataman** — harness ishlashini tasdiqlamasdan T3 ni keng ko'lamda ishga tushirmayman (DS0/DS6/DS8 hang tarixi).

---

## 6. Murosasiz xavfsizlik chegaralari (avtonomiyada ham)

1. **Holistik butun-branch review** har merge'dan oldin (per-task review cross-cutting regressiyani yashiradi — CLI-80 WCAG, CLI-153 RBAC darslari).
2. **Rol-bo'yicha verify, real permset, HECH QACHON @owner** (T3 backend uchun kritik — CLI-153).
3. **i18n serial** — bitta task uz/ru egalaydi.
4. **Dark-mode kontrast tekshiruvi** har verify'da (CLI-80/DS0: `--text-on-danger` regressiyasi).
5. **DS13 funksional o'zgarish YO'Q** (audit kafolati — faqat vizual).
6. **DS12: migration-raqam serial + OpenAPI regen barrier + `check:rls` 35** majburiy.
7. **Worktree PATH:** `bunx turbo` (turbo worktree PATH'da yo'q — DS0 gotcha). LSP worktree diagnostikasi ishonchsiz — faqat worktree ichidagi `bunx turbo typecheck` + `bunx vitest run` haqiqat.
8. **Stuck detection:** workflow transcript dir mtime >20 min jim + worktree commit yo'q → TaskStop+restart (commit saqlanadi).
9. **Final main-merge + push foydalanuvchiniki.**

---

## 7. Verify (har track, lokal — yagona gate; CI = startup_failure)

```bash
bunx turbo typecheck                  # 16/16 modul
biome check .                         # 0 xato
bun --filter @dental/api check:rls    # 35 tenant-scoped jadval (T3 uchun kritik)
bunx turbo test --filter @dental/web  # vitest (web)
# Playwright rol-bo'yicha (doctor/receptionist/manager/accountant/technician — @owner EMAS)
# Vizual: DesignSync/screenshot side-by-side; dark+light kontrast
```
