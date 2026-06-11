# R2 — Navbat tablosi (queue board + check-in): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-37 (Navbat tablosi), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), R2-A (`features/patients/` etalon), R2-B (`features/appointments/` etalon)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-queue` (main'dan; R2-B PR #4 allaqachon merged)

## Maqsad

R2 ning navbatdagi ekrani: **Navbat tablosi** — bugungi navbat boardi (3 ustun) + **appointment → navbat check-in oqimi**. Eski `apps/web/src/pages/queue.page.tsx` (274q, to'g'ridan `api.queue` chaqiradi) RFC-0010 `features/queue/` ga ko'chiriladi + teal dizaynga re-skin qilinadi. Mavjud funksiyalar (ticket yaratish, status o'tishlari, branch filter, 10s auto-refresh) **yo'qotilmaydi**. Yangi: bugungi yozuvni navbatga ulash + status sync.

## Qamrov

**Ichida:** `features/queue/` (RFC-0010 qatlamlar), board re-skin (R0 primitivlar), check-in dialogi (yozuvdan + walk-in), backend gap (appointmentId FK + migratsiya + status sync + check-in-candidates endpoint), i18n uz+ru.

**Tashqarida:**
- Waiting-room TV/display rejimi → keyin (R5 sayqal).
- WebSocket real-time → keyin; hozir 10s polling saqlanadi.
- "Arrived/checked-in" appointment status enum qo'shish → YO'Q (mavjud enum bilan ishlaymiz).
- Bemor balansi → R3.

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + appointment ulash** (eng to'liq variant) | Foydalanuvchi tanladi |
| 2 | **To'liq ulanish:** `appointmentId` FK + saqlanadigan bog'lanish + status sync | Foydalanuvchi tanladi (yengil prefill emas) |
| 3 | **Ikki tomonlama status sync:** `in_progress→in_progress`, `done→completed`, `missed→no_show` — faqat `appointmentId` bor ticketlarda | Foydalanuvchi tanladi |
| 4 | **Check-in nomzodlarini backend filtrlaydi** (frontend mapper'ga biznes-mantiq yuklanmaydi) | Foydalanuvchi tanladi |
| 5 | **3 ustunli board saqlanadi** (kutmoqda / davom etmoqda / yakunlangan) | R2 re-skin: mavjud struktura yo'qotilmaydi |

## 1. Backend gaplari (RFC-0009; R2-A `patients.tags` presedenti)

### 1.1 Migratsiya
`queue_tickets.appointment_id UUID NULL` → `appointments(id) ON DELETE SET NULL` + index (`queue_appointment_idx`). `drizzle-kit generate` → review → commit. Tenant-scoped jadval (RLS allaqachon yoqilgan).

### 1.2 `queue.schema.ts`
- `createQueueTicketSchema` ga `appointmentId: z.uuid().optional()`.

### 1.3 `queue.service.ts`
- **`create`** — `appointmentId` saqlash (mavjud transaksiya ichida).
- **`updateStatus`** — agar ticket `appointmentId` bor bo'lsa, bitta transaksiyada appointment status sync:
  - `in_progress` → appointment `in_progress`
  - `done` → appointment `completed`
  - `missed` → appointment `no_show`
  - Appointment allaqachon terminal holatda (`cancelled` yoki `completed`) bo'lsa — **skip** (qayta yozmaslik).
  - Audit ikkala resursga (`queue_ticket` + `appointment`).
- **`checkInCandidates(c, branchId)`** — bugungi (`ticketDate` emas, appointment `startTime` bugungi kun) `scheduled`/`confirmed` appointment'lar, **`queue_tickets` da `appointment_id` orqali bog'lanmaganlari**: `appointments LEFT JOIN queue_tickets ON qt.appointment_id = a.id WHERE qt.id IS NULL AND a.branch_id = ... AND a.status IN ('scheduled','confirmed') AND a.start_time::date = today`. Javob — appointment list DTO (bemor/doktor/xizmat nomlari bilan, R2-B kalendar shaklida; mavjud appointments mapper/shape qayta ishlatiladi).

### 1.4 `queue.routes.ts`
- Yangi: **`GET /check-in-candidates`** `requirePermission('queue.create')` → `service.checkInCandidates`.
- Mavjud `GET /`, `POST /`, `PATCH /:id/status` o'zgarmaydi (POST body endi `appointmentId` qabul qiladi).

### 1.5 api-client (`packages/api-client`, hozircha qo'lda — CLI-92 keyin)
- `endpoints.ts` `queue.create` body → `appointmentId?`.
- Yangi `queue.checkInCandidates(branchId)` → appointment DTO ro'yxati.
- `types-m3.ts` `QueueTicket` ga `appointmentId: string | null`.

## 2. `features/queue/` (kanonik RFC-0010)

```
apps/web/src/features/queue/
├── index.ts
├── queue.keys.ts        # queueKeys.today(branchId) / candidates(branchId) / all
├── queue.types.ts       # QueueCardVM, QueueColumnVM, CheckInCandidateVM
├── queue.mappers.ts     # REAL (sof): ticket(+patient/service/doctor) → QueueCardVM; groupByStatus(tickets) → 3 ustun
├── queue.api.ts         # hooks: useQueueToday / useCheckInCandidates / useCreateTicket / useUpdateStatus
├── queue.schema.ts      # check-in (appointment tanlash) + walk-in (bemor/xizmat) Zod form
└── components/
    ├── QueueBoard.tsx        # branch filter + "Navbatga qo'shish" + 3 ustun + refetchInterval 10s
    ├── QueueColumn.tsx       # ustun (sarlavha + count + kartalar + bo'sh holat)
    ├── QueueCard.tsx         # #raqam (Badge), bemor (Avatar+ism), xizmat, vaqt (Mono), status amal tugmalari
    └── CheckInDialog.tsx     # 2 tab: "Yozuvdan" (candidates) + "Walk-in" (bemor/xizmat Select)
```

**Qatlam:** `components → queue.api.ts (hooks) → api-client`. Komponent api-client'ni bevosita chaqirmaydi. `queue.mappers.ts` — sof funksiya, biznes-mantiqsiz filtr (check-in nomzodlari backend'dan keladi).

## 3. Board re-skin (mavjud funksiya yo'qotilmaydi)

- **3 ustun saqlanadi:** Kutmoqda (`waiting`) / Davom etmoqda (`in_progress`) / Yakunlangan (`done`+`missed`). `groupByStatus` mapper.
- **R0 primitivlar:** `Card`, `StatusPill`/`Badge`, `Avatar`, `Mono` (vaqt/raqam), teal token. lucide ikonkalar (emoji ⏳/🔄/✓ o'rniga). CSS Module kerak bo'lsa.
- **Amal o'tishlari (saqlanadi):** `waiting→in_progress` (chaqir tugma), `in_progress→done`/`in_progress→missed`. `queue.manage` permission gating saqlanadi.
- **Branch filter** (Select, default `activeBranchId`), **`refetchInterval: 10_000`** saqlanadi. Bo'sh-holat matni har ustunda.
- **Bemor/xizmat nomi:** mapper orqali (hozirgi `patients.data.find` N+1 anti-pattern o'rniga — ticket javobida yetarli ma'lumot bo'lmasa, mavjud `useQueueToday` yoniga patient/service lookup hook'lari, lekin lookup mapper'ga uzatiladi, komponentga emas).

## 4. Check-in oqimi (appointment ulash)

- **"Navbatga qo'shish"** tugmasi → `CheckInDialog` (Mantine Modal), 2 tab:
  - **Yozuvdan:** `useCheckInCandidates(branchId)` → bugungi bog'lanmagan `scheduled/confirmed` yozuvlar ro'yxati (bemor ismi, doktor, vaqt, xizmat). Tanlash → `useCreateTicket` (`appointmentId` + bemor/doktor/xizmat bilan). Bo'sh bo'lsa — "Bugun check-in uchun yozuv yo'q".
  - **Walk-in:** bemor (searchable Select, `api.patients.list`) + xizmat (Select, `api.services.list`) — `appointmentId` siz (hozirgi xulq saqlanadi).
- Muvaffaqiyat → dialog yopiladi + `queueKeys` invalidate (+ `candidates` invalidate, chunki ro'yxatdan chiqadi).

## 5. i18n + R0 primitiv

- `queue.*` namespace kengaytiriladi: check-in tab nomlari (`from_appointment`, `walk_in`), bo'sh-holat, status sync xabarlari, doktor/vaqt labellari → **uz + ru**. Mavjud `queue.*` kalitlar saqlanadi.
- R0 primitivlar: `PageHead`, `Button`, `Select`, `Card`, `Badge`/`StatusPill`, `Avatar`, `Mono`, `Tabs` (dialog), `Modal`. lucide ikonkalar.

## 6. Testlar

- **`queue.mappers.test.ts`** (eng muhim): `groupByStatus` (waiting/in_progress/done+missed ajratish), `toQueueCardVM` (ticket+lookup → VM, nom topilmasa fallback).
- **`queue.keys.test.ts`**: factory.
- **`CheckInDialog`** behavioral: tab almashish + candidate tanlash → `create` chaqiruvi (`appointmentId` bilan); walk-in → `create` (`appointmentId` siz).
- **`QueueBoard`** smoke: renderApp + mock hooks (3 ustun, branch filter).
- **Backend `queue.service`** unit: status-sync (appointmentId bor → appointment yangilanadi; yo'q → tegmaydi; terminal holat → skip), `checkInCandidates` filtri (bog'langan yozuv ro'yxatda yo'q).

## 7. Verifikatsiya

- `turbo test --filter @dental/web` + `turbo test --filter @dental/api` (exit 0) + build + typecheck.
- Migratsiya: `drizzle:generate` → review → (lokal `drizzle:migrate`).
- Dev fidelity (inson): board 3 ustun teal, status o'tishlari, branch filter, 10s refresh; check-in dialogi (yozuvdan tanlash → navbatga tushadi + appointment `in_progress` bo'ladi; walk-in ishlaydi); done→appointment completed, missed→no_show; bog'langan yozuv check-in ro'yxatidan chiqadi.

## Qurilish tartibi (plan'da)

1. **Backend avval:** migratsiya (`appointmentId`) → schema → service (`create`+`updateStatus` sync + `checkInCandidates`) → routes → api-client → backend testlar.
2. **`features/queue/` skelet:** keys → types → mappers (+test) → api hooks.
3. **Board re-skin:** QueueBoard/Column/Card (mavjud funksiya migratsiya) + smoke test.
4. **Check-in:** CheckInDialog (2 tab) + schema + behavioral test.
5. **i18n + yupqa page entry** (`queue.page.tsx` → `<QueueBoard />`).
6. Verifikatsiya (test + build + typecheck + dev fidelity).

## Ochiq mayda nuqtalar (plan'da)

- `checkInCandidates` "bugun" chegarasi: `start_time::date = current_date` (server TZ) vs Asia/Tashkent oralig'i — R2-B timezone qarori (UTC+5) bilan moslash. Backend'da `start_time` oralig'i `[todayStartUTC, todayEndUTC)` hisoblanadi.
- `QueueCard` da bemor/xizmat nomini olish: ticket javobiga join qo'shish (repository) yoki alohida lookup — repository join afzal (mapper sof qoladi). Plan'da aniqlanadi.
- Walk-in `appointmentId` siz yaratilganda status sync yo'q (to'g'ri).
