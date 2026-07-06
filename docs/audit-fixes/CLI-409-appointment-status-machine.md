# CLI-409 — Yozilish status-mashinasi yo'q; qayta-faollashtirish tekshiruvni chetlab o'tadi

> Audit: HIGH H5. `update()` conflict/schedule tekshiruvини faqat `if (input.startTime || input.endTime || input.doctorId)` ishga tushiradi. Status-only PATCH bekor qilingan yozilишни nol overlap tekshiruvи bilan tiklaйди. Holat-mashinаси umuman yo'q — istalgan status→istalgan status.

> **Bog'liq:** CLI-408 (EXCLUDE constraint) status→active tiklаш'даги overlapни DB darajасида ham to'sади (cancelled→scheduled band slotга constraint 23P01 → 409). Bu ticket **application state-machine + qayta-validatsия** qatlамини qo'shади; ikkаласи birga chuqур himoya.

## 1. Muammo va ildiz sabab

`apps/api/src/modules/appointments/appointments.service.ts:189-258` `update()`:

- **195-206:** conflict + schedule check faqat `input.startTime || input.endTime || input.doctorId` bo'лганда. Status-only PATCH (`{ status: 'scheduled' }`) — bu shart `false` → **hech qanday tekshiruvsiz** `patch.status` yoziladi (213-qator).
- **Holat-mashinаси yo'q:** `patch.status = input.status` (213) hech qanday transition matritsасини tekshirмайди. `completed→scheduled`, `cancelled→in_progress`, `no_show→confirmed` — barcha o'tишлар ruxsat.

**Ssenarий (H5):** yozилиш `cancelled` → slot boshqага berилди → eски yozилишга `PATCH {status:'scheduled'}` → 195-qator sharti `false` (vaqт/doktор o'zgармади) → tekshiruvsиз `scheduled` → **bir slotда ikki yozилиш**.

Ildiz sabab: (1) transition qonунияти yo'q; (2) qayta-validatsия triger'i **maydon o'zgаришига** bog'ланган, **holatga o'tишга** emas.

## 2. Dizayn qarori

**To'liq state machine + qayta-validatsия (00-DESIGN-DECISIONS CLI-409 QAROR).**

**Transition matritsаси** (sof funksiya `assertAppointmentTransition(from, to)`):

| From \ To | scheduled | confirmed | in_progress | completed | no_show | cancelled |
|---|---|---|---|---|---|---|
| **scheduled** | — | ✅ | ✅ | ❌ | ✅ | ✅ |
| **confirmed** | ✅ | — | ✅ | ❌ | ✅ | ✅ |
| **in_progress** | ❌ | ❌ | — | ✅ | ❌ | ✅ |
| **completed** | ❌ | ❌ | ❌ | — | ❌ | ❌ (terminal) |
| **no_show** | ✅ | ❌ | ❌ | ❌ | — | ❌ |
| **cancelled** | ✅ | ❌ | ❌ | ❌ | ❌ | — |

Qonuniyat (spec matnи, DECISION'дан):

- `scheduled ↔ confirmed` (ikки yo'нали).
- `scheduled`/`confirmed` → `in_progress` → `completed` (klиник oqим).
- `scheduled`/`confirmed` → `cancelled` yoki `no_show`.
- **`cancelled → scheduled` RUXSAT** (qayta-faollаштириш) — lekin conflict + schedule check **qayta ishга tushади**.
- **`no_show → scheduled` RUXSAT** (qayta bron), xuddi shундай re-validatsия.
- **`completed` — terminal:** hech qanday chiqиш, vaqт/doktор tahriri yo'q.
- `in_progress → cancelled` ruxsat (vizит boshланиб bekor qilинди); `in_progress`дан scheduled/confirmed'ga qaйтиш yo'q.
- `X → X` (idempotent) — no-op, transition tekshiruvидан chiqади (patch status'ни qaйта yozади, xavfсиз) yoki matritsада `—`.

**Active holatlar** = `scheduled | confirmed | in_progress` (slotни egаllайди). **Har qanday active holatga o'tиш** (qaёкдан bo'lса) — vaqт/doktор o'zgаришидан **qat'i nazar** — `checkConflict` + `checkSchedule` qaйта ishга tushади. Bu H5'ни yopади: `cancelled→scheduled` (vaqт o'zgармаса ham) endi conflict tekshирилади.

**`completed` holatда vaqт/doktор tahriri rad etилади** — `completed` + `input.startTime|endTime|doctorId|serviceIds` → 400 (terminal immutable). Faqat `notes` kabi metadata? **Qaror (yengil):** `completed`'да har qanday mutatsия (status ham) rad — 400 `status.terminal`. (Klиник amaliyotда tugатилган vizит o'zgармaйди; tuzатиш kerak bo'lса teskари amal alohида.)

**Invalid transition → 400** `status.invalid_transition`.

**Rad etilgan alternativa:** *Minimal guard — faqat "active'ga o'tганда re-check"* — H5'ни yopади, lekin `completed→scheduled` kabi mantiqsiz o'tишларни ruxsat qолдиради (ma'lumот yaxlитлиги + audit chalкашлиги). To'liq matritsа deklarativ va testlаш oson. **Rad.**

## 3. Spec — xulq + chekka holatlar

**Yangи sof funksiya** `assertAppointmentTransition(from: Status, to: Status): void` — invalid bo'lса `InvalidStatusTransitionError` (400 mapping).

**`update()` yangи oqим:**

1. `before` olib kelинади (mavjud, 191).
2. Agar `input.status` berилган **va** `input.status !== before.status`:
   - `assertAppointmentTransition(before.status, input.status)` → invalid bo'лса 400.
3. Agar `before.status === 'completed'` **va** biror maydon o'zgартирилаётган bo'лса (status yoki time/doctor/services) → 400 `status.terminal`.
4. **Re-validatsия triger'i** (mavjud 195 shartни KENGAYTIRISH): `time/doctor o'zgаришида` **YOKI** `yangи holat active (scheduled/confirmed/in_progress)`да → `checkConflict` + `checkSchedule`. Ya'ni:
   ```
   const targetStatus = input.status ?? before.status;
   const targetActive = ['scheduled','confirmed','in_progress'].includes(targetStatus);
   const timeOrDoctorChanged = !!(input.startTime || input.endTime || input.doctorId);
   if (timeOrDoctorChanged || (targetActive && before.status !== targetStatus)) {
     // checkConflict(excludeId=id) + checkSchedule
   }
   ```
5. Recall hook (236-241) o'zgармaйди (`completed`ga o'тганда).

**Chekka holatlar:**

| Holat | Kutilgan |
|---|---|
| `cancelled → scheduled` band slotга | **400/409** — re-validatsия conflict topади (`conflict.doctor_busy`) |
| `cancelled → scheduled` bo'ш slotга | OK, tiklанади |
| `completed` yozилишни vaqт tahriri | **400** `status.terminal` |
| `completed → scheduled` | **400** `status.invalid_transition` |
| `scheduled → confirmed` (active→active, vaqт o'zгармас) | Re-check ishлайди; bo'ш bo'лса OK |
| `X → X` idempotent | No-op, transition tekshирилмайди |
| `in_progress → completed` | OK + recall (mavjud xulq) |
| `no_show → scheduled` band slotга | 409 |
| Faqat `notes` o'zgаришi, status yo'q, holat `scheduled` | Re-validatsия **shart emas** (targetStatus===before, timeOrDoctor o'zgармади) — mavjud tez yo'l |

**Test caselar (`bun test`):**

1. `cancelled → scheduled` band slotга (boshqа yozилиш bor) → rad (409/`conflict.doctor_busy`). **[H5 asосий]**
2. `completed` yozилишни `startTime` bilan PATCH → 400 `status.terminal`. **[H5]**
3. `completed → scheduled` → 400 `status.invalid_transition`.
4. `cancelled → scheduled` bo'ш slotга → OK.
5. `scheduled → confirmed` → OK.
6. `in_progress → completed` → OK + recall yaratилди (regressия yo'q).
7. `no_show → in_progress` → 400 (matritsа ❌).
8. `X → X` (scheduled→scheduled) → OK, no-op.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `appointments.service.test.ts`ga 8 case; hozir 1,2,3,7 qизил (state-machine yo'q).
2. **Impl:**
   - Yangи fayl `apps/api/src/modules/appointments/appointments.transitions.ts` — `AppointmentStatus` tipи, `ALLOWED_TRANSITIONS` xaritаси (matritsа), `assertAppointmentTransition(from,to)` sof fn + `InvalidStatusTransitionError` (message code `status.invalid_transition`) va terminal uchun `TerminalStatusError` (`status.terminal`) yoki bitta error klass + code param. (CLI-415 `treatment-plans.transitions.ts` uslуби bilan izchил.)
   - `appointments.service.ts` `update()` (189-206):
     - `before`дан keyin: `input.status && input.status !== before.status` → `assertAppointmentTransition`.
     - `before.status === 'completed'` + har qanday mutatsия → terminal error.
     - Re-validatsия triger'ini §3.4 formulасига kengaytirиш (`targetActive` qo'shиш).
   - `appointments.routes.ts` — service `throw` qилган transition/terminal error'ni `400` `{error:{code,...}}`ga map qilиш (mavjud error-handling patternига mos; PATCH handler'да try/catch yoki umумий error mapper).
3. **Verify:** `bun test`, `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsия YO'Q** — sof application mantiq (+ DB constraint CLI-408 alohида).
- **Xavf — mavjud stale UI:** frontend `cancelled→scheduled` yoki `completed` tahриrini yuborса endi 400 olади. Bu **to'g'ri** xulq; UI 400 toast bilan boshqаради (`MutationCache.onError` global, CLAUDE.md). Frontendда tugмаларни holatга qaraб yashириш — alohида follow-up (kritик emas, backend himoyа yetарли).
- **Xavf — queue-sync (`queue.service.ts:98-129`):** queue done→completed **to'g'ridан-to'g'ри** `db.update` qилади, `appointmentsService.update`'ни chaqiрмайди → bu state-machine'ни **chetlaб o'tади** (CLI-425 alohида muammо). Bu ticket queue yo'лини o'zgартирмайди; CLI-425 queue'ни shared path'ga o'тказганда bu guard ham qamраб olинади. Hozir queue faqat `→completed/in_progress/no_show` qилади (114-119 terminal guard bor) — xavfсиз subset.
- **Rollout:** feature-branch, TDD, lokal verify, main merge.

## 6. Qabul mezonlari

- [ ] `cancelled→scheduled` band slotга → rad (conflict).
- [ ] `completed` vaqт tahriri → 400; `completed→scheduled` → 400.
- [ ] `cancelled→scheduled` bo'ш slotга → OK.
- [ ] Barcha invalid transition (matritsа ❌) → 400.
- [ ] Active'ga o'тганда (vaqт o'zгармаса ham) conflict/schedule re-check ishлайди.
- [ ] `in_progress→completed` → OK + recall saqланган.
- [ ] `bun test` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/appointments/appointments.transitions.ts` (yangи — matritsа + assert fn + error klass(лар))
- `apps/api/src/modules/appointments/appointments.service.ts:189-206` — `update()` transition guard + terminal guard + re-validatsія triger kengaytirиш
- `apps/api/src/modules/appointments/appointments.routes.ts` — transition/terminal error → 400 mapping
- Testlar: `appointments.service.test.ts`
