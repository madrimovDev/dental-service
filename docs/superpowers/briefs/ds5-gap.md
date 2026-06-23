# DS5 Gap Brief — Queue + Fullscreen Display Board

Milestone DS5 of the Dental OS pixel-parity redesign. Re-skin only the `queue`
feature to match the design. Functionality (advance/call), API, i18n keys, and
permissions stay unchanged (Decision #33). DS0 foundation (tokens.css, shell,
primitives) is locked — do not touch.

Design source: `claude.ai/design` Dental OS.dc.html, extracted from
`toolu_01GKUFvM7wVKLrAXM5m5CcRj.txt`. Two screens in scope:
- **Queue** (nav key `queue` / "Navbat", `scrQueue` template)
- **Fullscreen display board** (`scrBoard` template, opened via `openBoard`)

---

## 1. Design summary

### 1.A Queue screen (`scrQueue`)

Vertical stack, `animation:fadeUp .2s ease`. Three regions:

**Header row** (`justify-content:space-between`)
- Left title block: "Navbat" (`17px / 700 / --ink`) + subtitle "Bosh filial · jonli boshqaruv" (`12px / --ink-3`).
- Right: outline button "Display board" — `height:38px`, `border:1px solid --border`, `radius:10px`, `--surface`, grid icon (`icGrid`), hover `borderColor/color → --primary`. Calls `openBoard` → `view:'board'`.

**Now-serving + Next panels** (flex row, `gap:16px`, wrap, `margin-bottom:18px`)
- **Now-serving panel** (`flex:1 1 360px`):
  - `background: linear-gradient(135deg, var(--primary), var(--primary-strong))`
  - `radius:16px`, `padding:20px 22px`, `color:--on-primary`, `box-shadow:--shadow`
  - Eyebrow "Hozir chaqirilmoqda" (`12px / 600`, `opacity:.85`, uppercase, `letter-spacing:.05em`)
  - **Number `A-06`**: `font-family: var(--mono)`, `font-size:46px`, `font-weight:700`, `line-height:1.05`
  - Vertical divider `1px`, `rgba(255,255,255,.25)`
  - Patient block: name (`16px / 700`), service "Koronka o'rnatish" (`13px`, `opacity:.9`), meta "Dr. Saidov · Kabinet 2" (`12.5px`, `opacity:.8`)
  - NOTE: no pulse animation on this panel in the source (pulse appears only on the board clock dot, see §1.B).
- **Next panel** (`flex:1 1 260px`):
  - `--surface`, `border:1px solid --border`, `radius:16px`, `padding:18px 20px`, `box-shadow:--shadow-sm`
  - Eyebrow "Keyingi navbat" (`12px / 600 / --ink-3`, uppercase)
  - Number `A-07` (`var(--mono)`, `30px / 700 / --ink`) + name (`14px / 600 / --ink-2`), baseline-aligned
  - "12 daqiqa kutdi" (`12px / --ink-3`)
  - "Chaqirish →" button: `height:44px`, `radius:11px`, `--primary` / `--on-primary`, `700 / 13.5px`, hover `--primary-strong`

**Kanban board** (`display:grid; grid-template-columns:repeat(3,1fr); gap:16px; align-items:start`)
- Iterates `queueBoard` (3 columns): **Kutmoqda** (tone `muted`), **Qabulda** (`warning`), **Yakunlandi** (`success`).
- Column card: `--surface`, `border:1px solid --border`, `radius:16px`, `box-shadow:--shadow-sm`, `overflow:hidden`.
  - Header: title (`13.5px / 700 / --ink`) + count chip (`col.countChip`, toned).
  - Body: `padding:10px`, column flex, `gap:8px`, `min-height:80px`.
- Ticket card: flex row, `gap:11px`, `padding:11px`, `border:1px solid --border`, `radius:11px`, `--surface-2`, hover `borderColor:--border-strong`.
  - Number badge `A-07`: `var(--mono)`, `13px / 700 / --ink`, on `--surface` with `border:1px --border`, `radius:8px`, `padding:6px 8px`.
  - Text: patient (`13px / 600 / --ink`, ellipsis) + "`svc · meta`" (`11.5px / --ink-3`, ellipsis).

### 1.B Fullscreen display board (`scrBoard`)

Column flex, `gap:20px`, `animation:fadeUp .2s ease`. Full-width content area (rendered inside the normal shell content, NOT a position:fixed overlay).

**Header**
- Left: clinic logo square `48px`, `radius:13px`, `--primary` / `--on-primary`, mono-ish "DD" (`800 / 18px`) + name "Demo Dental Klinika" (`22px / 800 / --ink`, `letter-spacing:-.02em`) + "Navbat — jonli tablo · Bosh filial" (`13px / --ink-3`).
- Right: **live clock** — `var(--mono)`, `30px / 700 / --ink`, preceded by `9px` `--danger` dot with `animation: dotpulse 1.4s infinite`; "Chiqish" button (`height:42px`, `--surface`, `border --border`, `radius:10px`) → `goQueue`.

**Two cabinet showcases** (`grid; grid-template-columns:1fr 1fr; gap:20px`)
- Cabinet 1: `background: linear-gradient(135deg, var(--primary), var(--primary-strong))`, `radius:22px`, `padding:30px 32px`, `--on-primary`, `box-shadow:--shadow`.
  - Eyebrow "Kabinet 1 · Dr. Karimova" (`13.5px / 600`, `opacity:.85`, uppercase, `letter-spacing:.07em`)
  - **Number `A-05`**: `var(--mono)`, `font-size:84px`, `700`, `line-height:1`, `margin:12px 0 14px`
  - Patient (`22px / 700`) + service (`15px`, `opacity:.85`)
- Cabinet 2: `background: linear-gradient(135deg, var(--violet), color-mix(in srgb, var(--violet) 75%, #000))`, `color:#fff` (hardcoded white, not `--on-primary`), otherwise identical. Number `A-06` `84px` mono.

**Next-queue cards** (panel `--surface`, `border --border`, `radius:20px`, `padding:24px`, `box-shadow:--shadow-sm`)
- Title "Keyingi navbatlar" (`13px / 700 / --ink-3`, uppercase, `letter-spacing:.06em`).
- Row of cards (flex, `gap:16px`, wrap), each `flex:1; min-width:220px`, `--surface-2`, `radius:16px`, `padding:16px 22px`:
  - Number `var(--mono)`, `38px / 700` — first card colored `--primary`, rest `--ink-3`.
  - Name (`17px / 700 / --ink`) + service (`13px / --ink-3`).
- Source shows three cards (A-07, A-08, A-09).

### 1.C Tokens / animations referenced
- Fonts: `--mono` (JetBrains Mono per DS0) for all queue numbers and the clock; `--ui` (Hanken Grotesk) elsewhere.
- Gradients: now-serving + cabinet-1 = `linear-gradient(135deg, var(--primary), var(--primary-strong))`; cabinet-2 = `linear-gradient(135deg, var(--violet), color-mix(in srgb, var(--violet) 75%, #000))`.
- Surfaces/borders: `--surface`, `--surface-2`, `--border`, `--border-strong`; text `--ink`, `--ink-2`, `--ink-3`; on-gradient `--on-primary`.
- Shadows: `--shadow` (hero panels), `--shadow-sm` (cards).
- Radii: 8 / 10 / 11 / 13 / 16 / 20 / 22 px.
- Animations (only two keyframes exist in the whole design):
  - `@keyframes dotpulse{0%,100%{opacity:1}50%{opacity:.35}}` — used by the board clock dot (1.4s infinite) and by the schedule "in_progress" status dot. There is **no** scale/glow "pulse" — it is an opacity blink.
  - `@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}` — screen enter.
- Column tones (chips): `muted` / `warning` / `success`.

---

## 2. Current state (files, components, hooks)

Base: `apps/web/src/features/queue/`

| File | Role | DS5-relevant content |
|---|---|---|
| `components/QueueBoard.tsx` | Screen (route element) | Mantine `Container/Stack/Group/Title/Select/Button`. Header = `Title order={2}` + branch `Select` + "new_ticket" `Button`. Body = `<Group grow>` of 3 `QueueColumn`. NO now-serving / next / display-board button. |
| `components/QueueColumn.tsx` | Kanban column | Mantine `Card withBorder radius="md"` + `Stack`; header `Text fw={600} size="lg"` with `(count)`. `titleKey` maps waiting/in_progress/completed → i18n. |
| `components/QueueCard.tsx` | Ticket card | Mantine `Card` + `Group` + status `Badge`. `statusColor` = off-brand `yellow/blue/teal/red`. Number shown as `#{queueNumber}` (integer, NOT `A-06` mono prefix). Action buttons: Play (call), Done, X (missed). |
| `components/CheckInDialog.tsx` | New-ticket modal | Out of DS5 visual scope except token sweep if it diverges. |
| `queue.routes.tsx` | Route registry | Single route `/queue` (perm `queue.view`). **No `/queue/board` route.** |
| `queue.api.ts` | TanStack hooks | `useQueueToday(branchId)` (polls 10s), `useUpdateQueueStatus`, `useCheckInCandidates`, `useCreateTicket`, lookups (`usePatientsAll/useServices/useBranches`). Sufficient data for a board; no board-specific hook needed. |
| `queue.mappers.ts` | Grouping | `groupByStatus` → 3 columns (`done`+`missed` collapse into `completed`); `toQueueCardVM`. |
| `queue.types.ts` | VMs | `QueueColumnKey = waiting | in_progress | completed`; `QueueCardVM`. |
| `queue.keys.ts` / `queue.schema.ts` | keys / zod | unchanged for DS5. |

Status taxonomy (API): `QueueStatus = waiting | in_progress | done | missed`. Columns collapse `done` + `missed` into "completed".

i18n `queue` namespace (uz.json / mirrored ru.json) already has: `title, select_branch, select_branch_hint, add, new_ticket, patient, service, waiting, in_progress, done, completed, called_at, call, missed, from_appointment, walk_in, check_in, no_candidates`. **Missing for DS5:** now-serving label, next label, "display board"/"exit" labels, board header subtitle, "Keyingi navbatlar", "X daqiqa kutdi", "Kabinet N", live-tablo subtitle, etc.

---

## 3. Gap list (concrete visual deltas)

1. **No now-serving hero panel.** Design wants a `--primary`→`--primary-strong` 135deg gradient card with a 46px mono `A-06` number, eyebrow, divider, patient/service/cabinet block. `QueueBoard.tsx` jumps straight from header to the 3-column `Group`. → add panel.
2. **No "next in queue" panel + Call CTA.** Design has a `--surface` card with 30px mono next number, name baseline, "12 daqiqa kutdi", and a `--primary` "Chaqirish →" button (`height:44px / radius:11px`). Currently the only "call" affordance is the per-card Play `ActionIcon` in `QueueCard.tsx`. → add panel; wire its button to `useUpdateQueueStatus` (advance the head of the waiting column to `in_progress`) — same mutation, no API change.
3. **No fullscreen display board screen or route.** Design `scrBoard` (2 cabinet showcases @ 84px mono + 3 next cards + live clock) does not exist. `queue.routes.tsx` has only `/queue`. → new `QueueDisplayBoard` component + new route (e.g. `/queue/board`) + a "Display board" outline button in the header (`openBoard`).
4. **Number rendering wrong.** `QueueCard.tsx` renders `#{vm.queueNumber}` inside a colored `Badge` (integer, sans). Design renders a mono `A-06`-style chip on `--surface` with border (`radius:8px`, `6px 8px`). → restyle number to mono token chip. (Whether to add the `A-` prefix is a data/display question — flag, do not assume API change; prefix may be presentation-only.)
5. **Off-brand status colors.** `QueueCard.statusColor = {waiting:'yellow', in_progress:'blue', done:'teal', missed:'red'}` — none are Dental OS tokens. Design column tones are `muted/warning/success`; the ticket itself in the Kanban carries no status badge (status is the column). → align: drop per-card color badge in Kanban tickets; use toned count chips on column headers. (Consistent with CLI-181 StatusPill convention.)
6. **Kanban column chrome differs.** Current: Mantine `Card radius="md"`, title `Text size="lg"` with `(N)` in parens. Design: `radius:16px`, header with separate **count chip**, body `min-height:80px`, tickets on `--surface-2` with `radius:11px` + hover `--border-strong`. → restyle `QueueColumn.tsx` / `QueueCard.tsx`.
7. **Header doesn't match.** Current `Title order={2}` + branch Select + new_ticket button. Design: small title (`17/700`) + subtitle + "Display board" outline button on the right. Branch Select / new-ticket are functional and may stay, but the title block + the new board button must be added.
8. **Live clock + dotpulse absent.** Board needs a `--mono` 30px clock with a `--danger` dot blinking via `dotpulse 1.4s`. Need a small ticking time source (client-side `setInterval`/`Date`).
9. **Cabinet-2 uses `--violet` gradient + literal `#fff`.** Distinct from cabinet-1's `--primary`. Reproduce exactly, including `color-mix(in srgb, var(--violet) 75%, #000)`.

---

## 4. Proposed tasks (disjoint leaf tasks)

Designed to be parallelizable; the i18n task must be serialized (shared `uz.json`/`ru.json` files — touching them concurrently conflicts).

- **DS5-1 — Queue screen header + now-serving + next panels.**
  Restyle `QueueBoard.tsx`: title/subtitle block, "Display board" outline button (navigates to board route), now-serving gradient hero (46px mono), next panel with mono number + "Chaqirish →" CTA wired to `useUpdateQueueStatus` (advance waiting→in_progress, no API change). Derive "now serving" = first `in_progress` ticket, "next" = first `waiting` ticket from `useQueueToday`. Tokens only; keep branch Select + new_ticket button working.

- **DS5-2 — Kanban column + ticket card re-skin.**
  Restyle `QueueColumn.tsx` (radius16 card, header count chip, `min-height:80px`) and `QueueCard.tsx` (mono number chip on `--surface`+border, `--surface-2` ticket bg, hover `--border-strong`, drop off-brand `yellow/blue/teal/red` badge; status conveyed by column). Preserve action buttons (call/done/missed) and `busy` per-card disable. No mapper/type change.

- **DS5-3 — Fullscreen display board screen + route.**
  New `QueueDisplayBoard.tsx` (cabinet-1 `--primary` + cabinet-2 `--violet` 84px mono showcases, "Keyingi navbatlar" cards @38px mono, header with logo + live `dotpulse` clock + "Chiqish"→back to `/queue`). New route in `queue.routes.tsx` (`/queue/board`, perm `queue.view`). Reuse `useQueueToday` data — cabinets = `in_progress` tickets (showcase up to 2), next cards = first 3 `waiting`. Client-side clock via `setInterval`. Decide overlay vs in-shell (design renders in-shell; full-overlay is an option flagged in risks).

- **DS5-4 — i18n keys for queue/board (SERIAL — shared locale files).**
  Add missing `queue.*` keys to `uz.json` AND `ru.json` (e.g. `now_serving`, `next_in_queue`, `display_board`, `exit`, `live_subtitle`, `next_queues`, `waited_minutes`, `cabinet`, `kutmoqda/qabulda/yakunlandi` column titles if relabeled). Keep existing keys. Must not run concurrently with any other task that edits these two JSON files.

---

## 5. Risks / notes

- **Mono font:** all queue numbers (46/84/38/30/13px) and the board clock rely on `var(--mono)` = JetBrains Mono (DS0). Confirm the token resolves and the weight 700 renders; tabular figures keep `A-06`/`A-07` aligned. This is the single most load-bearing typographic detail of DS5.
- **"Pulse" is opacity blink, not scale/glow.** The brief prompt says "pulse animation"; the actual design has only `@keyframes dotpulse{0%,100%{opacity:1}50%{opacity:.35}}` on the board clock dot. The now-serving panel has **no** animation. Do not invent a scale-pulse — match `dotpulse` exactly. Both keyframes (`dotpulse`, `fadeUp`) live in DS0 global `<style>`; verify they exist in the shipped shell CSS, else add locally.
- **Gradients:** `--primary-strong` and `--violet` tokens must exist post-DS0; cabinet-2 uses `color-mix(in srgb, var(--violet) 75%, #000)` — confirm `color-mix` browser support is acceptable (Electron/Chromium = fine) or precompute a token. Cabinet-2 hardcodes `color:#fff` (not `--on-primary`) — replicate but verify contrast on `--violet` in both themes.
- **Fullscreen / display mode:** the design `scrBoard` renders inside the normal shell content area (not `position:fixed`), opened by switching `view:'board'`. The real app needs an explicit route. Decide: (a) in-shell route `/queue/board` (closest to design, simplest), or (b) a true fullscreen overlay (better for a waiting-room TV but a functional/scope addition — flag with the user before adding). Default to (a) to honor pixel-parity + #33.
- **Dark-mode contrast (DS0 lesson, CLI-80/255):** the gradient panels use `--on-primary` text; cabinet-2 forces white on `--violet`. Re-verify WCAG AA in BOTH light and dark after every token usage — the DS0 retro flagged `--text-on-danger` dropping out of the dark block. Check `--on-primary` and white-on-violet contrast in dark theme explicitly.
- **Data semantics:** API status is `waiting/in_progress/done/missed`; design columns are Kutmoqda/Qabulda/Yakunlandi. Existing mapper already collapses done+missed→completed — keep it. "Now serving" / cabinets should map from `in_progress`; the design shows two cabinets but the API has no cabinet field — cabinet/doctor labels in the design are mock data. Flag: cabinet assignment is not in the current ticket model; show doctor/room only if present, else omit (no API change in DS5).
- **`A-` prefix:** design numbers are `A-06`; API `queueNumber` is an integer. The prefix is likely presentation. Treat as a display formatter (e.g. `A-${String(n).padStart(2,'0')}`), not a schema change — confirm with user if a real ticket-code field is expected later.
- **Polling already exists** (`refetchInterval: 10_000`); the board can reuse it. The board clock is separate (client `setInterval`, 1s) and must be cleaned up on unmount.
- **Out of scope (locked):** tokens.css, shell, primitives, CheckInDialog logic, queue API/permissions/i18n key *semantics*. DS5 adds i18n keys (new strings) but does not rename existing ones.
