# CLI-440 — LOW-C: Kassa / pul hardening

> Manba: `AUDIT-2026-07-06.md` §LOW. 4 sub-item. Har biri mustaqil, kichik.
> Umumiy tamoyil: RLS `getDb(c)` tx-bound, audit `deps.audit.record`, pul `formatCurrency` (lib/format.ts), query invalidatsiya feature-hook ichida.

---

## 1. Refund modal cap `paidAmount`da — `remaining`da emas + eskirgan patient-balance kesh

**Muammo**
- FE: `apps/web/src/features/cashier/components/TransactionsTable.tsx:159-169` — qisman refund `NumberInput` cap `max={selected.paidAmount}`. Backend esa `remaining = paidAmount − alreadyRefunded` bo'yicha cheklaydi (`cashier.service.ts:268`, `refund()`). Ketma-ket qisman refundda foydalanuvchi qolgan summadan ko'p kiritib, keraksiz `over_refund` (422) xatosiga uriladi.
- `TransactionVM` (`cashier.types.ts:16-29`) refund qilingan/qolgan summani **umuman eksport qilmaydi** — faqat `paidAmount` + `refundable: boolean`. Ya'ni FE-da to'g'ri cap hisoblab bo'lmaydi.
- Kesh: `useRefund` va `useCreateTransaction` (`cashier.api.ts:91-116`) faqat `cashierKeys.all` + `cashierKeys.plans`ni invalidate qiladi. To'lov/refund bemor balansini o'zgartiradi, lekin `patientKeys` (`['patients']`, `patients.keys.ts`) invalidate qilinmaydi → bemor ro'yxati/detali balansi eskirib qoladi.

**Fix yondashuvi**
- BE: transaction DTO'ga `refundedAmount` (yoki tayyor `refundableRemaining`) maydonini qo'shish (`cashier.schema.ts` + `cashier.mapper.ts`) — parent tranzaksiya bo'yicha `SUM(refund.paidAmount)`. `refund()`dagi 268-qatordagi hisob bilan bir xil manba.
- FE: `TransactionVM`ga shu maydonni o'tkazib, `max={selected.paidAmount - selected.refundedAmount}` qilish.
- FE: `useRefund` va `useCreateTransaction` `onSuccess`ga `qc.invalidateQueries({ queryKey: patientKeys.all })` qo'shish (yoki tor: `patientKeys.balance(id)` + `patientKeys.list`). `patientKeys`ni `cashier.api.ts`ga import qilish.

**Qabul**
- Ketma-ket qisman refundda modal cap doim qolgan refund-qilinadigan summaga teng; backend `over_refund` FE-caps orqali oldi olinadi.
- Refund/to'lovdan keyin bemor ro'yxati va detali balansi qayta so'rov (refetch) qilinadi.

---

## 2. "Bugun" UTC'da hisoblanadi — Asia/Tashkent'da emas

**Muammo**
- FE `todayISO = () => new Date().toISOString().slice(0, 10)` (`cashier.api.ts:19`) va BE default `date ?? new Date().toISOString().slice(0, 10)` (`cashier.routes.ts:186`) UTC kalendar sanasini beradi. Backend kun chegarasini `+05:00`da quradi (`cashier.service.ts:43-53` list, `354-358` `dailySummary()`). Tashkent 00:00–05:00 oralig'ida UTC hali kechagi kun → "bugungi operatsiyalar" va kunlik yakun noto'g'ri kunni ko'rsatadi.
- Qo'shimcha: `useTodayTransactions` (`cashier.api.ts:21-35`) `pageSize: 100` — kuniga 100+ tranzaksiyali filialda ro'yxat kesiladi.

**Fix yondashuvi**
- Asia/Tashkent sanasini beradigan yagona helper: `now`ga +5s siljitib slice qilish (`new Date(Date.now() + 5*3600*1000).toISOString().slice(0,10)`) yoki `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' })`. FE `todayISO` va BE `cashier.routes.ts:186` defaultini shunga o'tkazish (ya'ni sana-string ham +05:00 chegarasi bilan izchil bo'lsin).
- `useTodayTransactions` uchun pageSize'ni oshirish yoki pagination (kam churn variant: `pageSize` ni katta qat'iy songa yoki server-side "bugungi to'liq" endpointga).

**Qabul**
- Tashkent 00:00–05:00 oralig'ida ochilgan kassa "bugun"ni to'g'ri (mahalliy) kunni ko'rsatadi; `daily-summary` bilan izchil.
- 100+ tranzaksiyali kunda bugungi ro'yxat kesilmaydi.

---

## 3. Plan-linked to'lovda ortiqcha summa (`paidAmount > Σallocations`) hech qayerda hisoblanmaydi

**Muammo**
- `cashier.service.ts:112-121` (`create()`): plan-billing'da (`items` bo'sh) `netTotal = paidAmount` va guard faqat `allocSum > paidAmount`ni RAD qiladi. `allocSum < paidAmount` (ya'ni ortiqcha to'lov) ruxsat etiladi, lekin bosqichlarga taqsimlanmaydi.
- Bemor balansi (`patients.service.ts:137-151`, non-plan qoldiq) faqat `treatmentPlanId IS NULL` tranzaksiyalarni hisoblaydi (148-qator). Plan-linked tranzaksiyada ortiqcha `paidAmount − Σallocations` na plan balansiga (allocation yo'q), na non-plan qoldiqqa (plan-linked) kiradi → pul "yo'qoladi".

**Fix yondashuvi**
- `create()`da plan-linked tranzaksiyada `Σallocations !== paidAmount` bo'lsa: eng sodda — request'da `allocSum === paidAmount` ni majburlash (ortiqcha to'lovni RAD, `AllocationExceedError`ga o'xshash `AllocationMismatchError`). Yoki ortiqchani ataylab bemor kreditiga yo'naltirish qarori hujjatlashtirilsin va balans hisobiga plan-linked ortiqchani ham qo'shish (`patients.service.ts` non-plan query'ni kengaytirish).
- Qaror bitta bo'lishi kerak (RAD yoki kredit); advisor/Qaror #24 chizig'iga mos ravishda tanlanadi.

**Qabul**
- Plan-linked to'lovda `Σallocations !== paidAmount` holati aniq xulqqa ega (RAD yoki balansda ko'rinadigan kredit) — pul hech qayerda yo'qolmaydi.
- Yechim uchun unit test (allocation < paidAmount).

---

## 4. Allocation'lar tranzaksiya plan/bemor/status'iga qarshi validatsiya qilinmaydi

**Muammo**
- `cashier.service.ts:166-193` (`create()`): allocation'lar faqat `stage.cost` overpay guard'idan o'tadi (167-183). Lekin `a.stageId`ning bosqichi shu tranzaksiya `treatmentPlanId`iga / `patientId`iga tegishli ekani va plan holati to'lovga ochiqligi (masalan `cancelled` emas) tekshirilmaydi. Boshqa bemorning/rejaning bosqichiga to'lov biriktirish mumkin (RLS faqat tenantni cheklaydi).

**Fix yondashuvi**
- Overpay guard sikliga (168-183) qo'shimcha tekshiruv: `treatmentStages`→`treatmentPlans` join orqali `plan.id === input.treatmentPlanId` (yoki `plan.patientId === input.patientId`) va `plan.status` to'lovga ruxsat berilgan holatda ekanini tasdiqlash; aks holda RAD.
- **Eslatma:** CLI-421 / CLI-413 bilan qisman ustma-ust — o'sha ticketlardagi plan/stage state-machine guard'lari bu tekshiruvni qamrab olishi mumkin. Bu yerda faqat "allocation ↔ tx plan/patient/status muvofiqligi"ga fokus; state-machine tafsiloti CLI-421/CLI-413'ga qoldiriladi.

**Qabul**
- Boshqa reja/bemor bosqichiga allocation biriktirish RAD qilinadi.
- Yopiq/bekor plan bosqichiga to'lov RAD qilinadi (yoki CLI-421/413 guard'iga havola bilan qoldiriladi).
