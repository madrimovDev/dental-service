# Production Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this plan — tasks are research/API-filing work, not code TDD cycles) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically find every remaining gap between "code complete" and "production ready" across the Local Desktop epic and the wider platform, and file each as a Linear issue.

**Architecture:** Direct marker grep → 6 parallel audit agents (one per subsystem) → verification pass against current code (reject stale findings) → file Group 1 (4 known items) and Group 2 (verified findings) as Linear issues, all under one project.

**Tech Stack:** Bash/grep (scan), Agent tool (parallel subsystem audits), Linear MCP (`mcp__linear-server__save_issue`).

## Global Constraints

- Every issue created goes to team **"Clinik"** (id `dc16d25a-a04b-48b7-8025-7815b6ff7131`), project **"Dental Service — Desktop & Supervisor"** (id `67bf471d-4e7b-43ef-88c4-ceaf93f77609`). No other project, no project-less issues.
- Priority: `3` (Medium) default; `2` (High) for security/correctness gaps; `4` (Low) for cosmetic/polish.
- Any finding whose fix requires external input (credentials, a spec/XSD, a physical machine) gets its description prefixed with a line `BLOCKED: <exact external input needed>`.
- No finding is filed until Task 3's verification step has confirmed it is still true against the current `main` HEAD (commit `8d2cf8e` at plan-writing time) — reject and log (don't file) anything already fixed.
- Never invent a Linear project — if `mcp__linear-server__save_issue` is called with `project` other than the one above, that is a plan violation.

---

### Task 1: Direct marker scan

**Files:**
- Create (scratch, not committed): `/tmp/claude-1000/-home-madrimov-Projects-dental-service/8673b972-c13d-441a-bb33-6369492e8a4f/scratchpad/marker-scan.txt`

**Interfaces:**
- Produces: a plain-text file of `path:line:match` rows for Task 3 to cross-reference against agent findings (dedup) and for the audit summary.

- [ ] **Step 1: Run the marker grep across source and docs**

```bash
cd /home/madrimov/Projects/dental-service
{
  grep -rn --include='*.ts' --include='*.tsx' -E 'TODO|FIXME|won.t.fix|deferred|scaffold|TBD' apps packages
  grep -rn -E 'TODO|FIXME|deferred|scaffold|TBD|Phase 2|keyinroq|won.t.fix' docs/rfcs CLAUDE.md
} > /tmp/claude-1000/-home-madrimov-Projects-dental-service/8673b972-c13d-441a-bb33-6369492e8a4f/scratchpad/marker-scan.txt
wc -l /tmp/claude-1000/-home-madrimov-Projects-dental-service/8673b972-c13d-441a-bb33-6369492e8a4f/scratchpad/marker-scan.txt
```

Expected: a non-empty file; line count printed (this is a discovery scan, no fixed expected count).

- [ ] **Step 2: Read the scan output and hand-pick real candidates**

Read the file. Discard: test fixtures using "TODO" as sample data, comments explaining *why* something is intentionally simple (not a gap), and anything already covered by the 4 known Group 1 items (`requireModule`, `uploads.ts` mount, settings IPC, Windows manual verify). Keep a short list of `{file, line, snippet, hypothesis}` in your own working notes for Task 3 — no file write required, this feeds directly into Task 3's cross-reference.

No commit for this task (scratch output only, nothing under version control changes).

---

### Task 2: Dispatch 6 parallel subsystem audit agents

**Files:** none (Agent tool dispatch only; agents are read-only — Explore/general-purpose, no Edit/Write).

**Interfaces:**
- Produces: 6 arrays of findings, each item shaped `{ title: string, file: string, line: number|null, evidence: string, why_it_matters: string, blocked_external: string|null, severity: "high"|"medium"|"low" }`. Task 3 consumes this shape.

- [ ] **Step 1: Send all 6 Agent calls in a single message (parallel), each with the exact prompt below**

Agent 1 — Backend API:
```
Auditing apps/api for production-readiness gaps in the dental-service monorepo (Bun+Hono+Drizzle+Zod, RLS-based multi-tenant backend). Read-only research, do not edit anything.

Look specifically for: (a) middleware defined but never applied to any route (grep for exported middleware factories in apps/api/src/lib and apps/api/src/middleware, then check every apps/api/src/modules/*/*.routes.ts and apps/api/src/app.ts for actual usage), (b) route files that exist under apps/api/src/routes/ or apps/api/src/modules/*/ but are never imported/mounted in apps/api/src/app.ts, (c) requirePermission-guarded endpoints missing an audit_log write where CLAUDE.md section 3.10 says one is required, (d) hardcoded TODO/FIXME comments describing unfinished business logic (not style nits).

For each finding return: title, file, line, evidence (the actual code/comment), why_it_matters (concrete failure scenario), blocked_external (null unless it truly needs a credential/spec the user must supply), severity (high/medium/low — high only for security or silent-data-corruption issues).

Report your findings as a structured list in your final message — this is not a human-facing summary, return raw data. Under 15 findings, ranked most important first.
```

Agent 2 — Frontend web:
```
Auditing apps/web for production-readiness gaps in the dental-service monorepo (Vite+React+Mantine v7, feature-folder architecture per docs/rfcs/0010-frontend-feature-architecture.md). Read-only research, do not edit anything.

Look specifically for: (a) hardcoded uz/ru UI strings that bypass t() (CLAUDE.md section 3.9 requires all UI text through i18n) — spot-check a sample of feature components, don't try to be exhaustive, (b) "coming soon" / disabled / stub UI states left in nav or screens that look like they were meant to be temporary, (c) any component still calling fetch() directly instead of packages/api-client (CLAUDE.md forbids this), (d) known-deferred items referenced in CLAUDE.md or docs/rfcs that don't yet have a corresponding fix in the code (search docs/rfcs and CLAUDE.md for "deferred"/"TODO"/"won't-fix"/"Phase 2" mentions tied to apps/web, then check if the code still matches that description).

For each finding return: title, file, line, evidence, why_it_matters, blocked_external (null unless truly needs external input), severity (high/medium/low).

Report your findings as a structured list in your final message — raw data, not a human summary. Under 15 findings, ranked most important first.
```

Agent 3 — Desktop/Supervisor (beyond the 4 known items):
```
Auditing apps/desktop, apps/supervisor-api, apps/supervisor-admin, and infra/supervisor for production-readiness gaps. Read-only research, do not edit anything.

4 items are ALREADY KNOWN and must be EXCLUDED from your findings: (1) requireModule middleware not mounted anywhere, (2) apps/api/src/routes/uploads.ts not mounted in app.ts, (3) web /settings not calling window.dentalDesktop.setServerUrl(), (4) no physical Windows verification has been done. Do not re-report these.

Look specifically for other loose ends: (a) apps/desktop electron-builder / NSIS config — is code-signing configured or left as a placeholder/unsigned (check apps/desktop/package.json build config and any *.yml electron-builder config), (b) auto-updater (electron-updater, generic provider per CLI-357) — is the update feed URL a real endpoint or a placeholder, (c) apps/supervisor-api — any TODO/incomplete license-lifecycle logic (revocation, expiry, heartbeat failure handling), (d) apps/supervisor-admin — any screen that calls a backend endpoint that doesn't exist yet, or any obvious missing CRUD screen implied by supervisor-api's routes but absent in the admin UI.

For each finding return: title, file, line, evidence, why_it_matters, blocked_external (null unless truly needs external input like a code-signing cert or a real update-feed host), severity (high/medium/low).

Report your findings as a structured list in your final message — raw data, not a human summary. Under 15 findings, ranked most important first.
```

Agent 4 — V3 external-dependency scaffolds:
```
Auditing packages/fiscal, packages/notifications, apps/telegram-bot, and any 1C-export / insurance-related code in the dental-service monorepo for the exact gap between "scaffold" and "live". Read-only research, do not edit anything.

Per CLAUDE.md, these were built to a scaffold boundary in M14 (V3): Soliq fiscal provider (packages/fiscal — NoOp + Soliq skeleton), Telegram notification channel (packages/notifications + apps/telegram-bot Telegraf skeleton), 1C export (tx-level endpoint + provisional CSV, format not yet matched to client's real XSD), insurance JSONB extension. For EACH of these four, read the actual code and determine precisely: what is implemented and working today vs. what specific external input (real Soliq credentials + TLS cert, a real Telegram bot token, the client's actual 1C XSD schema, anything else) is the ONLY thing blocking it from being live. Do not guess — read the code (e.g. packages/fiscal/src/*, apps/telegram-bot/src/*, the 1C export route and its CSV mapper) and state the concrete blocking gap for each.

For each of the 4 areas return one finding: title, file (the key file(s)), line, evidence (what the code currently does, e.g. "NoOp provider always returns fiscalId: null"), why_it_matters, blocked_external (the exact external input required — never null for this agent's findings, these are all external-dependency by definition), severity (medium for all, since these are known-scoped not surprises).

Report your findings as a structured list in your final message — raw data, not a human summary. Exactly 4 findings, one per area.
```

Agent 5 — Docs/RFC/CLAUDE.md history:
```
Auditing docs/rfcs/*.md and CLAUDE.md in the dental-service repo for decisions explicitly marked as deferred, won't-fix, or Phase-2-only that might still represent open work. Read-only research, do not edit anything, do not re-derive project history from git log — read the documents themselves.

Grep CLAUDE.md and docs/rfcs for "deferred", "won't-fix", "wont-fix", "Phase 2", "keyinroq", "TODO", "kerak bo'ladi", "hali yo'q", "TBD". For each hit, determine: is this actually still open (check the referenced code path if one is named), or has it since been resolved (cross-check Linear if a CLI-### ticket number is mentioned — issues may already be Done even if CLAUDE.md's prose wasn't updated, this has happened before with CLI-182). Only report items that are STILL open after that check.

For each finding return: title, file, line (in the doc), evidence (the quoted sentence), why_it_matters, blocked_external (null unless the doc itself says it needs external input), severity (high/medium/low).

Report your findings as a structured list in your final message — raw data, not a human summary. Under 10 findings.
```

Agent 6 — Infra/deploy/CI:
```
Auditing infra/, .github/workflows/, and root-level build/deploy config in the dental-service monorepo for production-deploy-readiness gaps. Read-only research, do not edit anything.

Look specifically for: (a) whether infra/docker-compose.yml (per-clinic deploy) and infra/supervisor/ (central VPS) configs are complete enough to actually deploy, or reference placeholder values (fake domains, example.com, changeme passwords) that would need real values before a production deploy, (b) .github/workflows/*.yml — is CI actually green/runnable, or is there a known startup_failure (CLAUDE.md mentions "main CI startup_failure (runner/billing)") — confirm if that's still the case by reading the workflow file for anything that looks mis-configured, (c) whether there's a Caddyfile or reverse-proxy/TLS config for production HTTPS termination, or if that's entirely unaddressed.

For each finding return: title, file, line, evidence, why_it_matters, blocked_external (e.g. real domain name, CI billing fix, TLS cert — null only if genuinely fixable in code alone), severity (high/medium/low).

Report your findings as a structured list in your final message — raw data, not a human summary. Under 10 findings.
```

- [ ] **Step 2: Collect all 6 returned arrays into one combined raw-findings list**

No file write needed — hold the 6 results (each agent's returned text/structured list) as working context for Task 3.

No commit for this task (research only).

---

### Task 3: Verify raw findings against current code, produce the final filed list

**Files:** none created (verification reads existing files only).

**Interfaces:**
- Consumes: Task 1's candidate list + Task 2's combined raw-findings list (shape: `{title, file, line, evidence, why_it_matters, blocked_external, severity}`).
- Produces: a single deduplicated `verified_findings` list, each item additionally tagged `outcome: "confirmed" | "rejected_stale" | "rejected_duplicate"`. Only `"confirmed"` items proceed to Task 5.

- [ ] **Step 1: Deduplicate**

Merge Task 1's candidates and Task 2's 6 arrays. Two findings are duplicates if they reference the same `file` within 5 lines of each other, or describe the same underlying gap in different subsystems' words (e.g. Agent 1 and Agent 5 both flagging the same unmounted route). Keep the more detailed one; drop the other with `outcome: "rejected_duplicate"`.

- [ ] **Step 2: Verify each remaining finding against current `main` HEAD**

For each finding, run a targeted check before trusting it:

```bash
cd /home/madrimov/Projects/dental-service
# Example pattern — substitute the actual file/line/symbol from the finding:
sed -n '<line-10>,<line+10>p' <file>
grep -rn '<the specific symbol/route/import the finding claims is missing>' apps apps/api/src/app.ts 2>/dev/null
```

If the check shows the finding is already fixed (e.g. the route IS mounted now), mark `outcome: "rejected_stale"` and do not file it — this mirrors the CLI-182 lesson (CLAUDE.md said "ochiq" but Linear showed it was Done since 2026-06-22). If the check confirms the gap is real, mark `outcome: "confirmed"`.

- [ ] **Step 3: Assign final priority per finding**

Apply Global Constraints priority mapping: `severity: "high"` → Linear priority `2`; `"medium"` → `3`; `"low"` → `4`.

No commit for this task (verification only, no files change).

---

### Task 4: File Group 1 — the 4 known Local Desktop closure items

**Files:** none (Linear API calls only).

**Interfaces:**
- Consumes: nothing external — these 4 items are fully specified below, already confirmed in this conversation's earlier investigation.
- Produces: 4 Linear issue IDs, needed by Task 6's summary.

- [ ] **Step 1: File issue 1 — mount `requireModule`**

Call `mcp__linear-server__save_issue` with:
```json
{
  "title": "requireModule litsenziya-gating middleware hech qaysi route'ga qo'llanmagan",
  "team": "Clinik",
  "project": "Dental Service — Desktop & Supervisor",
  "priority": 2,
  "description": "`apps/api/src/lib/license-middleware.ts`da `requireModule(module)` factory yozilgan va test qilingan (`license-middleware.test.ts`), lekin `apps/api/src/app.ts`dagi hech bir `app.route(...)` chaqiruvida ishlatilmagan (grep tasdiqlaydi: faqat ta'rif va test, boshqa hech qayerda import yo'q).\n\n**Nega muhim:** Local Desktop litsenziya modeli \"modul-gating\" (masalan odontogram/lab faqat tegishli litsenziya moduli yoqilgan bo'lsa ishlaydi) ustiga qurilgan, lekin hozir hech bir endpoint bu tekshiruvdan o'tmaydi — litsenziyasiz mijoz ham barcha modullarga kira oladi.\n\n**DoD:** tegishli route guruhlariga (`clinicalRoutes`, `labOrdersRoutes` va h.k. — CLI-338 Task 4 spec'ida ko'rsatilgan modul xaritasiga qarab) `requireModule('<modul-nomi>')` middleware sifatida ulanadi; mavjud `license-middleware.test.ts` unit testlariga qo'shimcha integratsion test (litsenziyasiz so'rov 403 qaytarishi kerak)."
}
```

- [ ] **Step 2: File issue 2 — mount `uploads.ts`**

```json
{
  "title": "apps/api/src/routes/uploads.ts hech qayerda mount qilinmagan",
  "team": "Clinik",
  "project": "Dental Service — Desktop & Supervisor",
  "priority": 2,
  "description": "`GET /uploads/:key` route (`apps/api/src/routes/uploads.ts`, path-traversal fix bilan, local-filesystem storage adapterdan fayl qaytaradi) `apps/api/src/app.ts`da hech qayerda import/`app.route(...)` qilinmagan (tasdiqlangan: `grep -n 'uploadsRoutes|routes/uploads' apps/api/src` faqat fayl ta'rifini topadi, mount joyini emas).\n\n**Nega muhim:** Local Desktop offline rejimida bemor rasmlari (patient images) MinIO presigned URL emas, local-filesystem orqali saqlanadi (CLI-340) — lekin ularni HTTP orqali qaytarib olib bo'lmaydi, chunki route ulanmagan. Rasm yuklash ishlaydi, ko'rish ishlamaydi.\n\n**DoD:** `app.ts`ga `app.route('/uploads', uploadsRoutes({ storage }))` (yoki mos signature) qo'shiladi; mavjud fayl ichidagi `authMiddleware` va path-traversal himoyasi saqlanadi; bitta integratsion test — yuklangan faylni shu endpoint orqali qaytarib olish."
}
```

- [ ] **Step 3: File issue 3 — wire settings IPC bridge**

```json
{
  "title": "Web /settings sahifasi Electron IPC setServerUrl() bridge'ini chaqirmaydi",
  "team": "Clinik",
  "project": "Dental Service — Desktop & Supervisor",
  "priority": 3,
  "description": "Electron tarafi tayyor: `apps/desktop/src/settings-ipc.ts` (`ipcMain.handle('dental:set-server-url', ...)`) + `apps/desktop/src/preload.ts` (`window.dentalDesktop.setServerUrl(url)` contextBridge orqali) — commit `a9eb863`da qo'shilgan, lekin uning xabarida aniq yozilgan: \"the web /settings page does not yet call window.dentalDesktop.setServerUrl()\". Tasdiqlandi: `grep -rn electronAPI\\|ipcRenderer\\|window\\.electron apps/web/src/features/settings/` hech narsa topmaydi.\n\n**Nega muhim:** Klient rejimida server topilmasa/noto'g'ri bo'lsa, foydalanuvchi qo'lda server URL kiritib qayta ulanish imkoniga ega bo'lishi kerak (CLI-348 qaror) — Electron tarafi bunga tayyor, lekin UI tugmasi/formasi yo'q, shuning uchun funksiya foydalanuvchiga ko'rinmaydi.\n\n**DoD:** `apps/web/src/features/settings/components/IntegrationsSettingsScreen.tsx` (yoki mos ekran)ga server URL input + \"Ulash\" tugmasi qo'shiladi, `window.dentalDesktop?.setServerUrl(url)` chaqiradi (faqat Electron muhitida ko'rinadi — `window.dentalDesktop` mavjudligini tekshirish orqali), muvaffaqiyat/xato holatini ko'rsatadi."
}
```

- [ ] **Step 4: File issue 4 — Windows physical verification (blocked)**

```json
{
  "title": "Local Desktop Task 6-12 (Electron/Windows-only) jismoniy Windows PC'da hali tekshirilmagan",
  "team": "Clinik",
  "project": "Dental Service — Desktop & Supervisor",
  "priority": 2,
  "description": "BLOCKED: jismoniy Windows PC (yoki Windows VM) va foydalanuvchining qo'lda ishtiroki kerak — Claude buni bajara olmaydi.\n\nCLI-338 epikining Task 6-12 qismi (Electron config/process-manager, NSIS installer, mDNS+UDP discovery, tray, auto-updater) Linux muhitda ishga tushirib bo'lmagani sababli faqat typecheck (18/18 toza) darajasida tekshirilgan, real Windows runtime'da hali sinalmagan.\n\n**Nega muhim:** Bu epikning butun maqsadi — Windows offline installer. Runtime-verify session allaqachon bir marta kutilmagan kritik xavfsizlik bugini (RLS-bypass, API Postgres superuser sifatida ishlagan) va 6 boshqa flow-blocking bugni topgan edi (2026-07-02) — bu shuni ko'rsatadiki, typecheck-clean kod haqiqiy binary'da kutilmagan tarzda buzilishi mumkin.\n\n**DoD (foydalanuvchi tomonidan):** NSIS installer'ni real Windows PC'da o'rnatish, Server va Klient rejimlarini alohida sinash, litsenziya activation flow'ni end-to-end o'tkazish, natijani shu ticket'ga izoh sifatida yozish."
}
```

No commit for this task (external API calls only, no repo files change).

---

### Task 5: File Group 2 — verified platform findings

**Files:** none (Linear API calls only).

**Interfaces:**
- Consumes: Task 3's `verified_findings` list where `outcome == "confirmed"`.
- Produces: N Linear issue IDs (N = count of confirmed findings), needed by Task 6's summary.

- [ ] **Step 1: For each confirmed finding, call `mcp__linear-server__save_issue`**

For every item in `verified_findings` with `outcome: "confirmed"`, call:

```json
{
  "title": "<finding.title, kept under ~80 chars>",
  "team": "Clinik",
  "project": "Dental Service — Desktop & Supervisor",
  "priority": "<2 if finding.severity=='high', 3 if 'medium', 4 if 'low'>",
  "description": "<finding.evidence quoted/paraphrased> + blank line + '**Nega muhim:** ' + finding.why_it_matters + (if finding.blocked_external is not null: blank line + 'BLOCKED: ' + finding.blocked_external)"
}
```

Use the exact `file:line` from the finding inside the description so a future reader can jump straight to the evidence, matching the format used in Task 4's 4 issues.

- [ ] **Step 2: Record every created issue's returned identifier (e.g. `CLI-###`) in a list for Task 6**

No file write required — hold in working context.

No commit for this task (external API calls only).

---

### Task 6: Final summary report

**Files:** none created — this is a chat response, not a repo change.

**Interfaces:**
- Consumes: Task 4's 4 issue IDs + Task 5's N issue IDs + Task 3's `rejected_stale`/`rejected_duplicate` items (for transparency about what was found but not filed).

- [ ] **Step 1: Report to the user**

Produce a message listing: the 4 Group 1 issue IDs/titles, the N Group 2 issue IDs/titles grouped by which of the 6 audit agents surfaced them, and a short "considered but not filed" list (stale/duplicate items) so nothing looks silently dropped.

No commit for this task (chat output only).
