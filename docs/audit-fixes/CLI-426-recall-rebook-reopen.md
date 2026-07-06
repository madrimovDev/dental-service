# CLI-426 — Recall har rebook'да 'scheduled' bo'ladi, cancel/no-show'да qaytarilmaydi

> Audit: MEDIUM M13. `closeOpenOnRebook` HAR appointment create'да BARCHA ochiq recall'ni yopadi (aloqadan qat'i nazar); cancel/no-show'да qaytarmaydi → yo'qolgan follow-up + shishirilgan efficacy.

## 1. Muammo va ildiz sabab

**(a) Har rebook barcha ochiq recall'ни yopadi:**
`recalls.service.ts:195-210` `closeOpenOnRebook` — `repo.findOpenByPatient(c, patientId)` (`recalls.repository.ts:118-129`, faqat `patientId` + `status in (pending,contacted)`) topganini **hammасини** `scheduled` qilади. Chaqiruvchи `appointments.service.ts:184` — **har** `create`да, appointment turi/sababiдан qat'i nazar. Ssenarий: bemor tishi og'риб **shoshılınch** keladi → yozилиш yaratилади → 4 oyдан keyin due bo'лган **preventive** recall ham `scheduled` bo'lиб yopilади → profilaktik chaqiruv **yo'qолади**.

**(b) Cancel/no-show recall'ни qaytармайди:**
`recalls.service.ts:99-131` `update` yoki appointments `cancel` (`appointments.service.ts:260-262`) recall'ни `scheduled`дан `pending`ga **qaytармайди**. Yozилиш bekor bo'лса bog'ланган recall abadiy `scheduled` qолади — dashboard'дан yo'qолади, hech kim bemorni chaqиrмайди.

**(c) Efficacy shishıради:**
`reports.service.ts:428-441` — `scheduled`ни `completed` bilan birga **converted** sanаyди (439-441). (a)+(b) tufayли real chaqиrılмаган bemorlar ham "converted".

**Ildiz sabab:** (1) rebook↔recall bog'lanишида **relevantлик** yo'q (har booking har recall'ни yopади); (2) **linkage bir yo'нали** — `scheduledAppointmentId` (`recalls` jadvали, `recalls.ts:82`) yopган appointment'ни yozади, lekin bu appointment bekor bo'лганда teskари amal yo'q.

## 2. Dizayn qarori

**Linkage mexanizми allaqачон mavjud:** `recalls.scheduledAppointmentId` (`recalls.ts:81-82`) — recall'ни qaйси yozилиш yopганини saqлайди. Uni **ikки yo'нали** ishлатамиз + close'га **relevantлik filtri** qo'шамиз.

**(a) Relevantлик (rebook close):** recall faqat yozилиш uning `dueDate`'ига **yeтарлича yaqin/keyin** bo'лса yopilади. Kelajакда uzoq due bo'лган recall (mas. +4 oy preventive) bugungи shoshılınch yozилиш bilan yopilмайди.

- Qoida: `appointment.startTime` (klиника-local sana) `>= dueDate − GRACE_DAYS` bo'лса **relevant** → yopиш. `GRACE_DAYS = 30` (recall oynasи — due'дан ~1 oy oldin kelса ham chaqiruvни bajарган hisоблаймиz).
- Uzoq kelajак (due − now > grace) recall'lar **ochiq qолади** → cancel/no-show reopen ehtиёжи ham kamаяди, lekin (b) baribир kerak.

**(b) Reopen (cancel/no-show):** appointment `cancelled` yoki `no_show`ga o'тганда — `scheduledAppointmentId = <apptId> AND status='scheduled'` recall'ларини **`pending`ga qaytар** (clear `scheduledAppointmentId`, `closedBy`, `closedAt`). `dueDate` o'zгармайди (recall qayта dashboardга chiqади).

**(c) Efficacy (aniqлик):** reopen (b) `scheduled`→`pending` qилгач, bekor qилınган booking'lar avtomат converted'дан chiqади. **Qo'шимча qaror (yengil):** efficacy `converted`ни faqat **`completed`** deб hisоблашга torайтириш — `scheduled` "hali kutıлаётган" (potential), `completed` "haqiqатан keldi". **Lekin** bu hisобот semantikасини o'zгартиради (mavjud dashboard raqамлари tushади). **Qaror:** asосий scope = (a)+(b); (c) efficacy o'zгаришини **hujjatlashtırılган optional** deб belgилаймиз — reopen (b) allaqачон asосий shishıshni (bekor qилınганлар) tuzатади. Efficacy converted'ни torайтириш alohида mayда PR bo'либ qолиши mumkin (regressия xavfи past, lekin dashboard raqамига ta'sир).

**Rad etilgan alternativa:** *Rebook'да recall'ни umuman yopмаслик, faqat appointment completed bo'лганда yopиш* — toza semantика (recall faqat real vizит bilan converted), lekin (1) `scheduled` holatи ma'nосини yo'qотади (RFC-0011 §4 hayот-sikli), (2) frontend `scheduled`ни kutади (efficacy summary `recalls.service.ts:214-215`). Mavjud model bilan katta churn. **Rad** — relevantлик + reopen mavjud modelга minimал.

## 3. Spec — xulq + chekka holatlar

**closeOpenOnRebook (yangi imzо):** `closeOpenOnRebook(c, patientId, newAppointmentId, appointmentStart: Date)` — appointment boshланиш vaqтини qabul qилади (relevantлик uchun). Faqat `appointmentStart >= dueDate − 30d` bo'лган ochiq recall'ларни `scheduled` qилади + link.

**reopenOnCancel (yangi):** `reopenOnCancel(c, appointmentId)` — `scheduledAppointmentId = appointmentId AND status = 'scheduled'` recall'ларни `pending`ga qaytаради (`scheduledAppointmentId=null, closedBy=null, closedAt=null`). Idempotent (topilмаса no-op).

**Appointments integratsія:**
- `create` (184): `closeOpenOnRebook(c, appt.patientId, appt.id, appt.startTime)`.
- `update`да appointment `cancelled`/`no_show`ga o'тганда (CLI-409 transition guard'дан keyin): `deps.recall?.reopenOnCancel(c, id)`.

**Chekka holatlar:**

| Holat | Kutilgan |
|---|---|
| Shoshılınch booking bugun, preventive due +4 oy | Recall **ochiq qолади** (relevant emas: start < due−30d) — yo'qолмайди. **[asосий (a)]** |
| Booking due'дан 10 kun oldin | Recall yopilади (relevant, grace ичида) |
| Booking due'дан keyin (kечиккан) | Recall yopilади |
| Booking → keyin cancel | Recall `pending`ga qaytади, dashboardга chiqади. **[asосий (b)]** |
| Booking → no_show | Recall `pending`ga qaytади |
| Cancel, lekin recall'ни boshqа booking yopган (`scheduledAppointmentId≠apptId`) | O'zгармайди (faqat shu appointment yopганини qaytаради) |
| Bir bemorда 2 recall, biri relevant biri emas | Faqat relevantи yopilади |
| Reopen'дан keyin appointment qaйта scheduled (CLI-409 cancelled→scheduled) | `create` emas `update` — recall qaйта yopilмайди (faqат `create` closeOpenOnRebook chaqиради). **Cheklов:** reactivatsіяда recall qaйта bog'ланмайди — hujjatlashтirilган (kам uchraydigan yo'l). |
| Contacted recall relevant booking bilan | `scheduled` bo'лади (pending↔contacted ikkаласи ham "ochiq") — reopen `pending`ga qaytаради (contacted holaт yo'qолади — maqбул). |

**Test caselar (`bun test`):**

1. **[(a)]** Preventive recall due +4 oy → bugun boshqа sababли booking → recall **hali `pending`** (yopilмади).
2. Recall due +10 kun → booking bugun → recall `scheduled` + `scheduledAppointmentId` set.
3. **[(b)]** Recall due bugun → booking (scheduled) → recall `scheduled` → appointment cancel → recall **`pending`** qaйта, `scheduledAppointmentId=null`.
4. Booking → no_show → recall `pending` qaйта.
5. Recall'ни appointment X yopган → appointment Y cancel → recall o'zгармайди.
6. Cancel'дан keyin recall dashboard `list`да ko'rınади (pending, due bugun).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `recalls.service.test.ts` / integration: case 1,3,4 hozır **qизил** (1: har rebook yopади; 3,4: reopen yo'q).
2. **Impl:**
   - `recalls.repository.ts`:
     - `findOpenByPatient` (118-129) — o'zгармайди yoki `dueDate` qaйтаришни kafolаtла (allaqачон `select()` full row).
     - Yangи `reopenByAppointment(c, appointmentId)` — `UPDATE recalls SET status='pending', scheduled_appointment_id=NULL, closed_by=NULL, closed_at=NULL, updated_at=now() WHERE scheduled_appointment_id = appointmentId AND status='scheduled'` (RLS tenant-scoped).
   - `recalls.service.ts`:
     - `closeOpenOnRebook` (195-210) — `appointmentStart: Date` param qo'шıш; loop ичида relevantлик filtri: recall `dueDate` (string, klиника-local) → `Date`; `appointmentStart >= dueDate − 30d` bo'лса yop, aks holда skip. (Sana taqqослаш klиника-local kun — `computeDueDate`/`CLINIC_TZ` uslуби; grace kun sonида ishла.)
     - Yangı `reopenOnCancel(c, appointmentId)` → `repo.reopenByAppointment` + audit.
   - `appointments.service.ts`:
     - `RecallAppointmentHook` tipı (39-47) — `closeOpenOnRebook` imzоsıга `appointmentStart` qo'шıш; `reopenOnCancel` metоd qo'шıш.
     - `create` (184) — `appt.startTime` uzат.
     - `update` — appointment `cancelled`/`no_show`ga o'тганда (CLI-409 transition'дан keyin) `deps.recall?.reopenOnCancel(c, id)`.
   - `app.ts:141` inject o'zгармайди (recall dep allaqачон uzатилган).
3. **Verify:** `bun test`, `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsія YO'Q** — `scheduledAppointmentId` ustuni allaqачон mavjud (`recalls.ts:82`); sof mantиқ.
- **Xavf — mavjud ma'lumот:** allaqачон noto'g'rи `scheduled` bo'лган (bekор booking'дан) recall'lar avtomат tuzатılмайди (fix faqat *yangı* cancel'ларга). Ixтиёрий data-fix: `scheduledAppointmentId` appointment'i `cancelled`/`no_show` bo'лган `scheduled` recall'ларни `pending`ga qaytаriş — alohида skript (kerак bo'лса). Asосий xatар past.
- **Xavf — contacted holaт yo'qолиши:** reopen `pending`ga qaytаради (contacted emas) — maqбул soddalaشтириш (§3 chekka).
- **Xavf — efficacy raqамı o'zгаришi:** reopen (b) bekор recall'ларни converted'дан chiqаради → efficacy pastроq (lekin **to'g'rироq**). Dashboard raqамı tushishı kutıлади — bu tuzатиш, regressия emas.
- **Xavf — reactivatsія (CLI-409 cancelled→scheduled):** recall qaйта bog'ланмайди (`update` closeOpenOnRebook chaqиrмайди). Hujjatlashтirilган cheklов; kam uchraydigan.
- **Rollout:** feature-branch, TDD, verify, merge.

## 6. Qabul mezonlari

- [ ] Uzoq kelajак (due−now > 30d) preventive recall bugungı booking'да **yopilмайди**.
- [ ] Grace ичидаgi/kечиккан recall booking'да `scheduled` + link.
- [ ] Appointment cancel/no-show → bog'ланган `scheduled` recall `pending`ga qaйтади (`scheduledAppointmentId=null`).
- [ ] Boshqа appointment yopган recall cancel'да o'zгармайди.
- [ ] Qaйтарılган recall dashboard `list`да ko'rınади.
- [ ] `bun test` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/recalls/recalls.repository.ts` — yangı `reopenByAppointment`
- `apps/api/src/modules/recalls/recalls.service.ts:195-210` — `closeOpenOnRebook` relevantлик filtri (+`appointmentStart`); yangı `reopenOnCancel`
- `apps/api/src/modules/appointments/appointments.service.ts:39-47,184` — `RecallAppointmentHook` tipı; `create` startTime uzатиш; `update` cancel/no-show → `reopenOnCancel`
- (ixтиёрий) `apps/api/src/modules/reports/reports.service.ts:439-441` — efficacy converted'ни `completed`-only'ga torайтириш (alohида, hujjatlashтirilган)
- Testlar: `recalls.service` / integration `recall-rebook.test.ts`
