# CLI-408 — Double-booking race (check-then-insert, DB kafolatisiz)

> Audit: HIGH H4. `checkConflict()` SELECT keyin INSERT — READ COMMITTED tx, `FOR UPDATE` yo'q, EXCLUDE constraint yo'q. Ikki parallel yozilish bir doktorga bir slot uchun ikkalasi ham conflict topmaydi → double-booking, hech qachon aniqlanmaydi.

## 1. Muammo va ildiz sabab

`apps/api/src/modules/appointments/appointments.service.ts`:

- `checkConflict` (56-82) — `SELECT ... LIMIT 1` overlap tekshiruvi. Sof o'qish, hech qanday lock olmaydi.
- `create` (144-147) — `checkConflict` `false` qaytarsa `db.insert(...)` (154-168). Tekshiruv va insert **alohida statement**; orasida boshqa tranzaksiya bir vaqtning o'zida o'sha slotга insert qilishi mumkin.
- `update` (200-201) — reschedule yo'lida bir xil check-then-update pattern (`excludeId` bilan).

Ildiz sabab: **overlap yagona muzlik (invariant) DB darajasида majburlanmagan**. `appointments` jadvalida (`packages/db-schema/src/tables/appointments.ts:22-58`) faqat oddiy `index('appointments_doctor_time_idx')` bor — unique/exclude constraint yo'q. Migratsiyalarда (`apps/api/drizzle/`) `btree_gist`/`EXCLUDE`/`gist` umuman uchramaydi (grep 0 natija). Application-level SELECT READ COMMITTED izolyatsiyasида race'ni yopa olmaydi.

## 2. Dizayn qarori

**Postgres `EXCLUDE USING gist` constraint (00-DESIGN-DECISIONS CLI-408 QAROR).** DB motori bir doktor uchun overlap qatorlar yozilishini atomik rad etadi — race yo'q, per-request tx izolyatsiyasidan mustaqil.

Constraint:

```sql
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_doctor_overlap
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status <> 'cancelled');
```

- `tstzrange(start_time, end_time)` — default yarim-ochiq `[start, end)` → **`end == start` back-to-back overlap EMAS** (mavjud `checkConflict` semantikasi bilan aynan mos, 67-71-qator izohi).
- `WHERE (status <> 'cancelled')` — bekor qilingan yozilishlar constraint'dan chiqadi (slot bo'shaydi).
- `EXCLUDE` gist index'ini talab qiladi → `btree_gist` extension `doctor_id` (uuid, `=` operatori) uchun kerak.

**Drizzle EXCLUDE'ни ifodalay olmaydi** (schema DSL'да yo'q) → **xom SQL migratsiya**. Constraint buzilганда Postgres `SQLSTATE 23P01` (exclusion_violation) otadi → service uni ushlaydi va `409 conflict.doctor_busy` qaytaradi.

**Friendly pre-check SAQLANADI** — `checkConflict` foydalanuvchiga tez, aniq 409 beradi (odатdaги holat). Constraint faqat race edge-case uchun **to'g'rilik kafolati** (backstop). Ikki qatlam: UX (pre-check) + integrity (constraint).

**Rad etilgan alternativa:** *Postgres advisory lock (`pg_advisory_xact_lock(doctor_id hash)`)* — barcha yozuvni doctor bo'yicha serializatsiya qiladi, lekin (a) hash collision xavfi, (b) DB-darajа deklarativ invariant emas (kod unutса buziladi), (c) reschedule/boshqa yo'llar lock olishни unutса teshik qoladi. EXCLUDE — deklarativ, hamma yo'lni qamраб oladi.

## 3. Spec — xulq + chekka holatlar

**Xulq:**

- Ikki concurrent `create` bir doktor + ustma-ust oraliq → **aynan bittasi** muvaffaqiyat (201/200), ikkinchisi **409 `conflict.doctor_busy`**.
- `create`/`update` da pre-check ushласа → mavjud xulq (409) o'zgармaйди.
- Pre-check o'tса-yu constraint otса → service `23P01`ни ushлаб **409 `conflict.doctor_busy`** (500 EMAS).

**Chekka holatlar:**

| Holat | Kutilgan |
|---|---|
| `end == start` (back-to-back) | Ruxsat (overlap emas, `[start,end)`) |
| Bir doktor, ustma-ust oraliq, ikkinchisi `cancelled` | Ruxsat (cancelled constraint'dan chiqadi) |
| Reschedule (`update`) mavjud boshqa yozilishга ustiga | 409 (constraint `excludeId`siz ham ishlaydi — DB darajа) |
| Bir yozilishни o'zини reschedule (o'ziga overlap) | Ruxsat — UPDATE bir qatorни o'zgartiradi, EXCLUDE **eski qatorни chiqarib** yangисини solishтиради (o'z-o'ziga to'qnashmaydi) |
| Boshqa doktor bir slot | Ruxsat (`doctor_id WITH =`) |

**Test caselar (`bun test`, integration — real DB):**

1. **Concurrent insert** — `Promise.allSettled([create(A), create(A)])` bir doktor+slot → aynan 1 ta `ok:true`, 1 ta `conflict.doctor_busy`. DB'да 1 qator.
2. `end == start` ketма-ket ikki yozilиш → ikkаласи ham OK.
3. Cancelled yozилиш ustига yangи → OK.
4. Reschedule (`update`) band slotга → 409.
5. Yozилишни o'z vaqtинда kичик siljitиш (o'z-overlap) → OK (self-exclude).
6. Constraint mavjudлигини tekshир — `SELECT conname FROM pg_constraint WHERE conname='appointments_no_doctor_overlap'` topilади.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `apps/api/tests/integration/appointments-overlap.test.ts` (yangi). Case 1 (concurrent) hozir **qizil** (ikkаласи ham insert bo'lади). Case 6 constraint yo'qлиги uchun qizil.

2. **Migratsiya (xom SQL, Drizzle EXCLUDE ifodалай olmайди):**
   - Drizzle journal-boshqаrуvли: `apps/api/drizzle/0028_appointments_no_overlap.sql` yangi fayl + `apps/api/drizzle/meta/_journal.json`ga `{"idx":28,"version":"7","when":<ts>,"tag":"0028_appointments_no_overlap","breakpoints":true}` entry (0027 dan keyin). Snapshot: `drizzle-kit generate --custom --name appointments_no_overlap` ishlатиб bo'sh migration + journal + snapshot **avtomatik** yaratилса afzal (qo'лда journal tahrirдан ko'ra) — keyin fayl mazmuни to'ldiriladi.
   - Fayl mazmuни (statement-breakpoint bilan, 0025 uslуби):
     ```sql
     CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
     ALTER TABLE "appointments"
       ADD CONSTRAINT "appointments_no_doctor_overlap"
       EXCLUDE USING gist (
         "doctor_id" WITH =,
         tstzrange("start_time", "end_time") WITH &&
       )
       WHERE ("status" <> 'cancelled');
     ```
   - `CREATE EXTENSION` **superuser** talab qiladi. `migrate.ts` Drizzle migratsiyаларини `adminDb` (superuser `DATABASE_ADMIN_URL`) bilan qo'llайди (`migrate.ts:51-52,164`) → OK. Cloud'да `dental` superuser, desktop first-run'да ham (`migrate.ts:57-64`).
   - **Muqобил joy:** xom SQL uchun `apps/api/migrations/rls/` katalоги ham bor (admin-conn bilan `applyRlsMigrations`, `migrate.ts:120-159`) — lekin u **RLS policy'lар** uchun semantik ajratилган; constraint **schema DDL** bo'lgani uchun asосий Drizzle journalда (0028) turиши to'g'rи (schema evolutsияси bilan izchil). **Qaror: Drizzle journal (0028).**
   - **Migratsiядан oldin mavjud overlap ma'lumот** constraint qo'shилishини BLOKlaydi. `ADD CONSTRAINT`дан oldin cleanup guard qo'shилади (pastда §5).

3. **Impl — service (`appointments.service.ts`):**
   - Yangi ichki helper (yoki inline) `create` va `update` insert/update'ini `try/catch` bilan o'raш. Postgres xato kodини tekshirиш:
     ```ts
     function isExclusionViolation(err: unknown): boolean {
       return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23P01';
     }
     ```
     (`postgres-js` xatосида `code` maydoni SQLSTATE'ни beradi.)
   - `create` (154-168): `insert` chaqiruvини `try` ичига; `23P01` → `return { ok: false as const, code: 'conflict.doctor_busy' }`.
   - `update` (218-222): `db.update(...).set(patch)` ни `try` ичига; `23P01` → `return { ok: false as const, code: 'conflict.doctor_busy' }`.
   - `checkConflict` (56-82) **o'zgармaйди** — friendly pre-check sifatida saqланади.

4. **Verify:** `bun test` (integration DB), `bun run typecheck`, `bun run check:rls` (constraint RLS coverage'ни buzмаsлиги). Concurrent test ishonchлилиги uchun `Promise.allSettled` + DB row count assertion.

## 5. Migratsiya / rollout / xavflar

- **Mavjud overlap ma'lumот:** prod'да allaqачон double-booked yozilишлар bo'lса `ADD CONSTRAINT` fail bo'lади. Migratsiя boshида **diagnostika/cleanup**: overlap juftликларини topib logла (yoki eски'sини `cancelled`ga o'tказ). **Qaror:** migratsiяда avtomatik o'zgартирмаймиз (klиник ma'lumот) — o'рнига migratsия README/PR izohида "avvал overlap tekshир" ogohlantирiши; yangи/toza DB'да muammosиз qo'llanади. Agar avtomatlashтириш kerak bo'lса, alohida data-fix skript (constraint'дан oldin).
- **`btree_gist` extension** — Postgres 16 standart `contrib`да mavjud (docker `postgres:16` + desktop bundled PG). `IF NOT EXISTS` idempotent.
- **Xavf: 500 o'rniga 409** — `23P01` ushланmаса foydаluvchи 500 ko'ради. Test case constraint yo'лини qamраб oladi (pre-check'ни chetlaб o'tказиб — mas. concurrent — constraint otишини majбурлаб).
- **Performance:** gist index yozувда oz overhead; o'qишда `checkConflict` mavjud btree index'ни ishлатади (o'zgармaйди).
- **Rollback:** `ALTER TABLE appointments DROP CONSTRAINT appointments_no_doctor_overlap` (down — Drizzle avtomatик down yaratмаyди; qo'лда PR izohида).

## 6. Qabul mezonlari

- [ ] `0028_appointments_no_overlap.sql` + journal + snapshot; `bun run db:migrate` toza qo'llanади.
- [ ] `pg_constraint`да `appointments_no_doctor_overlap` mavjud; `btree_gist` yoqилган.
- [ ] Concurrent create (bir doktor+slot) → aynan 1 muvaffaqiyat, 1 × `conflict.doctor_busy`; DB'да 1 qator.
- [ ] `end==start` ketma-ket → ikkаласи OK.
- [ ] Cancelled ustiga yangи → OK.
- [ ] Reschedule band slotга → 409; o'z-reschedule → OK.
- [ ] Pre-check qatlами saqланган (odатdaги 409 tez).
- [ ] `bun test` + `typecheck` + `check:rls` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/drizzle/0028_appointments_no_overlap.sql` (yangi — xom SQL EXCLUDE + extension)
- `apps/api/drizzle/meta/_journal.json` + `meta/0028_snapshot.json` (drizzle-kit generate --custom bilan)
- `apps/api/src/modules/appointments/appointments.service.ts` — `create` (154-168) va `update` (218-222) insert/update `23P01` catch → 409
- `apps/api/tests/integration/appointments-overlap.test.ts` (yangi test)
