# Dizayn qarorlari

Loyiha bo'ylab muhim, kod izohidan uzunroq asoslashni talab qiladigan qarorlar.
(Audit-fix guruhining o'z qarorlar jadvali: `docs/audit-fixes/00-DESIGN-DECISIONS.md`.)

---

## Treatment-flow audit (2026-07-10, Lane 3 — CLI-481/487/488)

### CLI-481 — Visit re-point: BLOK (revert emas)

**Muammo:** Vizit yozuvi UPDATE'da yangi `stageId` berilsa, kod faqat YANGI bosqichni
`completed` qilardi (+ recall). Eski bosqich `completed` (terminal, revert yo'q) qolib,
endi hech bir vizit unga ishora qilmasdi (phantom-completed) va uning auto-recall'i
orphan bo'lardi — bitta re-point ikkita completed bosqich + ikkita recall yaratardi.

**Fork:** (A) eski bosqichni revert qilish + recall'ini dismiss qilish, YOKI
(B) re-point'ni bloklash.

**Qaror: (B) BLOK.** Vizit allaqachon bir bosqichni yopgan bo'lsa (`before.stageId`
non-null), uni boshqa bosqichga ko'chirish RAD (`VisitStageRepointError`). Sabab:
(A) `completed` terminal holatni revert qilishni (transition-matritsa buzilishi) +
recall dismiss metodini (recalls.service.ts o'zgarishi) talab qilardi; (B) minimal,
xavfsiz, eski bosqichni legitim `completed` holda qoldiradi va yangi/orphan yaratmaydi.
Bosqich holatini o'zgartirish kerak bo'lsa — to'g'ridan `/treatment-stages` orqali.
`VisitStageRepointError` — `InvalidTransitionError` subklassi (PlanLockedError
precedenti) → visit-notes/treatment-plans routes'dagi mavjud catch uni 400
(`stage.invalid_transition`) ga aylantiradi (route o'zgarishi shart emas).

### CLI-487 — Lab-order ↔ stage completion gate

**Qaror:** `treatment_stages`ga ixtiyoriy `lab_order_id` FK (onDelete: set null,
migration 0041). Bosqichni `completed` qilishda bog'langan lab-order `delivered`
bo'lishi shart — aks holda `StageLabPendingError` (InvalidTransitionError subklassi →
mavjud routes catch orqali 400).

- **Gate joyi:** `updateStage` ichida, plan-guard'dan KEYIN, `repo.updateStage`'dan
  OLDIN — noto'g'ri holatda `completed` PERSIST QILINMAYDI. Visit-note yo'li ham shu
  `updateStage`'ni chaqirgani uchun gate ikkala yo'lni ham qamraydi (routes'da
  qo'shimcha wiring shart emas).
- **Fail-safe:** `findLabOrderStatus` RLS-scoped — cross-tenant/uzilib qolgan link →
  `null` → BLOK (`labStatus='missing'`). Non-null link'ni bekor `completed`'ga
  o'tkazib yubormaydi.
- **Cross-domen o'qish:** `repo.findLabOrderStatus` (treatment-plans repository
  lab_orders jadvalini to'g'ridan o'qiydi) — `findConsentForm` precedenti (RFC-0009:
  repository boshqa domen jadvalini o'qishi taqiqlanmagan; DI hook faqat business
  orkestratsiya uchun).
- **Scope:** `lab_order_id` BACKEND-ONLY bu round'da — API request schema
  (`updateStageSchema`/create) da OCHILMAGAN. Sabab: ochilsa (a) api-client regen
  (backend-og'ir round scope'idan tashqari) va (b) settable cross-entity FK uchun
  ownership-validatsiya (`assertLabOrderBelongsToPatient` hali yo'q) talab qilinardi.
  Frontend/link-UI — alohida follow-up ticket. Test raw-tx seed bilan gate'ni tekshiradi.
- **RLS:** `treatment_stages`'da `tenant_id` yo'q (parent `treatment_plans` FK orqali
  scoped) → `check:rls` bu jadvalni qamramaydi; yangi ustun RLS-neytral.

### CLI-488 — Odontogram auto-update on stage completed

**Qaror:** `treatment_stages`ga ixtiyoriy `resulting_tooth_state` (tooth_state enum,
migration 0042). Bosqich `completed` bo'lganda `toothNumbers` + `resultingToothState`
bo'lsa, tooth-charts DI hook (`recordStageCompletion`) yangi odontogramma snapshot
yozadi.

- **Snapshot shakli (immutable-modeldan qasddan chetlashish):** Odontogramma normalda
  klinisyen tomonidan qo'lda yoziladi; bu yerda TIZIM bosqich yopilganda avtomatik
  yozadi — bu qasddan chetlashish. **Fork:** (i) to'liq carry-forward (eng so'nggi
  snapshotni ko'chirib, ta'sirlangan tishlarni overlay qilish) yoki (ii) faqat
  ta'sirlangan tishli qisman snapshot. **Qaror: (i) to'liq carry-forward** — sabab:
  `getLatest` "butun og'iz" semantikasini saqlaydi (qisman snapshot latest'ni chala
  qoldirardi). Ta'sirlangan tishlarning BARCHA oldingi surface-holatlari TASHLANADI
  (masalan eski `26 M=filling`) va bitta yangi `whole` holat bilan almashtiriladi —
  aks holda bir tishda qarama-qarshi surface-holatlar (crown + eski filling) birga
  turib qolardi (dedupe kaliti `tooth:surface` — turli surface birga yashardi).
- **Idempotentlik:** `updateStage` bosqichni faqat HAQIQIY `pending/in_progress→completed`
  o'tishda hook chaqiradi (allaqachon completed'ni qayta PATCH — bo'sh patch → erta
  qaytadi) → snapshot bir marta yoziladi. Alohida marker ustun shart emas.
- **DI wiring:** hook `clinical.routes.ts`da IKKALA `treatmentPlansService`
  instance'iga beriladi — (1) standalone (visit-note `completeStageForVisit` yo'li,
  ASOSIY klinik trigger) va (2) `treatmentPlansRoutes` ichidagi (`PATCH
  /treatment-stages` yo'li). Faqat bittasini ulash bir yo'lni jim qoldirardi (recall
  wiring bilan bir xil double-instance pattern).
- **Scope:** `resulting_tooth_state` BACKEND-ONLY bu round'da (API'da ochilmagan —
  frontend follow-up). Test raw-tx seed bilan snapshot yozilishini tekshiradi.
