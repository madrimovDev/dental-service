# CLI-446 (qism 3) — Finalizatsiyadan keyingi refund payroll'da hech qachon hisobga olinmaydi

Status: **SPEC-ONLY** — bu ticket'ning 1/2-qismlari (`computePayrollLine` floor + `PUT
/users/:id/profile` `payroll.manage` gate) kodlangan va commit qilingan. Ushbu 3-qism
FAQAT spec — kod yozilmagan, tasdiq kutilmoqda.

Bog'liq: `docs/audit-fixes/CLI-417-payroll-duplicate-overlap-run.md` (ustma-ust run guard —
bu spec o'sha guard bilan **birga ishlaganda** aniq muammoni keltirib chiqaradi, quyida).

---

## 1. Muammo va ildiz sabab

### 1a. Revenue query — refund tranzaksiyaning O'ZINING `createdAt`'iga bog'liq, asl to'lovnikiga emas

`apps/api/src/modules/payroll/payroll.service.ts:80-96` (`createRun`):

```ts
const revRows = await tx
  .select({
    doctorId: treatmentPlans.doctorId,
    revenue: sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund'
      THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`,
  })
  .from(cashierTransactions)
  .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
  .where(and(
    eq(cashierTransactions.status, 'completed'),
    gte(cashierTransactions.createdAt, start),
    lt(cashierTransactions.createdAt, end),
  ))
  .groupBy(treatmentPlans.doctorId);
```

Bu query **davr ichida yaratilgan har qanday** (to'lov YOKI refund) qatorni yig'adi —
refund qatorining o'zi qachon yaratilgan bo'lsa, shu qator SHU davrga tushadi. `cashier.service.ts::refund()`
(`apps/api/src/modules/cashier/cashier.service.ts:244-360`) asl to'lov qatorini **hech qachon
o'zgartirmaydi/void qilmaydi** (CLI-406 qarori — daromadni ikki marta ayirmaslik uchun
qasddan) — u faqat yangi `type='refund'` qator qo'shadi, `createdAt = now()`.

### 1b. Ustma-ust run guard (CLI-417) bilan birga — refund "yopiq" davrga tushsa, ABADIY yo'qoladi

CLI-417 (implemented) `payroll_runs`ga `EXCLUDE USING gist (tenant_id, daterange(period_from,
period_to, '[]'))` constraint qo'ydi — **bitta davrga ikkinchi run yaratib bo'lmaydi**
(qasddan, double-pay'ni oldini olish uchun). Bu ikkalasi birga quyidagi senariyni yaratadi:

1. Iyun run'i (01–30) yaratiladi va `finalizeRun` bilan yakunlanadi (20-iyun).
2. 25-iyunda bemor 5-iyundagi to'lovni **qisman refund** qiladi (`cashier.service.ts::refund()`).
   Yangi refund qatori: `createdAt = 25-iyun`, `treatmentPlanId` = o'sha reja (demak
   `doctorId` payroll uchun aniqlanadi).
3. Bu refund **hech qachon hech qanday `createRun` chaqiruviga kirmaydi**:
   - Iyun uchun **yangi run yaratib bo'lmaydi** — CLI-417 EXCLUDE constraint kesishuvchi
     davrni rad etadi (`overlap`, 409).
   - Iyul (yoki keyingi har qanday) run'i `WHERE createdAt >= iyulStart AND < iyulEnd`
     bilan so'raydi — 25-iyundagi refund qatori bu oraliqqa **kirmaydi** (uning `createdAt`
     iyun ichida, iyulda emas).
4. Natija: doktor iyun uchun to'liq (asl, refund-oldi) daromaddan hisoblangan komissiyani
   olib bo'ladi, lekin refund summasi **hech qanday keyingi payroll hisobida** kamaytirilmaydi
   — klinika buni yo'qotadi, va tizimda buning izi ham yo'q (payroll_lines ham,
   audit_log ham "bu refund payrollga ta'sir qildi/qilmadi"ni ko'rsatmaydi).

**Muhim farq — "yopiq bo'lmagan" davrdagi refund BUG EMAS:** agar refund o'sha ochiq
(hali finalize qilinmagan yoki hali run yaratilmagan) davr ichida bo'lsa, keyingi
`createRun` uni to'g'ri qamrab oladi (signed SUM); Task 1 (`computePayrollLine` floor)
faqat shu holatda natija manfiy chiqib ketmasligini kafolatlaydi. **Bu spec faqat
"davr allaqachon finalized" holatiga tegishli.**

### 1c. Nega bu jiddiy
- Klinika real pulni yo'qotadi (doktorga ortiqcha to'langan komissiya qaytarilmaydi).
- Hech qanday signal yo'q — accountant buni faqat qo'lda (cashier refund ro'yxatini
  payroll bilan taqqoslab) payqashi mumkin.
- CLI-417 (overlap guard, allaqachon implement qilingan) muammoni **yashirin holatdan
  strukturaviy holatga** o'tkazdi — avval hech bo'lmasa (nazariy jihatdan) yopiq davrga
  ikkinchi run yaratib refundni "ushlab olish" mumkin edi (garchi ikki marta baza maosh
  to'lashga olib kelgan bo'lsa ham); endi bu yo'l ham yopiq.

---

## 2. Dizayn variantlari (tarafkashlik bilan)

### Variant A — Adjustment-line: keyingi run'ga "carry-forward" tuzatish (★ TAVSIYA ETILADI)

**G'oya:** `cashier.service.ts::refund()` ichida (yoki alohida reconciliation service'da)
refund yaratilganda tekshiriladi: asl tranzaksiyaning `createdAt`'i tenant uchun
**`finalized`** biror `payroll_runs` davriga tushadimi (`daterange` overlap query,
CLI-417'dagi bilan bir xil texnika). Tushsa — yangi `payroll_adjustments` jadvaliga
bitta qator yoziladi: `{ tenantId, doctorId, sourceRunId, refundTransactionId, amount
(manfiy), consumedInRunId: null }`. `payroll.service.ts::createRun` **har safar** (davridan
qat'i nazar) shu doktor uchun `consumedInRunId IS NULL` bo'lgan adjustment'larni ham
yig'ib, `computePayrollLine`ga uzatiladigan `attributedRevenue`ga qo'shadi (yoki alohida
`adjustmentAmount` ustuni sifatida `payroll_lines`da saqlanadi — shaffoflik uchun
ma'qulroq), so'ng ularni `consumedInRunId = <yangi run>` bilan belgilaydi (bir marta
sarflanadi).

**Nega tavsiya etiladi:**
- Qaror #16 (payroll snapshot falsafasi)ni **buzmaydi** — finalized run o'zgarmas qoladi;
  tuzatish FAQAT kelgusi run'ga qo'shiladi (M4b'dagi "davrda daromadli-lekin-inactive"
  yechimi bilan bir xil falsafa — eligibility/hisobga kengaytma, tarixni o'zgartirish emas).
- To'liq audit iz: `payroll_adjustments.sourceRunId`/`refundTransactionId` — "nega bu
  oyning komissiyasi kam" degan savolga aniq javob.
- Doktor hali ham tenant'da faol bo'lsa (odatiy holat) — tabiiy ravishda keyingi
  paycheck'da qoplanadi, alohida to'lov/hisob-kitob operatsiyasi shart emas.

**Kamchilik / ochiq savollar:**
- Yangi jadval + migration + `createRun`ga qo'shimcha query (ozgina murakkablik oshadi).
- Doktor **keyingi run'gacha** tenantdan butunlay chiqib ketsa (`user_assignments`
  bekor qilinsa) — adjustment "egasiz" qoladi (hech qachon consumed bo'lmaydi).
  M4b'dagi "inactive-lekin-daromadli" eligibility kengaytmasi bu holatni **qisman**
  yopadi (agar keyingi run yaratilganda ham adjustment mavjud bo'lsa, va `earningIds`
  logikasi profilni topa olsa) — lekin bu edge-case alohida test talab qiladi.
- UI (`PayrollScreen.tsx`, `StaffProfileModal.tsx` emas) qatorni "asosiy komissiya" +
  "tuzatish" deb ajratib ko'rsatishi kerak — aks holda accountant uchun raqam
  tushunarsiz bo'lib qoladi.

### Variant B — Finalized run'ni "reopened" holatiga qaytarish + qayta hisoblash

**G'oya:** `payrollRunStatusEnum`ga `'reopened'` qo'shiladi. Refund asl tranzaksiyaning
davri finalized run'ga tushsa — o'sha run avtomatik (yoki accountant tasdig'i bilan)
`reopened`ga o'tadi; `payroll.manage` egasi keyin uni qayta hisoblab (`payroll_lines`
qayta generatsiya, eski qatorlar tarix sifatida saqlanadi — V2-7 medical-record
versioning'dagi audit-log-backed diff patterniga o'xshash) yana finalize qiladi.

**Nega tavsiya ETILMAYDI (birinchi o'ringa):**
- Qaror #16'ni **to'g'ridan-to'g'ri buzadi** — "finalized = muzlatilgan" invariantini
  yo'qotadi. Payroll — moliyaviy hisobot; "yopiq oy qayta ochilishi" buxgalteriya
  nuqtai nazaridan og'ir operatsiya (real hayotda bu oyning maoshi allaqachon
  to'langan bo'lishi mumkin — reopened run yangi (kichikroq) `total` chiqarsa, "ortiqcha
  to'langan qism"ni **baribir** kimdir kelgusi oyda ushlab qolishi kerak — bu aslida
  Variant A'ning mexanizmiga qaytadi, faqat qo'shimcha "reopen" bosqichi bilan).
- Katta blast radius: yangi status + UI (reopened run qanday ko'rinadi, kim tasdiqlaydi)
  + eski `payroll_lines` tarixini saqlash strategiyasi (yangi jadval yoki versioned
  ustunlar) — CLI-446'ning ikkinchi va uchinchi qismlaridan ancha kattaroq scope.
- CLI-417 EXCLUDE constraint bilan zid emas (reopen alohida yo'l), lekin ikkalasi
  birga davr-immutability haqidagi mental modelni murakkablashtiradi.

### Variant C — Faqat signal/disclosure, hisob-kitob tuzatilmaydi (eng arzon, won't-fix'ga yaqin)

**G'oya:** Hech qanday reconciliation mexanizmi qo'shilmaydi. `cashier.service.ts::refund()`
faqat asl tranzaksiya davri finalized run'ga tushishini tekshiradi va javobga/audit_log'ga
`payrollImpactWarning: true` (yoki shunga o'xshash) belgi qo'shadi — accountant buni
UI'da ko'rib, **tizimdan tashqarida** (qo'lda, keyingi oy maoshidan ayirib) tuzatadi.

**Nega tavsiya etilmaydi (asosiy yechim sifatida), lekin interim sifatida qabul qilinishi mumkin:**
- Eng kam kod/migratsiya — bitta flag + audit yozuvi.
- **Muammoni yechmaydi** — faqat ko'rinadigan qiladi. Ticket nomi ("hech qachon hisobga
  olinmaydi") aynan shu holatni tanqid qilyapti; Variant C shu holatni **rasman
  qonuniylashtiradi** ("ha, hisobga olinmaydi, lekin endi buni bilasiz").
- Amalda accountant qo'lda Excel/hisobda yuritishi kerak bo'ladi — xatoga moyil,
  audit-log yozuvi bo'lsa-da tizim ichida qoplanmaydi.

### Tavsiya
**Variant A** (adjustment-line, keyingi run'ga carry-forward). Variant C (signal-only)
— agar Variant A'ning scope'i joriy sprint uchun katta bo'lib chiqsa, **vaqtinchalik
oraliq qadam** sifatida qabul qilinishi mumkin (keyin Variant A bilan almashtirilishi
sharti bilan, alohida ticket'da hujjatlashtirilib). Variant B rad etiladi — Qaror #16
bilan zid va scope juda katta.

---

## 3. Spec — xulq (Variant A tanlansa)

### Yangi jadval: `payroll_adjustments`
```
id            uuid PK
tenant_id     uuid NOT NULL FK tenants (RLS: FORCE RLS, boshqa payroll jadvallar bilan bir xil)
doctor_id     uuid NOT NULL FK users
source_run_id uuid NOT NULL FK payroll_runs   -- qaysi finalized run'ning daromadi tuzatilyapti
refund_transaction_id uuid NOT NULL FK cashier_transactions
amount        numeric(14,2) NOT NULL          -- manfiy (kamaytiruvchi)
consumed_in_run_id uuid NULL FK payroll_runs  -- qaysi run'da "sarflandi"
created_at    timestamptz NOT NULL default now()
```
Indeks: `(tenant_id, doctor_id, consumed_in_run_id)` — `createRun`ning "shu doktor uchun
sarflanmagan adjustment'lar" so'rovi uchun.

### Xulq
1. `cashier.service.ts::refund()` — muvaffaqiyatli refund'dan keyin (bir tranzaksiyada):
   asl tranzaksiya `createdAt`'i bilan kesishuvchi `finalized` `payroll_runs` bormi
   tekshiriladi (`daterange` overlap, CLI-417 texnikasi bilan bir xil); topilsa va
   `treatmentPlanId` mavjud bo'lsa (payroll faqat plan-linked daromadni hisoblaydi) —
   `payroll_adjustments` qatori yoziladi (`doctorId` = `treatmentPlans.doctorId`).
2. `payroll.service.ts::createRun` — eligible profillar ro'yxatini hisoblashdan OLDIN,
   har doktor uchun `consumedInRunId IS NULL` adjustment'lar yig'iladi (`SUM(amount)`),
   `attributedRevenue`ga qo'shiladi (Task 1'dagi floor bilan bir xil, endi ikki manba —
   davr ichi signed revenue + carry-forward adjustment — birlashadi). Yangi run
   yaratilgach, ishlatilgan adjustment qatorlari `consumedInRunId = run.id` bilan
   yangilanadi (bitta transaksiya ichida — draft insert bilan bir xil tx).
3. `payroll_lines` javobida (`payroll.mapper.ts`/`payroll.schema.ts`) adjustment qismi
   alohida ko'rinishi kerak (masalan `carriedAdjustment: string` ustuni) — shaffoflik.

### Edge case'lar
- Adjustment doktor keyingi run yaratilguncha `inactive` bo'lib qolsa — M4b
  "inactive-lekin-daromadli" eligibility kengaytmasi + adjustment kengaytmasi
  BIRGALIKDA doktorni ro'yxatga kiritishi kerak (revenue=0 bo'lsa ham, faqat
  adjustment bo'lsa ham).
- Bir doktor uchun bir nechta adjustment (bir nechta refund) — barchasi bitta
  `createRun`da yig'ilib sarflanadi.
- Adjustment miqdori navbatdagi run'ning o'z daromadidan katta bo'lsa — Task 1 floor
  qoidasi ishlaydi (0'dan past emas); qoplanmagan qoldiq **keyingi-keyingi** run'ga
  qoladimi yoki abadiy yo'qoladimi — **OCHIQ QAROR** (tavsiya: qoladi, ya'ni faqat
  "ishlatilgan" qismi consumed deb belgilanadi, qolgan qismi yangi adjustment
  qatoriga bo'linadi — lekin bu qo'shimcha murakkablik, foydalanuvchi bilan
  tasdiqlanishi kerak).
- Non-plan-linked refund — hozir ham `cashier.service.ts::refund()` bunday holatda
  qisman refundni rad etadi (`non_plan_partial`); TO'LIQ non-plan refund payroll'ga
  umuman ta'sir qilmaydi (`treatmentPlanId` yo'q → `doctorId` aniqlanmaydi) — bu
  mavjud cheklov, spec doirasidan tashqarida.

---

## 4. Implementatsiya rejasi — **BAJARILMAGAN, faqat yo'nalish (keyingi ticket uchun)**

> Ushbu bo'lim FAQAT tasdiqlangandan keyingi ishni rejalashtirish uchun — hozir
> KODLANMAYDI.

1. Migration: `payroll_adjustments` jadvali + RLS (`FORCE ROW LEVEL SECURITY`,
   boshqa payroll jadvallar bilan bir xil policy shakli) + `check-rls-coverage`.
2. `cashier.service.ts::refund()` — finalized-run-overlap tekshiruvi + adjustment insert
   (bitta tranzaksiya ichida, TDD: failing test — finalized davrdagi tx refund qilinsa
   `payroll_adjustments` qatori paydo bo'ladi).
3. `payroll.service.ts::createRun` — adjustment consumption (TDD: failing test — oldingi
   adjustment keyingi run'da `attributedRevenue`ga qo'shiladi va `consumedInRunId`
   belgilanadi; ikkinchi run uni qayta ishlatmaydi).
4. `payroll.schema.ts`/`payroll.mapper.ts` — `carriedAdjustment` javobga qo'shiladi.
5. Frontend: `PayrollScreen.tsx` — qator breakdown (asosiy komissiya vs tuzatish).
6. `bun run typecheck` + `bun run check:rls` + mavjud `payroll.test.ts`/`cli-417-*`
   regressiyasiz.

---

## 5. Ta'sirlanadigan fayllar (Variant A tanlansa)
- `packages/db-schema/src/tables/payroll-adjustments.ts` — yangi jadval.
- `apps/api/drizzle/00XX_payroll_adjustments.sql` — migration + RLS policy.
- `apps/api/src/modules/cashier/cashier.service.ts` — `refund()` ichida adjustment yozish.
- `apps/api/src/modules/payroll/payroll.service.ts` — `createRun` adjustment consumption.
- `apps/api/src/modules/payroll/payroll.schema.ts` / `payroll.mapper.ts` — javob shakli.
- `apps/web/src/features/payroll/components/PayrollScreen.tsx` — breakdown ko'rinishi.
- Yangi test: `apps/api/tests/integration/cli-446-payroll-refund-reconciliation.test.ts`.

## 6. Ochiq qarorlar (foydalanuvchi tasdig'i kerak)
1. **Variant tanlovi** — A (tavsiya) / B / C / boshqa.
2. Agar A — adjustment doktorning navbatdagi RUN'ida ishlatiladimi, yoki alohida
   "reconciliation" ekran/amal orqali qo'lda tasdiqlanadimi (avtomatik vs manual-trigger)?
3. Qoplanmagan qoldiq (adjustment > keyingi run revenue) — keyingi-keyingi run'ga
   ko'chadimi yoki bir martalik urinishdan keyin yo'qoladimi?
4. Doktor tenant'dan butunlay chiqib ketgan va hech qachon qaytmasa — egasiz
   adjustment bilan nima qilinadi (hisobotda "yo'qotilgan komissiya tuzatish" deb
   ko'rsatiladimi)?
