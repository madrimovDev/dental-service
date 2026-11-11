# Orkestratsiya qo'llanmasi — Workflow va parallel agentlar (2026-11-11)

> Kim o'qiydi: **controller** (asosiy Claude sessiyasi) — har bosqich rejasini tuzishda va Workflow skriptini yozishda; **agentlar** — §4 dagi qoidalar ularning prompt'iga kiradi.
> Manba: foydalanuvchi talablari (2026-11-11 brainstorm) + avvalgi orkestratsiya darslari (CLAUDE.md, memory `project_dev_workflow_gotchas`).
> Belgilar: 👤 foydalanuvchi talabi · 🛠 controller qarori · ✅ 2026-11-11 spike bilan tasdiqlangan.

## 0. Asosiy tamoyillar (👤)

1. **Model va effort vazifa qiyinligiga mos** — oddiy ishga Haiku, qiyinroqqa Sonnet, eng qiyiniga Opus; effort ham dinamik.
2. **Advisor faqat asosiy sessiyada.** Workflow/Agent subagentlari advisor chaqirmaydi.
3. **Testlar minimal** — faqat o'zgargan joy va unga bevosita bog'liq testlar. To'liq to'plam **faqat merge oldidan bir marta**; keyingi bosqich boshida qayta yurmaydi.
4. **Parallel bo'la oladigan ish parallel** — ham puxta, ham tez.
5. **Merge va push — controller** o'zi qiladi, foydalanuvchi tasdig'isiz (👤). Agentlar hech qachon `main`ga merge/push qilmaydi.

## 1. Model va effort darajalari

Controller reja yozganda **har vazifaga daraja** qo'yadi (agent o'zi tanlamaydi):

| Daraja | Ish turi (misollar) | `model` · `effort` |
|---|---|---|
| **T0 Mexanik** | belgilangan testlarni yurgizish, typecheck, grep/inventarizatsiya, i18n kalit qo'shish, matn almashtirish, formatlash | `haiku` · `low` |
| **T1 Oddiy** | bitta fayldagi aniq fix (reja kodni ko'rsatgan), tayyor naqsh bo'yicha komponent, mapper/schema qo'shish | `haiku` · `medium` |
| **T2 O'rta** | bir nechta faylli feature, yangi endpoint (tayyor naqsh), test yozish, lane review | `sonnet` · `medium` |
| **T3 Qiyin** | pul, RLS/tranzaksiya, litsenziya/imzo, ruxsatlar, migratsiya, Electron process boshqaruvi | `sonnet` · `high` |
| **T4 Eng qiyin** | adversarial verify (pul/xavfsizlik), murakkab arxitektura qarori bo'lgan implementatsiya | `opus` · `high` |

- **Eskalatsiya (🛠):** vazifa `blocked`/`failed` qaytsa — **bir daraja yuqorida** qayta ishga tushiriladi, xuddi shu darajada qayta urinish yo'q. T4 ham yiqilsa — controller o'zi ko'rib chiqadi.
- **Whole-branch review va merge qarori** — controller (asosiy sessiya, advisor bilan). Workflow'ga berilmaydi.
- Workflow'da: `agent(prompt, { model, effort, agentType, ... })`. Agent tool'da: `model` parametri; effort — agent turi frontmatter'i.

## 2. Advisor taqiqi — qanday majburlanadi

✅ **Spike natijalari (2026-11-11, restart'dan keyin):**
- standart `general-purpose` **va** maxsus `.claude/agents/*` turlarida ham `advisor` **mavjud** — `tools:` allowlist ham, `disallowedTools: advisor` ham uni olib tashlamaydi;
- sabab (Claude Code hujjati, tools-reference): advisor — API tomonida ishlaydigan **server tool**, «permission qoidalari yoki hook matcher'larida ishlatiladigan nomi yo'q»; subagentlar sozlangan advisor'ni meros qiladi;
- yagona rasmiy o'chirgich `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` — butun jarayon uchun, **asosiy sessiyada ham** o'chiradi (👤 talabiga zid, ishlatilmaydi);
- per-call `model` override **ishlaydi** (frontmatter `sonnet` → chaqiruvda `haiku` = Haiku 5.5 tasdiqlandi).

**Demak texnik blok hozircha yo'q.** Uch qatlamli nazorat:
1. **Prompt:** har agent turi tanasida va har Workflow prompt'ida «`advisor` tool'ini chaqirma» (agentlar spike'da buni bajardi — chaqirmadi).
2. **Audit (majburiy, har Workflow'dan keyin):** controller agent transkriptlarida advisor chaqiruvini qidiradi: `grep -l '"type":"server_tool_use","id":"[^"]*","name":"advisor"' <transcriptDir>/agent-*.jsonl` (✅ format asosiy sessiya transkriptida tasdiqlangan). ⚠️ Oddiy `'"name":"advisor"'` ishlatilmaydi — transkriptda tool ta'rifi (`advisor_20260301`) ham bor, har agentda soxta moslik beradi. Topilsa — o'sha agent natijasi qayta ko'rib chiqiladi va qo'llanmaga yoziladi.
3. **Hisobot:** schema'da `advisorCalled: boolean` maydoni.

Agar keyinchalik Claude Code per-agent opt-out qo'shsa — shu bo'lim yangilanadi (community so'rovi mavjud).

## 3. Agent turlari (`.claude/agents/`)

| Tur | Vazifasi | Standart model/effort | Tools (allowlist; advisor baribir meros — §2) | Yozadimi |
|---|---|---|---|---|
| `scout` | kodni o'qib xarita/inventar | haiku · medium | Read, Bash (faqat o'qish) | yo'q |
| `implementer` | reja vazifasini kodlaydi, o'z branch'iga commit | darajaga qarab (per-call override) | Read, Edit, Write, Bash | ha (o'z worktree'sida) |
| `test-runner` | **berilgan** test fayllari + typecheck, natijani qaytaradi | haiku · low | Bash, Read | yo'q |
| `reviewer` | lane diff'ini spec/reja bo'yicha ko'radi | sonnet · medium | Read, Bash (git diff) | yo'q |
| `verifier` | pul/xavfsizlik/RLS adversarial tekshiruv (rad etishga urinadi) | opus · high | Read, Bash | yo'q (faqat test skripti scratchpad'da) |

Agent turlari fayllari: `.claude/agents/*.md` (frontmatter `name`, `description`, `tools`, `model`; tana — §4 qoidalari). ⚠️ Tool nomlari: bu muhitda subagentlarda `Grep`/`Glob` yo'q — qidiruv `Bash` (grep/find) orqali. ✅ Workflow'da `agentType` + `schema` + `model`/`effort` birga ishlaydi: allowlist'li turda `StructuredOutput` avtomatik qo'shiladi (probe: `test-runner`, haiku/low → `claude-haiku-5-5`, tools `Bash, Read, StructuredOutput, advisor`).

## 4. Agent uchun majburiy qoidalar (prompt'ga kiradi)

1. `advisor` chaqirilmaydi.
2. Faqat o'z worktree/branch'ida ishlaydi; **`main`ga merge, push, `git stash` yo'q**.
3. **`bun install` yo'q** (controller qiladi — §5.2).
4. **Testlar:** faqat vazifada **nomlangan** test fayllari va tegilgan paket typecheck'i. To'liq `turbo test` / `bun test` (argumentsiz) taqiqlanadi.
5. **Yangi test** faqat haqiqiy xavf bor joyda: pul, RLS/tranzaksiya, ruxsatlar, migratsiya, litsenziya/imzo. U yerda **kamida bitta real-adapter testi** (real DB/Redis/BullMQ), spy-dep testlar to'plami emas.
6. **Ruxsat tekshiruvi** — real cheklangan rol bilan, `@owner` emas.
7. Yangi permission kodi kerak bo'lsa — tor endpoint yoki backfill migratsiya (roadmap §5).
8. `generate:contract` (OpenAPI → api-client) **faqat controller**/integratsiya vazifasi ishga tushiradi — parallel lane'lar emas.
9. **Hisobot (schema bilan):** `advisorCalled` (bool), `status` (`done`/`blocked`/`failed`), `branch`, `commits`, `testsRun` (fayl + natija), `typecheck`, `notDone` (qilinmagan narsa — yashirilmaydi), `windowsOnly` (bool). «Done» faqat testlar yashil va commit mavjud bo'lsa.

## 5. Parallel ijro

### 5.1 Lane'lar
- Reja har bosqichni **lane**larga bo'ladi: bir lane = fayllari boshqa lane'lar bilan kesishmaydigan vazifalar zanjiri.
- Umumiy fayllar (`app.ts`, `role-templates.ts`, `packages/i18n/*.json`, migratsiya raqamlari, `nav-config.ts`, api-client barrel) — **bitta ketma-ket integratsiya lane**'ida, parallel lane'lar tugagach.
- **Migratsiya raqamlari** reja vaqtida oldindan biriktiriladi (to'qnashuv bo'lmasin).
- **Bir vaqtda maksimum 4 ta yozuvchi agent** (🛠). Workflow'da bunday sozlama yo'q — skript lane'larni 4 tadan **chunk** qilib ishlatadi. Sabab: avval 11 parallel agent Docker'ni yiqitgan.

### 5.2 Worktree tayyorlash (controller, Workflow'dan oldin)
✅ Spike natijalari:
- worktree'da `@dental/*` importlari **worktree'ning o'z** `packages/`iga resolve bo'ladi; `tsc --noEmit` ishlaydi — `bun install` shart emas;
- `.env` gitignore qilingan → worktree'da yo'q → API testlari `Environment validation failed` bilan yiqiladi. **Controller har worktree'ga `.env` nusxasini qo'yadi.**

Tartib:
1. `git worktree add .claude/worktrees/<lane> -b wf/<stage>-<lane> main` (Workflow `isolation:'worktree'` o'rniga — eskirgan-commit muammosi bo'lgan; controller o'zi yaratadi va `git merge-base main wf/...` = `main` tip ekanini tekshiradi).
2. `.env` nusxasi (+ `apps/supervisor-api/.env`) va **paketlarning o'z `node_modules` papkalariga symlink**: `for d in apps/*/node_modules; do ln -s "$PWD/$d" "$WT/$d"; done`. ✅ P bosqichi 2 darsi: `apps/supervisor-api` o'zining **zod 3** nusxasini ishlatadi; worktree'da u yo'q bo'lsa ildizdagi zod 4 olinadi va `zValidator` tip xatolari chiqadi (implementer kodni «zod v3 API»ga moslashtirishga urindi). Symlink `.gitignore`ga tushmaydi (`node_modules/` — papka naqshi) — commit'da `git add -A` emas, aniq yo'llar.
3. Lane bazasi va Redis indeksi (§5.3).
4. Workflow `args` orqali har lane'ga: worktree yo'li, branch, `DATABASE_URL`, `DATABASE_ADMIN_URL`, `REDIS_URL`, vazifalar ro'yxati, test fayllari.

### 5.3 Lane'ga alohida test bazasi va Redis
✅ Spike natijasi: shell'dagi `DATABASE_URL` `--env-file`dagi qiymatdan **ustun**; `dental_test_lane1` yaratilib `migrate.ts` bilan to'liq migratsiya qilindi va integration test unga qarshi o'tdi.

- Har lane: `dental_test_<stage>_<lane>` (controller yaratadi + `migrate.ts` + **faqat `seedPermissions`** (`seedDiagnoses` EMAS — `clinical.test.ts` o'z diagnozlarini qo'shadi va `diagnoses_code_unique` bilan yiqiladi) — permission katalogi migratsiyada emas, API boot'da seed qilinadi; seed'siz `provisioning-tenant` testi yiqiladi) va `REDIS_URL=…/<N>` (N = 1…15, lane bo'yicha) — rate-limit va BullMQ kalitlari aralashmaydi.
- ✅ **Lane URL'lari worktree'dagi `.env` nusxasiga yoziladi** (`DATABASE_URL`, `DATABASE_ADMIN_URL`, `REDIS_URL` almashtiriladi) — buyruq prefiksi emas. P bosqichi 1 darsi: prefiksni unutgan reviewer'lar `dental_test_…` topa olmadi yoki (yomonroq holda) dev bazasida `TRUNCATE` qilishi mumkin edi.
- ⚠️ **Shell env `--env-file`dan USTUN.** Controller lane'ni tayyorlayotganda `set -a; . ./.env` qilsa, keyingi `bun --env-file=… migrate` **asosiy `dental` bazasiga** ketadi (P bosqichi 2 da shunday bo'ldi — idempotent bo'lgani uchun zarar yo'q). Lane migratsiya/seed buyruqlari `env -u DATABASE_URL -u DATABASE_ADMIN_URL -u REDIS_URL bun --env-file=…` bilan yuriladi va natija `select count(*) from permissions` (64 kutiladi) bilan tekshiriladi.
- Supervisor lane'i: worktree'dagi `apps/supervisor-api/.env`da `DATABASE_URL` → `supervisor_test_<stage>_<lane>`, `db:migrate` (seed admin yaratadi). `bun run test` skripti `-u DATABASE_URL` qiladi, shuning uchun `.env` yagona manba.
- Shu bilan **verify ham parallel** bo'la oladi (avval bitta umumiy baza sabab serial edi).
- Bosqich oxirida controller lane bazalarini o'chiradi.

### 5.4 Workflow skeleti

```
pipeline(lanes,
  lane  => implement (implementer, lane.tier)     // o'z worktree, nomlangan testlar
  r     => test-runner (haiku/low)                 // mustaqil qayta yurgizish, agent da'vosiga ishonilmaydi
  r     => reviewer (sonnet/medium)                // spec bo'yicha diff
  r     => r.risky ? verifier (opus/high) : r      // faqat pul/xavfsizlik/RLS lane'lari
)
```
- `blocked`/`failed` → §1 eskalatsiya (yangi chaqiruv, bir daraja yuqori).
- Lane natijalari qaytgach — controller: integratsiya lane → merge tayyorlash.

## 6. Merge gate (bosqich oxirida, bir marta)

Controller `main`ga merge qilishdan oldin, **birlashtirilgan** branch'da bir marta:
1. `turbo typecheck`, `check:rls`; biome — faqat **tegilgan fayllar** (`bunx biome check <diff fayllari>`), chunki `supervisor-api`da avvaldan mavjud lint xatolari bor (`docs/KNOWN-TEST-FAILURES.md`);
2. to'liq API test to'plami + web vitest;
3. **Mezon:** yangi yiqilish yo'q. Ma'lum yiqilishlar ro'yxati (`mock.module` fayllararo oqishi va concurrent EXCLUDE poygasi — CLAUDE.md 2026-08-07 bloki, 9 ta) `docs/KNOWN-TEST-FAILURES.md`da nomma-nom saqlanadi va gate unga qarshi solishtiriladi. Ro'yxatdagi test **izolyatsiyada** yashil bo'lishi shart;
4. **mutatsiya tekshiruvi** — implementer «failing-first» qadamini o'tkazib yuborgan har yangi test uchun controller kodni vaqtincha buzib testni yiqilishini ko'radi (keyin `git checkout <fayl>`, stash yo'q);
5. whole-branch review (controller + advisor) — merge nuqtasida tug'ilgan nuqsonlar uchun (2026-08-06 darsi);
6. merge (`--no-ff`) + push; worktree/branch/lane bazalari tozalanadi.

Keyingi bosqich boshida to'liq to'plam **qayta yurmaydi** (👤) — oxirgi gate natijasi boshlang'ich holat.

## 7. Holat va hujjatlash

- **Windows-only** vazifa: `windowsOnly: true` → holat «kod tayyor, Windows'da tekshirilmagan», Done emas; `DESKTOP-WINDOWS-BUILD-TEST.md`ga tekshiruv bandi qo'shiladi.
- Har bosqich merge'idan keyin: reestr (`FINDINGS-REGISTER`) holat ustuni, CLAUDE.md yuqori bloki, Obsidian `01-Qarorlar.md` (yangi qaror bo'lsa) — **darhol**, keyinga qoldirilmaydi.
- Workflow tugagach tozalash: `git worktree list`, `wf/*` branch'lar, lane bazalari, qolgan Docker konteynerlar.

## 8. Ma'lum tuzoqlar (avvalgi roundlardan)

| Tuzoq | Choralar |
|---|---|
| Worktree eskirgan commit'dan | controller o'zi yaratadi + `merge-base` tekshiruvi (§5.2) |
| Parallel `bun install` Docker'ni yiqitdi | agentlar install qilmaydi; ≤4 yozuvchi (§5.1) |
| Bitta test bazasi → deadlock, soxta yiqilishlar | lane bazasi + Redis indeksi (§5.3) |
| Rate-limit Redis ifloslanishi → 429 | lane Redis indeksi; testlarda unikal `x-real-ip` |
| `mock.module` fayllararo oqishi | ma'lum ro'yxat, izolyatsiyada tekshirish (§6) |
| `@owner` ruxsat kamchiligini yashiradi | real cheklangan rol (§4.6) |
| Spy-dep testlar real cheklovni yashiradi | real-adapter testi (§4.5) |
| Agentlar `main`ga o'zlari merge qildi | taqiq (§4.2); merge faqat controller |
| «Done» deb yolg'on yopish | schema hisobot + mustaqil `test-runner` qayta yurgizishi (§5.4) |
| Harness diagnostikasi eskirgan | `tsc --noEmit` / `typecheck --force` — haqiqiy manba |
| `resumeFromRunId` parallel sibling'larni qayta yurgizadi | yiqilgan lane'ni alohida kichik Workflow bilan qayta ishga tushirish |
