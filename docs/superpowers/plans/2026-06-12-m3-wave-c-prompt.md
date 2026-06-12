# Wave C kickoff prompt (keyingi sessiya uchun)

> Bu faylni keyingi sessiyada to'liq nusxalab promptga joylashtiring (yoki "Wave C ni boshla, `docs/superpowers/plans/2026-06-12-m3-wave-c-prompt.md` ni o'qi" deng).

---

M3 OpenAPI Contract migratsiyasining **Wave C** (oxirgi to'lqin) ni boshlaymiz. Foundation + Wave A + Wave B allaqachon `main`'da (21 modul). Wave C = 7 MURAKKAB modul, keyin Yakuniy CLI-146.

## Hozirgi holat (main'da, tasdiqlangan)
- Pipeline ishlaydi: `@hono/zod-openapi@1.4.0` + Zod 4 → `bun run generate:openapi` → `packages/api-client/openapi.json` → `bun run generate:api-client` (orval `axios-functions`, custom mutator `packages/api-client/src/mutator.ts` = `customInstance`, envelope qaytaradi) → `packages/api-client/src/generated/` → web feature hooks `.data` unwrap.
- 21 modul ko'chgan (spec 47 path / 19 tag). Qolgan hand bloklar `packages/api-client/src/endpoints.ts`: **auth, patients, cashier, reports, expenses, stock, patientImages**.
- Pattern hujjati: `docs/superpowers/specs/2026-06-12-m3-openapi-foundation-design.md` + `docs/superpowers/plans/2026-06-12-m3-openapi-foundation.md`. Memory: `project_dev_workflow_gotchas`.

## Per-modul backend retsepti (har migratsiya uchun bir xil)
1. `<mod>.schema.ts`: `import { z } from '@hono/zod-openapi'` (NOT 'zod'); `z.uuid()` (NOT `z.string().uuid()`); `z.iso.datetime()` (NOT `z.string().datetime()`). Response DTO `.openapi('Name')`. Mavjud request schema'lar saqlanadi.
2. `<mod>.mapper.ts` (yarat): DB row → DTO. **Date → `.toISOString()`** (nullable: `row.x ? row.x.toISOString() : null`). Drizzle `numeric` → JS **string** (money fieldlar string bo'lib qoladi). Hand wire shape'ga AYNAN mos kelishi shart.
3. `<mod>.routes.ts`: `new Hono()` → `new OpenAPIHono()`; app-level `authMiddleware`/`rlsMiddleware` `.use()` saqlanadi; har route `createRoute` + `app.openapi(route, handler)`; per-route `middleware: [requirePermission('<code>')] as const`; path param `path: '/{id}'` + `request.params` (`c.req.valid('param')`); body `request.body` (`c.req.valid('json')`); `responses: okJson(<dtoSchema>, '<desc>')` (helper `apps/api/src/lib/openapi.ts`). Handler `c.json(ok(toDto(row)), 200)`.
   - ⚠️ **404/non-200/201 qaytaradigan handler o'sha statusni `responses`da DECLARE qilishi SHART** (zod-openapi return type'ni cheklaydi). 201 create → manual responses block (`okJson` faqat 200). Pattern namunalari: `apps/api/src/modules/branches/branches.routes.ts` (path-param/404/delete), `apps/api/src/modules/audit/` (paginated `{data,meta}`).

## Per-modul integratsiya (generate'dan keyin, shared fayllar)
- `bun run generate:contract` (1x, hang yo'q — `process.exit(0)` qo'shilgan).
- Barrel `packages/api-client/src/index.ts`: generated funksiya + model tip + `*Result` tiplarini EXPLICIT re-export (`export *` EMAS).
- Hand-tip removal: **RESPONSE tiplari o'chadi** (generated'ga ko'chdi), lekin **`Create*Input`/`*Input` REQUEST tiplari SAQLANADI** (web formlar import qiladi; generated `*Body` boshqa nom — kolliziyasiz). Modul'ning `endpoints.ts` bloki o'chadi. Type fayl bo'shasa o'chir + barrel'dan `export *` ni olib tashla.
- Web `<feature>.api.ts` hooklar generated funksiyani chaqiradi + `.then(r => r.data)`; hook imzosi + query key o'zgarmaydi (komponent tegilmaydi).

## ⚠️ Wave C modullarining MAXSUS risklari (oddiy takror EMAS)
- **CLI-144 auth (9 ep, 7 schema) — ENG RISKLI, ALOHIDA/OXIRGI qil.** `packages/api-client/src/client.ts` transport (mutator asosi) login/refresh/switch-workspace oqimiga bog'liq. `refreshTokens` circular-dep oldini olish uchun `apps/web/src/lib/api.ts` ichida XOM `fetch` bilan chaqiriladi (api.auth.refresh EMAS) — buni BUZMA. auth route'larni createRoute'ga ko'chir, lekin frontend wiring'ni token-refresh tsikli buzilmasligini tekshirib qil. Migratsiyadan keyin: login → refresh → 401-retry → switch-workspace qo'lda yoki integration test bilan tasdiqla.
- **CLI-145 patient-images (5 ep, 2 schema) — multipart/MinIO.** generated mutator `headers`ni forward qilmaydi va multipart'ni qo'llab-quvvatlamaydi. **Upload endpoint hand `api.upload()`'da QOLADI** (Foundation qarori); faqat READ endpointlarni generated'ga ko'chir. types-m5.ts'dagi `PatientImage*` tiplari shu yerda hal qilinadi.
- **CLI-142 patients (11 ep, 9 schema) — eng katta.** Balans + qarindosh (relatives) sub-resurslar. `types-patients.ts` to'liq o'chishi mumkin. Ehtiyot: ko'p endpoint + nested.
- **CLI-141 reports (4 ep, 1 schema) — nested aggregation.** Chuqur nested response shakli — DTO'ni ehtiyot bilan modellashtir.
- **CLI-143 cashier (6 ep, 3 schema) — billing/fiscal.** `types-m3.ts`dagi cashier tiplari (PaymentMethod, CashierTransaction*, DailySummary, StageBalance, PlanBalance) shu yerda hal qilinadi → types-m3.ts bo'shasa o'chir.
- **CLI-139 expenses (10 ep, 4 schema), CLI-140 stock (9 ep, 4 schema) — standart, lekin ko'p endpoint.** `types-erp.ts`dagi expense/stock tiplari.

## Orkestratsiya (isbotlangan tsikl)
1. **Parallel backend agentlar** (disjoint `modules/<mod>/`) — standart modullarni (expenses/stock/reports/cashier/patients) batch qilib parallel; **auth + patient-images ALOHIDA, individual** (risk). Agentlar: backend only, NO generate, NO commit, faqat o'z modul dir.
2. **Orchestrator serial:** parallel agentlardan keyin **barqaror tree'da qayta `bun --filter @dental/api typecheck`** (⚠️ parallel typecheck shovqinli — har agent boshqalarning oraliq holatini ko'radi). Keyin `generate:contract` (1x) → 1 integratsiya agenti (shared fayllar: barrel + hand-removal + web wiring) → verify → biome format → commit.

## Verifikatsiya gate'lari (har sub-wave'dan keyin, MAJBURIY)
- `bun --filter @dental/api typecheck` = 0, `bunx tsc --noEmit` (api-client + web) = 0.
- **Full api suite: `cd apps/api && bun test --env-file=../../.env`** → hozir **104 pass / 0 fail** (regression gate; route migratsiyalari runtime'ni buzmasligini isbotlaydi).
- `bun run generate:contract && git status --short` 2x → idempotent (Biome generated'ni ignore qiladi).
- Commit'dan oldin `bunx biome check --write .` (agentlar format qilmaydi; pre-commit hook format/import-order'da bloklaydi).

## Gotcha'lar (isbotlangan)
- **Stale diagnostics:** harness `<new-diagnostics>` ko'pincha generate/edit tugashidan oldingi snapshot (masalan `GetTenantSettingsResult` "yo'q" deydi, lekin generated'da bor). Doim **fresh `bunx tsc --noEmit` bilan tasdiqla** — u authoritative.
- **Subagent parent SHA misreport:** integratsiya agentlari ba'zan `git rev-parse HEAD~1` ni noto'g'ri (`abc3d87`) xabar beradi — `git log` bilan haqiqiy holatni tekshir.
- **Linear status-drift:** PR commitlari CLI-numberni eslatadi → GitHub auto-link issue'ni In Progress'ga qaytaradi. Status'ni link'dan KEYIN Done qil. Team = "Clinik".
- **Tests:** api = `bun:test` (vitest EMAS), `--env-file=../../.env` bilan.

## Yakunlash
- Har sub-wave: alohida commit. Wave C oxirida: PR (`gh pr create`), Linear CLI-139–145 → Done (link → keyin Done).
- **Yakuniy CLI-146:** barcha modul ko'chgach — qolgan hand `endpoints.ts` + `types-*.ts` to'liq o'chirish (faqat `client.ts` + `mutator.ts` + `generated/` qoladi); barrel faqat generated; butun monorepo `tsc` 0 + full suite yashil. M3 milestone yopiladi.
- CLAUDE.md progress + memory yangila.

## Ishlash uslubi
- superpowers skto'lalaridan foydalan; advisor'ni approach'dan oldin va done'dan oldin chaqir. 1Q-1A terse format. advisor'ning Wave A/B dagi maslahati: parallel backend → serial integrate, har sub-wave'dan keyin to'liq suite, "ishladi" deyishdan oldin fresh tsc + suite.

Boshla: avval Wave C strategiyasini (standart batch + auth/patient-images alohida) tasdiqlab, keyin birinchi parallel backend batch'ni dispatch qil.
