# CLI-436 — Plan-estimate keshи stage/plan-status mutatsiyасидан invalidate bo'lmaydi (stale pul 30s)

> Audit: MEDIUM M23. Plan accept qilib Estimate ochsa noto'g'ri balans (staleTime 30s).

## Bog'liq ticketlar

- **CLI-415** — plan/stage status mutatsiyа guard'lari (backend). Bu ticket faqat frontend kesh
  invalidatsiyаsи; 415 backend xulqини o'zgартиради, lekin invalidatsiya alohида (mustaqil merge).

## 1. Muammo va ildiz sabab

`clinical.api.ts`da smeta (estimate) keshи `clinicalKeys.planEstimate(planId)` (`clinical.keys.ts:18`)
kalitи bilan yashaydi. Ba'zi mutatsiyaлар uni invalidate qiladi, ba'zилари **YO'Q**:

- `useUpdateStage` (`clinical.api.ts:161-168`) — faqat `invalidatePlanFinancials(qc, patientId)`
  (`246-250`) chaqiради: `plans(patientId)` + `patient balance` + `cashier.all`. **`planEstimate`ни
  qamrамайди.**
- `useUpdatePlanStatus` (`clinical.api.ts:223-230`) — xuddi shunday, `planEstimate` invalidate
  qilинмайди.

**Precedent (allaqачон to'g'ri):** `useUpdateStageAcceptance` (`clinical.api.ts:184-194`) 191-qаторда
`qc.invalidateQueries({ queryKey: clinicalKeys.planEstimate(stage.treatmentPlanId) })` qiladi, va
`useAcceptAllStages` (`201-220`) 217-qатор ham. Ya'ni pattern mavjud — faqat ikки hook'ga
kengaytirилмаган. Natijaда bosqichни `completed` qiliб yoки planни `accepted` qиlиб Estimate
ochса, 30s davomида eski balans/paid ko'rinади.

**Recall bog'lиqлиги:** bosqich `completed` bo'lганда backend recall yaratади (CLI-415'дан keyin
faqat aktив planда). Shu sabab `useUpdateStage.onSuccess`да recall ro'yxатини ham invalidate qilиш
kerak — `recallKeys.patient(patientId)` mavjud (`apps/web/src/features/recalls/recalls.keys.ts`, tasdiqlangan).

## 2. Dizayn qарори

**Aniq yechim (tanlangan) — mavjud precedent'ни ikки hook'ga kengaytириш:**

- `useUpdateStage`: `mutationFn` `updateTreatmentStage(id,...).then(r=>r.data)` **stage**'ни
  qaytаради (`treatmentPlanId` bilan). `onSuccess: (stage) => { invalidatePlanFinancials(qc, patientId);
  qc.invalidateQueries({ queryKey: clinicalKeys.planEstimate(stage.treatmentPlanId) });
  qc.invalidateQueries({ queryKey: recallKeys.patient(patientId) }); }` — xuddi
  `useUpdateStageAcceptance` (191-qатор) kabi.
- `useUpdatePlanStatus`: `mutationFn` argumenti `{id, status}` — `id` = **planId**. `onSuccess`да
  `id`ни capture qilиб `clinicalKeys.planEstimate(id)`ни invalidate qil.

**Rad etilган alternativалар:**

- *`invalidatePlanFinancials`гa `planEstimate`ни qo'shиш* — lekin bu helper faqat `patientId` oladi,
  planId'ни bilmayди (bir bemорда ko'п plan). **Rad:** har hook o'з planId'ини (stage javобидан yoki
  argumentдан) beради.
- *Butun `clinicalKeys.all`ни invalidate* — ortiqча refetch (barcha bemор plan/lab/vizit). **Rad:** tор invalidatsiyа.

## 3. Spec — xulq

- Bosqich status o'zgарса (`useUpdateStage`) → `planEstimate(stage.treatmentPlanId)` + recall(patient) refetch.
- Plan status o'zгарса (`useUpdatePlanStatus`) → `planEstimate(id)` refetch.
- Mavjud `invalidatePlanFinancials` (plans + balance + cashier) saqlanadi.

**Chekка holatlar:**

- `mutationFn` xato → `onSuccess` chaqирилмайди (invalidatsiyа yo'q) — to'g'ri.
- Recall faqat `completed` da yaratилса ham, `recallKeys.patient` invalidatsiyаsи zararsiz (arzon refetch).

## 4. Implementatsiya rejasи (TDD — vitest)

1. **Failing test** — `clinical.api.test.ts` (yoki hook test)да: `useUpdateStage` muvaffaqиятли
   mutatsiyадан keyin `queryClient` `planEstimate(planId)` kalitини stale/invalidated qilганини
   assert qil (spy `invalidateQueries` yoки refetch tekshиruvи). Hozир qizил. `useUpdatePlanStatus`
   uchun ham shunga o'xшаш.
2. **Impl:**
   - `clinical.api.ts:161-168` `useUpdateStage.onSuccess` — `planEstimate(stage.treatmentPlanId)` +
     `recallKeys.patient(patientId)` qo'sh (`recallKeys` import).
   - `clinical.api.ts:223-230` `useUpdatePlanStatus.onSuccess` — `id`ни capture, `planEstimate(id)` qo'sh.
3. **Verify:** `vitest` (clinical) yashил; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya YO'Q** — sof frontend kesh xulqи.
- **Xavf:** minimal — qo'shимча tор refetch. `recallKeys` import feature'lar orasида (clinical →
  recalls keys) — bir yo'нали referens, sikл yo'q (keys sof konstanta).
- **Rollout:** feature-branch, TDD (vitest), lokal verify, main merge.

## 6. Qabul mezonlari

- [ ] Plan accept (`useUpdatePlanStatus`) → estimate refetch (yangi balans).
- [ ] Bosqich completed (`useUpdateStage`) → estimate + recall refetch.
- [ ] Mavjud invalidatsiyалар (plans/balance/cashier) saqlanган.
- [ ] `vitest` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/web/src/features/clinical/clinical.api.ts:161-168` (`useUpdateStage`)
- `apps/web/src/features/clinical/clinical.api.ts:223-230` (`useUpdatePlanStatus`)
- (import) `apps/web/src/features/recalls/recalls.keys.ts` (`recallKeys.patient`)
- Testlar: `clinical.api` hook testи (web, vitest)
