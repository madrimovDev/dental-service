# CLI-425 — Queue 'done'→completed preventive-recall hook'ini chetlab o'tadi

> Audit: MEDIUM M12. `recall.autoCreatePreventive` faqat `appointmentsService.update()`да ishlaydi; queue done→completed to'g'ridan `db.update()` qiladi, recalls service queue modulига inject qilinmagan → asosiy reception oqimи hech qachon preventive recall yaratmaydi.

## 1. Muammo va ildiz sabab

Ikки alohида "yozилиш completed" yo'li bor, faqat bittаси recall firе qilади:

- **Appointments yo'li** — `appointments.service.ts:236-241`: `input.status === 'completed' && before.status !== 'completed' && deps.recall` → `deps.recall.autoCreatePreventive(...)`. To'g'ri.
- **Queue yo'li** — `queue.service.ts:98-129`: `updateStatus` da `input.status === 'done'` → `apptStatus = 'completed'` (99-106) → `db.update(appointments).set({status:'completed'})` (116-119) **to'g'ridан-to'g'ри**. `createQueueService` (8) faqat `{ audit }` olади — **`recall` dep yo'q**. Natija: preventive recall **yaratилмайди**.

Reception amaliyotида bemor check-in → queue → doktор "done" bosади. Ya'ni **eng ko'p ishлатиладиган** completion yo'li recall hook'ни butунлай o'tказиб yuborади. Odontogram/plan-based stage completion (`autoCreateFromStage`) alohида — bu faqat **preventive** (yozилиш-darajасидаги profilaktik) recall yo'qолиши.

Ildiz sabab: completion mantiqi **ikки joyда duplикат** (`appointments.service` va `queue.service`), lekin recall side-effect faqat birида. Yagona haqiqат manbаsи yo'q.

## 2. Dizayn qarori

**Shared `completeAppointment` yo'li — ikки chaqiruvchи ham bir xil kod (afzal, task DECISION).**

Queue done-sync appointments completion'ни **to'g'ридан emas**, `appointmentsService` orqали bajарса — recall hook, transition guard (CLI-409), reminder-cleanup, audit — hammасi **bir marta** to'g'ri ishлайди.

**Yondашув: `recall` dep'ни queue modulига inject qilиш (mos ravишда shared helper).** Ikки variant baholanди:

- **(A) `appointmentsService.update()`'ni queue'дан chaqirиш** — queue `db.update(appointments)`ни almаштиради `appointmentsService.update(c, apptId, {status:'completed'})`ga. Barcha side-effect (recall + CLI-409 guard + reminder) avtomат keladi. **Kamчилиk:** queue routes `appointmentsService`ни qurиши kerak (dep qurилиши kengаяди) va `update` reminder/schedule mantиқини ham ishга tushıради (completed'да zararсиз).
- **(B) `recall` hook'ни queue'га inject qilıб, queue o'zи chaqиради** — minimал; lekin completion mantиқи **hali ham ikки joyда** (transition guard queue'да yo'q). DRY buzилади.

**Qaror: (A) shared path** — `queue.service.updateStatus` done→completed'да `db.update(appointments)` o'rniga `appointmentsService.update(c, appointmentId, { status: 'completed' })` (yoki `in_progress`/`no_show` mos ravишда) chaqiради. Bu:
- Recall preventive firе qilади (236-241 orqали).
- CLI-409 state-machine guard'ини (terminal/invalid) meros oладi.
- Reminder cleanup, audit — bepул.

`app.ts`да `queueRoutes`ga `appointmentsService` (yoki uning `update` funksiyаси) inject qilинади. Hozир `appointmentsService` `appointmentRoutes` ichида qurилади (`appointments.routes.ts:58`) — uni **app.ts darajасида bir marta** qurıб ham appointments, ham queue'га uzатиш kerак (schedule/recall singари, `app.ts:136,140`).

**Muqобил rad:** (B) faqat recall inject — completion side-effect'ларини sinxron saqлашни kelajакда yana buzади (har yangи hook ikки joyга qo'shılади). Shared path yagona haqiqат manbаsи beradi.

**Diqqат — terminal guard o'zaro ta'sir (queue↔appointments):** queue hozır appointment `cancelled`/`completed` bo'лса qaйта yozмайди (`queue.service.ts:115`). `appointmentsService.update` orqали o'tганда bu guard CLI-409 state-machine bilan bajарilади (`completed→completed` idempotent no-op, `cancelled→completed` invalid → 400). Queue side conflict/schedule re-check completion'да **shart emas** (slotни bo'sатмайди), lekin `update` uni faqat active'ga o'тганда ishга tushıради (CLI-409 §3.4) — `completed` active emas → re-check skip. Toza.

## 3. Spec — xulq + chekka holatlar

**Xulq:** check-in → queue ticket → `updateStatus(done)` → bog'ланган appointment `completed` → **preventive recall yaratилади** (bemorда ochiq preventive yo'q bo'лса; `autoCreatePreventive` `hasOpenByReason` bilan dedupe — `recalls.service.ts:176`).

**Chekka holatlar:**

| Holat | Kutilgan |
|---|---|
| Queue done, bog'ланган appointment yo'q (`before.appointmentId === null`) | Recall yaratılмайди (appointment yo'q; walk-in queue). Mavjud xulq. |
| Queue done, appointment allaqачон `completed` | `update` idempotent (before===completed) → recall **qaйта firе qilмайди** (236 guard `before.status !== 'completed'`). |
| Queue done, appointment `cancelled` | `appointmentsService.update` transition guard (CLI-409) → invalid → queue completion appointment status'ini o'zгартирмайди. **Qaror:** mavjud queue guard (115) allaqачон cancelled'ни o'tказмас edi — xulq saqланади (queue ticket done bo'лади, appointment cancelled qолади). |
| Queue `in_progress` | `update(status:'in_progress')` — recall yo'q, `calledAt` mantiqи queue ticket'да qолади. |
| Queue `missed` → appointment `no_show` | Recall yo'q (mavjud). |
| Bemorда ochiq preventive bor | `autoCreatePreventive` dedupe → dublikат yo'q. |

**Test caselar (`bun test`, integration):**

1. **[asосий]** create appointment (scheduled) → check-in (queue create) → `updateStatus(done)` → `recalls` jadvалида shu bemor uchun 1 ta `preventive`/`pending` recall.
2. Queue done, appointmentId=null (walk-in) → recall yo'q, error yo'q.
3. Queue done ikки marta (idempotent) → recall faqat 1 ta (appointment ikkинчи marta completed→completed).
4. Appointment cancelled → queue done → appointment `cancelled` qолади (guard), recall yo'q.
5. Bemorда ochiq preventive bor → queue done → yangи recall qo'шılмайди (dedupe).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `queue.service.test.ts` (yoki integration `queue-recall.test.ts`) case 1 hozır **qизил** (recall yaratılмайди).
2. **Impl:**
   - `app.ts:134-144` — `appointmentsService`ни **app darajасида** qurıш: `const appointments = createAppointmentsService({ audit, schedule, recall, enqueueReminder, removeReminder })` (hozır bu logic `appointments.routes.ts:58`ичида; uni app.ts'ga ko'chırıб routes'га service-ни yoki dep'ни uzатиш — yoki soddaroq: `queueRoutes`ga `appointmentsService` ni beruvchи kичик refactor). **Eng kам churn:** `appointments.routes.ts`даги `createAppointmentsService` chaqiruvини export qilинадиган factory'дан olıб, app.ts'да bir marta qurıб **ham** `appointmentRoutes({..., appointmentsService})` **ham** `queueRoutes({..., appointmentsService})`ga uzатиш.
   - `queue.service.ts` `createQueueService` deps'ига `appointments: Pick<AppointmentsService,'update'>` qo'шıш.
   - `queue.service.ts:108-128` — `apptStatus` hisоблангач, `db.update(appointments)...` o'rniga:
     ```ts
     if (apptStatus) {
       await deps.appointments.update(c, before.appointmentId, { status: apptStatus });
     }
     ```
     `update` o'zида before-fetch + transition guard + terminal guard + recall + audit qилади → queue'даги qo'лда appointment-status audit (121-127) va terminal guard (115) **olib tashlanади** (endi `update` ичида). Queue ticket'нинг o'з status audit'i (132-140) qолади.
   - `queue.routes.ts:28,34` — deps signature'ига `appointmentsService` qo'шıш; `createQueueService({ audit, appointments })`.
3. **Verify:** `bun test`, `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsія YO'Q** — wiring + service refactor.
- **Xavf — dep qurılıш tartиби (`app.ts`):** `appointmentsService` `schedule` va `recall`га bog'ланган (136,140) — ular queue'дан **oldin** qurılıши kerak. Tartіб: schedule → recall → appointmentsService → appointmentRoutes + queueRoutes. Mavjud `app.ts` tartиби (136-143) bilan mos (appointments 141, queue 143).
- **Xavf — RLS/tx konteksti:** `queue.updateStatus` `getDb(c)` (tx-bound) ishлатади; `appointmentsService.update` ham `getDb(c)` — **bir xil request context/tx** → RLS izchіл, cross-tenant xavf yo'q.
- **Xavf — audit dublikати:** endi appointment status audit `update` ичида (bir marta); queue'даги eски qo'лда audit blok (121-127) olib tashlanади — audit **ikki marta yozілмаслиги** uchun.
- **Rollout:** feature-branch, TDD, verify, merge.

## 6. Qabul mezonlari

- [ ] Check-in → queue → done → bemorда preventive recall yaratılади.
- [ ] Walk-in (appointmentId=null) done → recall yo'q, xato yo'q.
- [ ] Idempotent done → recall bir marta (dedupe).
- [ ] Cancelled appointment queue done'да o'zгармаyди.
- [ ] Appointment status audit bir marta (dublikат yo'q).
- [ ] `bun test` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/src/app.ts:134-144` — `appointmentsService`ни bir marta qurıб appointments+queue'га inject
- `apps/api/src/modules/appointments/appointments.routes.ts:58` — service qurılıшıни app.ts'дан qabul qilадиган qilıб (yoki export factory reuse)
- `apps/api/src/modules/queue/queue.service.ts:80-142` — done/in_progress/missed → `appointmentsService.update` (shared path); qo'лда appointment update+audit olib tashlаш
- `apps/api/src/modules/queue/queue.routes.ts:28-34` — deps'га `appointmentsService`
- Testlar: `queue.service` / integration `queue-recall.test.ts`
