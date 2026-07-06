# CLI-417 — Payroll: takroriy/ustma-ust davr run (ikki marta to'lov) + `periodFrom ≤ periodTo` yo'q + davr o'rtasida ketgan xodim tushib qoladi

Audit: AUDIT-2026-07-06.md · M4 + M4b.

---

## 1. Muammo va ildiz sabab

### 1a. Ustma-ust / takroriy run himoyasi yo'q (ikki marta to'lov)
`apps/api/src/modules/payroll/payroll.service.ts:24-108` — `createRun` bir davr uchun
`payroll_runs` (draft) + `payroll_lines` snapshot yozadi, lekin **shu tenant uchun ayni
davrga (yoki ustma-ust davrga) allaqachon run borligini tekshirmaydi**. Ikki June run
yaratilib ikkalasi ham `finalizeRun` qilinsa (`payroll.service.ts:145-166`) — baza maosh +
komissiya **ikki marta** hisoblanadi. DB darajasida ham hech qanday cheklov yo'q:
`packages/db-schema/src/tables/payroll-runs.ts:8-22` — faqat `payroll_runs_tenant_idx`
indeks, hech qanday unique/exclude constraint yo'q.

### 1b. `periodFrom ≤ periodTo` tekshirilmaydi
`apps/api/src/modules/payroll/payroll.schema.ts:5-8`:
```ts
export const createRunSchema = z.object({
  periodFrom: z.iso.date(),
  periodTo: z.iso.date(),
});
```
Teskari oraliq (`periodFrom > periodTo`) qabul qilinadi. `payroll.service.ts:31-32`:
```ts
const start = new Date(`${input.periodFrom}T00:00:00+05:00`);
const end = new Date(`${input.periodTo}T23:59:59.999+05:00`);
```
`start > end` bo'lsa `between(cashierTransactions.createdAt, start, end)`
(`payroll.service.ts:70`) hech qachon rost bo'lmaydi → barcha attributed daromad 0, jim.

### 1c. Davr o'rtasida ketgan xodim payroll'dan butunlay tushadi (M4b)
`payroll.service.ts:50-57` faqat `employmentStatus = 'active'` profillarni oladi:
```ts
.from(staffProfiles)
.where(eq(staffProfiles.employmentStatus, 'active'));
```
Xodim davr o'rtasida ishdan bo'shatilsa `employmentStatus` → `'inactive'`
(`packages/db-schema/src/tables/staff-profiles.ts:6,19`). Run **shu paytda** ishga
tushirilsa — xodim `active` emas → snapshot'dan tushadi. Lekin u davr ichida daromad
keltirgan (plan-linked completed payment, `payroll.service.ts:59-73`) → **haqiqiy komissiya
iz qoldirmasdan yo'qoladi**. `staff_profiles`da tugash sanasi (`ended_at`) ustuni yo'q →
"davrning bir qismida faol edi"ni bevosita aniqlab bo'lmaydi.

---

## 2. Dizayn qarori

### 2a. Ustma-ust run — service tekshiruvi + DB EXCLUDE constraint (ikki qatlam)
**Tanlangan:** `createRun` transaksiyasi ichida (run insert'dan OLDIN) shu tenant uchun
oraliq bilan **kesishuvchi** har qanday mavjud run bor-yo'qligini tekshirish
(`period_from <= input.periodTo AND period_to >= input.periodFrom`), bor bo'lsa
`overlap` xatosi bilan rad etish; **hamda** DB darajasida backstop sifatida
`EXCLUDE USING gist` constraint (btree_gist) qo'yish — TOCTOU poygasini yopadi.

- Kesishuv `[]` inklyuziv daterange bilan: `daterange(period_from, period_to, '[]')`.
- Guard **barcha** run'larga (draft + finalized) qo'llanadi — takroriy draft ham daromad
  hisobini chalg'itadi va keyin ikkalasi finalize qilinsa double-pay bo'ladi.

**Draft-deadlock yechimi (majburiy hamroh):** hozir run o'chirish endpoint'i yo'q →
noto'g'ri draft davrni **abadiy** bloklaydi. Shuning uchun `DELETE /payroll/runs/:id`
(faqat `status='draft'`, `payroll.manage`) qo'shiladi — cascade `payroll_lines`ni
o'chiradi (FK `onDelete: 'cascade'` — `payroll-lines.ts` da runId → payroll_runs).

**Rad etilgan alternativa:**
- *Faqat service-check, DB constraint'siz* — READ COMMITTED'da ikki parallel `createRun`
  bir vaqtda kesishuvni topmay ikkalasi ham insert qilishi mumkin (poyga). DB constraint
  determenistik kafolat beradi.
- *Faqat finalize'da tekshirish* — draft bosqichida allaqachon daromad hisobi
  ko'rsatiladi/eksport qilinadi; ikki draft ham chalkashlik. Kesishuv create'da bloklansa
  toza.

### 2b. `periodFrom ≤ periodTo` — Zod `.refine`
`createRunSchema`ga `.refine(d => d.periodFrom <= d.periodTo, …)`. ISO `YYYY-MM-DD`
leksikografik taqqoslash sana tartibi bilan mos → qo'shimcha parse shart emas.

### 2c. `finalizeRun` — transaksiya + qator qulfi
`finalizeRun` (`payroll.service.ts:145-166`) hozir `getDb(c)` bilan transaksiyasiz
`SELECT` → status tekshirish → `UPDATE`. TOCTOU: ikki parallel finalize ikkalasi ham
`status='draft'` ko'rib ikkalasi ham finalize qilishi mumkin (bir run uchun). Yechim:
`db.transaction` ichida `SET LOCAL app.current_tenant_id` + `SELECT … FOR UPDATE`
(qatorni qulflab) → status qayta tekshirish → `UPDATE`.

### 2d. Davr o'rtasida ketgan xodim — "davrda daromad keltirgan"ni ham qamrash
**Tanlangan (migratsiyasiz):** snapshot eligibility'ni kengaytirish —
`employmentStatus = 'active'` **YOKI** davr ichida attributed daromadga ega
(`doctorId ∈ revByDoctor`). Ya'ni: hozir faol profillar + davrda haqiqatan daromad
keltirgan (endi `inactive`) profillar. Komissiya `computePayrollLine` orqali attributed
daromaddan hisoblanadi → ketgan xodim ham o'z komissiya qatorini oladi.

**Nima uchun shu, Qaror #16 (payroll snapshot) bilan mosligi:** Qaror #16 — run vaqtida
`baseSalary`/`commissionPercent` qiymatlari SNAPSHOT olinadi (keyingi profil tahriri eski
run'ni o'zgartirmaydi). Bu yechim shu falsafani buzmaydi: baribir `staff_profiles`dagi
saqlangan qiymatlarni snapshot qiladi, faqat eligibility to'plamiga davrda-daromadli
inactive profillarni qo'shadi.

**Rad etilgan alternativalar:**
- *`ended_at` ustuni + interval overlap + baza proratsiya* — semantik jihatdan eng to'g'ri
  (ishlagan kunlarga mutanosib baza), lekin: (1) yangi ustun + backfill + `ended_at`ni
  deaktivatsiya yo'liga ulash kerak (keng o'zgarish, legacy inactive qatorlarda `ended_at`
  ishonchsiz); (2) baza proratsiyasi klinika hali belgilamagan siyosat (yarim-oy baza
  to'lovi) va qo'shimcha arifmetik xavf. Bug — komissiya YO'QOLISHI; proratsiya alohida,
  keyingi ticket. Kelajakda kerak bo'lsa shu model qo'shiladi.
- *Base salary'ni ketgan xodim uchun 0 qilish* — noaniq siyosat; snapshot falsafasini
  buzadi. Manager draft'ni finalize'dan oldin ko'rib qo'lda tuzatishi mumkin.

> **Ochiq/ hujjatlashtirilgan cheklov:** ketgan xodim hozircha TO'LIQ baza maoshini oladi
> (proratsiya YO'Q). Bu bilib qilingan chegaralash — proratsiya keyingi ticket. Snapshot
> draft'da ko'rinadi, manager finalize'dan oldin ko'radi.

---

## 3. Spec — xulq + edge cases + test case'lar

### Xulq
1. `createRun(period)` — shu tenantda `period` bilan kesishuvchi run bo'lsa `overlap`
   xatosi (HTTP 409), aks holda draft + lines snapshot (avvalgidek).
2. `periodFrom > periodTo` → 400 validation error (`payroll.manage` guard'dan oldin ham,
   Zod so'rov validatsiyasi darajasida).
3. Snapshot eligibility: `active` profillar ∪ davrda attributed daromadli profillar.
4. `finalizeRun` — transaksiya + `FOR UPDATE`; ikkinchi finalize `not_draft`.
5. `DELETE /payroll/runs/:id` — draft bo'lsa o'chiradi (cascade lines), aks holda
   `not_draft`/409.

### Edge cases
- Bir kunlik davr (`periodFrom == periodTo`) — ruxsat (`<=`).
- Aynan tutashuvchi davrlar: Iyun (01–30) va Iyul (07-01…) — kesishmaydi (`[]` inklyuziv,
  chegara turli kun) → ruxsat.
- Bir kunlik ustma-ustlik: mavjud (06-01…06-30), yangi (06-30…07-15) → 06-30 kesishadi →
  rad.
- Faol, lekin davrda 0 daromadli profil — avvalgidek kiritiladi (baza-only qator).
- Inactive + davrda 0 daromadli profil — kiritilmaydi (ish ham daromad ham yo'q).
- Inactive + davrda daromadli (ketgan doktor) — **kiritiladi**, komissiya bilan.
- Parallel ikki `createRun` bir davrga — biri o'tadi, ikkinchisi DB EXCLUDE'da
  `23P01 exclusion_violation` → `overlap`ga map qilinadi.

### Test case'lar (`apps/api/tests/integration/cli-417-payroll-guards.test.ts`, real DB)
Mavjud `payroll.test.ts` seed patternidan (users/tenants TRUNCATE, `SET LOCAL
app.current_tenant_id`, `ctx(tx,…)`) foydalanadi.

- **T1 (overlap):** run(2026-06-01..06-30) yaratiladi → ikkinchi run(2026-06-01..06-30)
  → `overlap` (yoki route 409). Kesishuvchi (2026-06-15..07-15) ham → `overlap`.
- **T2 (teskari oraliq):** `createRunSchema.safeParse({periodFrom:'2026-06-30',
  periodTo:'2026-06-01'})` → `success=false` (schema unit test).
- **T3 (ketgan doktor komissiyasi):** doktor davrda plan-linked completed payment
  keltiradi, keyin `staff_profiles.employmentStatus='inactive'` qilinadi. `createRun` →
  o'sha doktor uchun `payroll_lines` qatori bor, `attributedRevenue` va `commissionAmount`
  > 0.
- **T4 (finalize idempotent/lock):** ketma-ket ikki finalize → ikkinchisi `not_draft`
  (mavjud `payroll.test.ts` T5 ni saqlaydi; transaksiya-lock refaktoridan keyin ham yashil).
- **T5 (delete draft):** draft run yaratiladi → `DELETE` → o'chadi; keyin xuddi shu davrga
  yangi run yaratsa bo'ladi (deadlock yechimi). Finalized run'ni delete → `not_draft`.
- **T6 (tutash davrlar ruxsat):** (06-01..06-30) + (07-01..07-31) → ikkalasi ham yaratiladi.

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `cli-417-payroll-guards.test.ts` yoziladi (T1, T3, T5, T6) +
   `payroll.schema.test.ts`ga T2 (agar fayl yo'q bo'lsa yaratiladi). `bun test` — qizil.
2. **Schema:** `payroll.schema.ts` — `createRunSchema`ga
   `.refine((d) => d.periodFrom <= d.periodTo, { message: 'periodFrom must be <= periodTo',
   path: ['periodTo'] })`. → T2 yashil.
3. **Migratsiya (manual SQL):** `apps/api/drizzle/0028_payroll_run_no_overlap.sql`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ALTER TABLE payroll_runs
     ADD CONSTRAINT payroll_runs_no_overlap
     EXCLUDE USING gist (
       tenant_id WITH =,
       daterange(period_from, period_to, '[]') WITH &&
     );
   ```
   (Drizzle schema builder EXCLUDE'ni native ifodalamaydi → qo'lda SQL migratsiya;
   `payroll-runs.ts`ga izoh qatori qo'shiladi.)
4. **Service — createRun:** transaksiya ichida, run insert'dan oldin kesishuv `SELECT`
   (service-qatlam guard) → topilsa `throw`/qaytariladigan `{ ok:false, reason:'overlap' }`.
   Eligibility so'rovi `WHERE`ini o'zgartirish: `active` ∪ `revByDoctor` kalitidagi
   profillar. Amaliy yondashuv: (1) `active` profillarni olish, (2) daromad rows'dan
   `doctorId` to'plamini olish, (3) yetishmagan (inactive-lekin-daromadli) profillarni
   qo'shimcha `SELECT`da olib birlashtirish — hammasini bitta `userId`-unik Map'ga yig'ish.
5. **Service — finalizeRun:** `db.transaction` + `SET LOCAL app.current_tenant_id` +
   `SELECT … FOR UPDATE` + status tekshirish + `UPDATE`.
6. **Route:** `payroll.routes.ts` — `createRun` `overlap` → 409 `fail('conflict', …)`;
   yangi `DELETE /runs/:id` (`payroll.manage`, draft-only) + `deleteRun` service metodi.
7. **Verify:** `cd apps/api && bun test --env-file=../../.env cli-417` + mavjud
   `payroll.test.ts` yashil (regressiya yo'q). `bun run typecheck`, `bun run check:rls`.

---

## 5. Migratsiya / rollout / xavflar
- **btree_gist extension** — Postgres 16 core'da mavjud, `CREATE EXTENSION` superuser yoki
  extension-egasi kerak (deploy migratsiya roli buni bajara olishini tekshirish —
  desktop'da `dental` superuser, cloud'da migratsiya roli).
- **Mavjud ustma-ust run'lar** — constraint qo'shishdan oldin ishlab turgan bazada
  kesishuvchi run bo'lsa `ALTER TABLE` FAIL bo'ladi. Migratsiyadan oldin tekshiruv
  so'rovi (kesishuvchi juftlar) hujjatlashtiriladi; topilsa qo'lda ko'rib chiqish.
- **Delete-draft endpoint** — faqat draft; finalized o'chirilmaydi (audit yaxlitligi).
- **RLS:** EXCLUDE constraint RLS bilan mos; `tenant_id WITH =` kross-tenant kesishuvni
  ham to'sadi (lekin RLS baribir tenant ichida ishlaydi).
- Backward-compat: faol-profilli common holat o'zgarmaydi (eligibility faqat kengayadi).

## 6. Qabul mezonlari
- [ ] Ayni/kesishuvchi davrga ikkinchi `createRun` rad etiladi (service + DB constraint).
- [ ] `periodFrom > periodTo` 400 qaytaradi.
- [ ] Davr o'rtasida `inactive` bo'lgan, lekin davrda daromadli doktor `payroll_lines`da
      komissiya bilan chiqadi.
- [ ] `finalizeRun` transaksiya + `FOR UPDATE`; ikkinchi finalize `not_draft`.
- [ ] `DELETE /payroll/runs/:id` draft'ni o'chiradi, finalized'ni rad etadi.
- [ ] Mavjud `payroll.test.ts` (6 test) yashil; `typecheck` + `check:rls` toza.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/payroll/payroll.schema.ts` — `.refine`.
- `apps/api/src/modules/payroll/payroll.service.ts` — overlap guard, eligibility union,
  finalize txn+lock, `deleteRun`.
- `apps/api/src/modules/payroll/payroll.routes.ts` — 409 map, `DELETE /runs/:id`.
- `packages/db-schema/src/tables/payroll-runs.ts` — constraint izohi.
- `apps/api/drizzle/0028_payroll_run_no_overlap.sql` — yangi manual migratsiya.
- `apps/api/tests/integration/cli-417-payroll-guards.test.ts` — yangi test (+ schema unit
  test).
