# M5 kickoff prompt (keyingi sessiya uchun)

> Bu faylni keyingi sessiyada to'liq nusxalab promptga joylashtiring (yoki "M5 ni boshla, `docs/superpowers/plans/2026-06-12-m5-kickoff-prompt.md` ni o'qi" deng).

---

**M5 — R2 Ekranlarni teal design system'ga qayta dizayn (CLI-35 epik)** ni boshlaymiz. M3 (OpenAPI Contract) endigina yopildi — bu M5 ni unblock qildi.

## Maqsad (CLI-35)

Backend'i **allaqachon tayyor va ishlaydigan** ekranlarni Claude Design "clinik" teal design system'ga (rol-adaptiv UX) ko'chirish. Bu asosan **VIZUAL/UX qayta dizayn** — funksionallik mavjud, qayta yozilmaydi.

Ekran guruhlari: **bemor** · **yozilish/kalendar** · **navbat** · **kassa (POS)** · **xizmatlar/narx** · **klinik** (odontogram/davolash rejasi/vizit/resept/lab/konsent/rasm) · **settings/roles/branches/users**.

## ⚠️ Scope tuzog'i (gap-analysis ogohlantirdi — O'QING)

`docs/design-architecture-gap-analysis.md` §1: dizayn to'liq vizyonni qamraydi va scope'ni kengaytirishga moyil. **Lekin ko'ndalang gap'lar allaqachon yopilgan:** bemor balansi + 6 rol dashboard + hisobot qatlami **R3'da (M6) qurilgan**; ombor/xarajat/payroll/bildirishnoma **R4'da (M7) qurilgan**. Demak **M5 = faqat mavjud ekranlarni teal dizaynga ko'chirish + kichik maydon gap'lari** (bemor teg/manba/sug'urta — agar hali qo'shilmagan bo'lsa, backend tekshir). **Yangi modul/katta backend ish M5 EMAS** — agar dizayn yangi narsa talab qilsa, alohida task yarat, scope'ga tortma.

## Joriy holat (tasdiqlangan, 2026-06-12)

- **9 milestone'dan 7 tasi 100%:** M0–M4, M6, M7. M5 (bu) + M8 (sayqal) qoldi.
- **Generated api-client TAYYOR (M3):** har endpoint `@dental/api-client` generated funksiya orqali; web feature hook'lar `.then(r=>r.data)`; response tiplar generated model. Yangi ekran data'si uchun hand fetch YOZILMAYDI — feature `<f>.api.ts` hook + generated funksiya.
- **Shell + theming TAYYOR (R0/M1 + R1/M4):** Mantine teal theme, `packages/ui` dizayn-tizim primitivlari (Button/Card/Input/Tag/StatusPill/Tabs/StatCard…), app shell (topbar/sidebar/workspace switcher), rol-adaptiv landing (R3).
- **Feature-folder arxitektura (RFC-0010):** `apps/web/src/features/<feature>/` (`index` · `<f>.api.ts` · `<f>.keys.ts` · `<f>.schema.ts` · `<f>.mappers.ts` · `<f>.types.ts` · `components/`). Mavjud feature'lar: appointments, audit, cashier, clinical, dashboard, expenses, notifications, patients, payroll, queue, reports, services, settings, stock.
- **Mavjud pages:** `apps/web/src/pages/` — patients, settings, appointments, audit, cashier, expenses, home, payroll, profile, queue, reports, stock + auth/.

## Dizayn manbalari (kerakli o'qish)

- `docs/ux-ia-concept.md` — UX/IA konsept (rol-adaptiv navigatsiya, ekran tuzilishi)
- `docs/design-architecture-gap-analysis.md` — dizayn ↔ backend moslik xaritasi + scope qaror (TL;DR §1, moslik jadval §2)
- `docs/design-tokens.md` — teal palette + token'lar
- `docs/rfcs/0003-design-system-theming.md` — design system + theming qarori
- `docs/rfcs/0004-app-shell-navigation.md` — shell + navigatsiya
- `docs/rfcs/0010-frontend-feature-architecture.md` — feature-folder qatlam (komponent → api.ts → generated)
- Claude Design "clinik" bundle (teal, 30+ ekran) — agar Figma/bundle mavjud bo'lsa, mos ekran referensini ol; yo'q bo'lsa foydalanuvchidan so'ra.

## Birinchi qadam: epik dekompozitsiya

CLI-35 epik **sub-tasklarga BO'LINMAGAN** (faqat 2 tech-debt sub-task: CLI-117 float-pul/forma-DRY [asosan won't-fix], CLI-114 PlanCard N+1 [backend follow-up]). **Avval ekran guruhlari bo'yicha sub-task tuz** (Linear team "Clinik", parent CLI-35, milestone "M5 — R2 Ekranlar"). Taklif (gap-analysis + UX konsept asosida tasdiqla):
- bemor (list + karta + tibbiy + balans tab + teg/manba/sug'urta gap)
- yozilish/kalendar + navbat
- kassa POS + kunlik svod
- xizmatlar/narx
- klinik (odontogram/plan/vizit/resept/lab/konsent/rasm — eng katta, balki bo'linadi)
- settings/roles/branches/users

## Pattern (har ekran guruhi)

- **`frontend-design` skill** ishlat (distinctive, production-grade UI; generic AI estetikadan qoch).
- `packages/ui` primitivlarini ishlat; yangi umumiy primitiv kerak bo'lsa `packages/ui` ga qo'sh (feature-ichida emas).
- Design token'lar (`docs/design-tokens.md`) — hardcoded rang/spacing YO'Q.
- i18n: har matn `t()` (uz/ru) — `packages/i18n`.
- Data: faqat feature `<f>.api.ts` hook (generated api-client); `fetch()` taqiq.
- Forms: `@mantine/form` + `zod4Resolver` (Qaror #12 — Zod 4).
- Komponent api-client'ni BEVOSITA chaqirmaydi (RFC-0010 qatlam).

## Verifikatsiya gate'lari

- `bunx tsc --noEmit` (web) = 0 · `bun --filter @dental/web test` (vitest) yashil.
- Pizual: `/run` yoki `verify` skill bilan ekranni haqiqiy app'da ko'r (Playwright/screenshot) — dizayn mosligini tasdiqla.
- Har ekran guruhi: alohida commit; M5 oxirida PR.
- Commit'dan oldin `bunx biome check --write .` (pre-commit hook biome+typecheck).

## Gotcha'lar (M3'dan o'rganilgan, memory `project_dev_workflow_gotchas`)

- Web test = **vitest** (`bun --filter @dental/web test`), `bun test` EMAS (vi.mock qo'llamaydi).
- Generated model tiplar barrel'da (`@dental/api-client`); response surface 100% generated. Request tiplar (`Create*Input`) hand (`types-clinical.ts`/`types-m5.ts`) — formlar ishlatadi.
- Linear status drift: PR commit CLI-num eslatadi → GitHub auto-link issue'ni In Progress qiladi; Done'ni link'dan KEYIN qil. Team = "Clinik".

## Ishlash uslubi

- superpowers skill'lardan foydalan: bu **dizayn/yangilik ishi** → `superpowers:brainstorming` BIRINCHI (har ekran guruhi UX/scope), keyin `frontend-design`. Plan → `superpowers:writing-plans` (multi-ekran), keyin `executing-plans`/`subagent-driven-development`.
- `advisor`'ni approach'dan oldin (scope tasdiqlash — tuzoq!) va "done" dan oldin chaqir. 1Q-1A terse format.
- ⚠️ Scope intizomi: M5 = vizual qayta dizayn. Backend/yangi modul ishtahasi paydo bo'lsa — advisor bilan tekshir, alohida task qil.

Boshla: avval gap-analysis §1+§2 + ux-ia-concept o'qi, M5 scope'ini (faqat-vizual ekanini) advisor bilan tasdiqla, keyin CLI-35 ni ekran-guruh sub-tasklariga bo'l va birinchi guruhni (taklif: bemor yoki kassa — eng ko'p ishlatiladigan) brainstorm qil.
