# CLI-431 — Retention metrikasi branch filtrida asimmetrik (yangi = tenant-wide, qaytgan = branch-scoped)

Audit: AUDIT-2026-07-06.md · M18.

---

## 1. Muammo va ildiz sabab

`apps/api/src/modules/reports/reports.service.ts:409-426` — `dentalAnalytics` retention
bloki:

```ts
// yangi = oraliqda yaratilgan bemorlar (branchId E'TIBORSIZ — bemor branch-siz)
const [newRow] = await db
  .select({ c: count() })
  .from(patients)
  .where(between(patients.createdAt, start, end));           // :411-414

const apptRetFilter = [
  between(appointments.startTime, start, end),
  lt(patients.createdAt, start),
];
if (branchId) apptRetFilter.push(eq(appointments.branchId, branchId));  // :419 — branch-scoped!
const [retRow] = await db
  .select({ c: countDistinct(appointments.patientId) })
  .from(appointments)
  .innerJoin(patients, eq(appointments.patientId, patients.id))
  .where(and(...apptRetFilter));                             // :420-424
```

**Asimmetriya:** `newPatients` bemor-jadvalidan (`patients` — branch ustuni YO'Q,
Qaror #29: patients tenant-level) → doim **tenant-wide**. `returningPatients` esa
`appointments.branchId` bilan **branch-scoped** (branchId berilganda). Natijada
`retentionRate = returning / (new + returning)` (`reports.aggregations.ts:29-33`) da
su  ratlar turli populyatsiyadan:

**Ssenariy:** 3 filialli tenant, branchId=Filial-1 bilan. `new` — butun tenant bo'yicha
yangi bemorlar (masalan 30). `returning` — faqat Filial-1 da yozilgan eski bemorlar
(masalan 5). `retentionRate = 5/35 = 14%` — lekin bu 5 ni **butun tenant** yangi bemoriga
nisbatan o'lchaydi → kichik filiallarda **tizimli past** ko'rsatadi. branchId'ni
o'zgartirsangiz `returning` o'zgaradi, `new` esa qotib qoladi → raqamlar ichki
nomuvofiq.

**Qo'shimcha (recall-efficacy):** `reports.service.ts:428-441` — recall-efficacy bloki
`branchId`ni **umuman e'tiborga olmaydi** (`recalls` jadvalida branch ustuni yo'q). Ya'ni
xuddi shu `dentalAnalytics` javobida ba'zi metrikalar branch-scoped (procedureMix, noShow —
`cashier_transactions`/`appointments` da `branchId` bor), ba'zilari tenant-wide (retention
qisman, recall-efficacy to'liq) — nomuvofiq, hujjatlashtirilmagan.

---

## 2. Dizayn qarori

**Qaror maydoni (auditdan):**
- **(a)** branchId berilganda retention'ni **branch-izchil** hisoblash — `new` = oraliqda
  o'sha filialda BIRINCHI yozilishga ega bo'lgan bemorlar.
- **(b)** metrikani ochiq **tenant-wide** deb belgilash va branchId'ni izchil e'tiborsiz
  qoldirish (recall-efficacy'ni ham shunga moslash).

**Tanlangan: (b) — tenant-wide, izchil.**

Sabablar:
1. **Semantik to'g'rilik.** Bemor Qaror #29 bo'yicha tenant-level — bemorning "yangiligi"
   (retention) tabiatan branch-xususiyati EMAS. (a) variantidagi "birinchi-yozilish-filiali"
   sun'iy: bir bemor turli filialларда yozilishi mumkin, "yangi"lik filialga bog'liq emas.
2. **Mavjud pretsedent.** `planCompletion` (`reports.service.ts:346-348`) allaqachon
   branchId'ni ATAYLAB e'tiborsiz qoldiradi va Qaror #29 ga havola qiladi:
   > "branchId ataylab e'tiborga olinmaydi: treatment_plans tenant-level by-design
   > (Qaror #29 …)".
   Retention ham xuddi shu sinf (bemor + recall tenant-level) → bir xil siyosat.
3. **Soddalik + xavfsizlik.** (a) yangi "birinchi-yozilish-filiali" so'rovini (per-bemor
   min(startTime) + o'sha yozilish branchId'si) talab qiladi — murakkab, chekka holatlar
   (bir kunda ikki filial) noaniq.

**Amaliy o'zgarish:**
- `apptRetFilter`dan `eq(appointments.branchId, branchId)` (satr :419) **olib tashlanadi**
  → `returningPatients` tenant-wide (bemor oraliqda YOZILGAN — istalgan filialда — va
  oraliqdan OLDIN yaratilgan).
- Retention endi branchId'dan mustaqil → 3 filialli tenantда branchId qanday bo'lishidan
  qat'i nazar bir xil raqam → ichki izchil.
- Recall-efficacy allaqachon tenant-wide (o'zgarmaydi) — endi retention bilan mos.
- **Hujjatlashtirish:** `dentalAnalytics` DTO/schema izohi va kod izohida har sub-metrika
  scope'i aniq belgilanadi:
  - `procedureMix`, `noShowByWeekday` — **branch-scoped** (`cashier`/`appointments` da
    `branchId` bor, filtr qo'llanadi).
  - `retention`, `recallEfficacy` — **tenant-wide** (bemor/recall branch-siz, Qaror #29).

**Rad etilgan alternativa (a):** branch-izchil retention — semantik jihatdan shubhali
(bemor yangiligi branch emas), murakkab so'rov, chekka-holat noaniqligi. Klinika kelajakda
"filial bo'yicha yangi bemor oqimi" (birinchi tashrif filiali) analitikasini xohlasa — bu
ALOHIDA metrika (retention emas), alohida ticket.

---

## 3. Spec — xulq + edge cases + test case'lar

### Xulq
- `retention.newPatients` — oraliqda yaratilgan bemorlar (tenant-wide).
- `retention.returningPatients` — oraliqda (istalgan filialда) yozilgan, lekin oraliqdan
  OLDIN yaratilgan distinct bemorlar (tenant-wide).
- `retentionRate` — branchId parametridan **mustaqil**.
- `recallEfficacy` — tenant-wide (o'zgarmaydi).
- `procedureMix` / `noShowByWeekday` — branchId berilganda branch-scoped (o'zgarmaydi).

### Edge cases
- **branchId yo'q** — o'zgarmaydi (allaqachon tenant-wide).
- **Bemor bir necha filialда yozilgan** — distinct patientId bilan bir marta sanaladi
  (`countDistinct` saqlanadi).
- **new=0 va returning=0** — `retentionRate` 0 (`reports.aggregations.ts:31`).

### Test case'lar (`apps/api/tests/integration/cli-431-retention-consistency.test.ts`, real DB)
`cli-243-dental-analytics.test.ts` seed patternidan (3 filial, bemorlar, yozilishlar).

- **T1 (branch-invariant):** 3 filialli tenant seed: eski bemorlar (oraliqdan oldin
  yaratilgan) turli filiallarda oraliqda yozilgan + oraliqda yangi bemorlar yaratilgan.
  `dentalAnalytics({from,to})` (branchId yo'q), `…({branchId: b1})`, `…({branchId: b2})`,
  `…({branchId: b3})` — **`retention.newPatients`, `returningPatients`, `retentionRate`
  hammasida BIR XIL** (branch-invariant).
- **T2 (to'g'ri qiymat):** masalan 10 yangi (oraliqda yaratilgan) + 4 qaytgan (eski, oraliqda
  yozilgan, 2 si b1, 1 b2, 1 b3) → `newPatients=10`, `returningPatients=4`,
  `retentionRate = 4/14`.
- **T3 (recall-efficacy tenant-wide):** recall'lar (branch-siz) — branchId bilan/siz bir xil
  efficacy.
- **T4 (procedureMix branch-scoped saqlanadi):** filialga xos itemli sale → `procedureMix`
  branchId bilan filtrlanadi (regressiya yo'q — bu metrikaning branch-scope'i o'zgarmaydi).

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `cli-431-retention-consistency.test.ts` (T1 branch-invariant) →
   hozirgi kod branchId bilan `returning` o'zgaradi → T1 qizil.
2. **Fix (`reports.service.ts:415-419`):** `apptRetFilter`dan
   `if (branchId) apptRetFilter.push(eq(appointments.branchId, branchId))` qatorini olib
   tashlash → retention tenant-wide.
3. **Izoh/DTO:** `reports.service.ts` retention bloki izohini yangilash (branchId ataylab
   e'tiborsiz — Qaror #29, planCompletion pretsedenti). `reports.schema.ts`
   `DentalAnalyticsReport`da `retention`/`recallEfficacy` uchun "tenant-wide" izohi,
   `procedureMix`/`noShowByWeekday` uchun "branch-scoped".
4. **Verify:** `cd apps/api && bun test --env-file=../../.env cli-431` + mavjud
   `cli-243-dental-analytics.test.ts` yashil. `bun run typecheck`.

---

## 5. Migratsiya / rollout / xavflar
- **Migratsiya YO'Q** — faqat so'rov filtri + izoh.
- **Backward-compat / xulq o'zgarishi:** branchId berilgan `dentalAnalytics`
  chaqiruvlarida `returningPatients` (va shuning uchun `retentionRate`) **o'zgaradi** —
  endi tenant-wide. Bu — kutilgan tuzatish (asimmetriyani yo'qotadi). Frontend'da
  retention kartasi branch filtri bilan ko'rsatilsa, UI matnini "klinika bo'yicha"
  (tenant-wide) deb aniqlashtirish tavsiya etiladi (ixtiyoriy, alohida frontend ticket —
  hozir scope emas).
- **RLS:** o'zgarmaydi — barchasi `getDb(c)` tenant-scoped.

## 6. Qabul mezonlari
- [ ] T1: 3 filialli tenantда retention raqamlari branchId'dan mustaqil (branch-invariant).
- [ ] T2: `newPatients`/`returningPatients`/`retentionRate` kutilgan tenant-wide qiymatlar.
- [ ] T3: recall-efficacy tenant-wide (branch-invariant) — retention bilan mos.
- [ ] T4: procedureMix/noShow branch-scope regressiyasi yo'q.
- [ ] Kod + DTO izohlari har sub-metrika scope'ini aniq belgilaydi.
- [ ] `cli-243-dental-analytics.test.ts` yashil; `typecheck` toza.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/reports/reports.service.ts` — `dentalAnalytics` retention filtri
  (415-419) + izohlar.
- `apps/api/src/modules/reports/reports.schema.ts` — `DentalAnalyticsReport` sub-metrika
  scope izohlari.
- `apps/api/tests/integration/cli-431-retention-consistency.test.ts` — yangi test.
