# CLI-414 — Visit-note UPDATE ombor chiqimini yangilamaydi; BOM/C5 UI'dan yetib bo'lmaydi

> Audit: MEDIUM M1 + M1b. Qaror #15 (BOM auto-deduction) UI'dan jonli hech qachon ishlamaydi.

## Bog'liq ticketlar

- **CLI-415** — bu ticket UI'ga `stageId` dropdown qo'shadi; `stageId` berilganda
  visit-notes service `completeStageForVisit` → `updateStage(status:'completed')` chaqiradi.
  CLI-415 o'sha `updateStage`'ga plan-status guard qo'shadi. **Yagona siyosat:** faqat
  plan `accepted`/`in_progress` bo'lgan bosqichlar UI'da stage-linking uchun taklif qilinadi
  (draft/presented/cancelled/completed plan bosqichlari ro'yxatdan chiqariladi). Ikki ticket
  ham shu bitta siyosatga havola qiladi. UI 400 (`stage.invalid_transition`) kelsa toast bilan
  ko'rsatadi.
- **CLI-421** — visit-note create/update'da cross-entity ownership tekshiruvi (stageId/appointmentId
  bemorga tegishlimi). Tartib: **shakl-validatsiya (schema) → ownership (421) → stock reconcile (414)**.

---

## 1. Muammo va ildiz sabab

**Backend (a).** `visit-notes.service.ts:45-82` (create) da `performedServices` bo'yicha
`deps.deductStock?.(c, input.performedServices ?? [], note.id)` chaqiriladi (73-qator). Lekin
`update` (`visit-notes.service.ts:84-116`) da `patch.performedServices` yoziladi (102-qator),
**hech qanday stock reconciliation yo'q**. Xizmatsiz saqlab, keyin tahrirda xizmat qo'shsa —
material hech qachon ayrilmaydi; xizmatni olib tashlasa — ayrilgan material qaytmaydi.

**Backend duplikat bug.** `stock.service.ts:291-334` `deductForServices` `inArray(serviceMaterials.serviceId, serviceIds)` (297-300) bilan BOM'larni oladi — bu **takror serviceId'larni bitta qatorga yig'adi**. `performedServices=[X,X]` (bir vizitda X ikki marta) berilsa, BOM faqat **bir marta** ayriladi. Deduction har *takrorlanish* (occurrence) bo'yicha bo'lishi kerak.

**Frontend (b).** `VisitNoteFormModal.tsx:31-77` faqat SOAP + `appointmentId` yuboradi. Form
`visitNoteFormSchema` (`clinical.schema.ts:30-38`) da `performedServices` ham, `stageId` ham **YO'Q**.
Natijada BOM auto-deduction (Qaror #15) va C5 (visit→stage completion, `visit-notes.service.ts:52-54,89-91`) — **o'lik kod**: jonli hech qachon triggerlanmaydi.

## 2. Dizayn qarori

**Aniq yechim (tanlangan):**

- **Reconciliation = multiset diff.** `update`da `input.performedServices` berilganda,
  saqlangan `before.performedServices` (multiset) va yangi qiymat (multiset) o'rtasidagi farqni
  hisoblab, har xizmat uchun `delta = after.count − before.count`:
  - `delta > 0` → BOM'ni `delta` marta **ayirish** (`out` movement).
  - `delta < 0` → BOM'ni `|delta|` marta **qaytarish** (`in` movement, `reason:'visit_edit_return'`).
- **Idempotentlik ankasi:** diff *saqlangan* qiymatga nisbatan hisoblanadi → bir xil PATCH'ni
  qayta yuborish bo'sh diffga aylanadi (nol movement). `undefined` (maydon yuborilmagan) →
  **stockка tegilmaydi**; `[]` (bo'shatish) → hammasini qaytarish. Bu `undefined` vs `[]` farqi
  saqlanadi.
- **Duplikat fix (create + update ikkalasida):** BOM'lar `inArray` bilan *distinct* serviceId
  bo'yicha olinadi, so'ng movement har *occurrence* bo'yicha yoziladi (count-map bilan
  ko'paytirib). Yangi umumiy stock funksiyasi `reconcileForServices(c, before[], after[], visitNoteId)`
  ni `stock.service.ts`'ga qo'shamiz; `deductForServices` shuni `before=[]` bilan chaqiradigan
  yupqa wrapper bo'ladi (yoki create ham reconcile'ni ishlatadi — quyida).
- **Frontend:** `VisitNoteFormModal`'ga `useServiceCatalog()` (`clinical.api.ts:142`) bilan
  `performedServices` MultiSelect + ixtiyoriy `stageId` Select qo'shamiz. Form schema kengaytiriladi.

**Rad etilgan alternativalar:**

- *Ledger'dan (sourceVisitNoteId bo'yicha) reconcile qilish* — o'sha vizit uchun tarixiy
  `out` movement'lardan aniq qaytarish. Robustроq (BOM create'dan keyin o'zgargan bo'lsa ham to'g'ri),
  lekin ancha og'ir (movement agregatsiyasi + item-level guruhlash). **Rad:** yengil multiset-diff
  yetarli; BOM o'zgarish nozik holati (quyida §5 xavf) hujjatlashtiriladi.
- *Update'da avval hamma eski `out`ni bekor qilib, yangidan to'liq ayirish* — ikki barobar
  movement yozadi, ledger shovqinini oshiradi. **Rad:** delta yondashuvi minimal.

## 3. Spec — xulq + chekka holatlar

**Reconciliation semantikasi (`reconcileForServices`):**

| before | after (input) | Xulq |
|---|---|---|
| `[]` | `[X]` | X BOM 1× ayiriladi (`out`, `visit_auto`) |
| `[X]` | `[X,Y]` | Y BOM 1× ayiriladi; X tegilmaydi |
| `[X,Y]` | `[X]` | Y BOM 1× qaytariladi (`in`, `visit_edit_return`) |
| `[X]` | `[X]` (bir xil PATCH) | nol movement |
| `[X,X]` | `[X,X,X]` | X BOM **1×** ayiriladi (delta=+1) |
| `[X]` | `[]` | X BOM qaytariladi |
| `[X]` | `undefined` (maydon yo'q) | stockга tegilmaydi |
| BOM'siz xizmat | — | skip (movement yo'q) |

**Chekka holatlar:**

- Manfiy stock: auto-deduction'da negative-guard YO'Q (`stock.service.ts:312` izohi) — saqlanadi;
  qaytarishда item quantity oshadi → low-stock alert triggerlanmaydi (yuqoriga transition).
- `deductForServices` create yo'lida ham duplikat occurrence to'g'ri ayirishi kerak (bug fix).
- Reconcile shu request-tx ichida (RLS tx-bound, `getDb(c)`).

**Frontend xulq:**

- `performedServices` MultiSelect — `useServiceCatalog()` opsiyalari (nomi tilга qarab).
- `stageId` Select — ixtiyoriy; faqat **plan `accepted`/`in_progress`** bo'lgan bosqichlar
  ko'rsatiladi (CLI-415 siyosati). Bo'sh bo'lishi mumkin.
- Submit `performedServices` va `stageId`'ni body'ga qo'shadi (bo'sh bo'lsa `undefined`).
- Modal `create` ham `update`(mavjud bo'lsa) uchun ishlatiladi — hozircha faqat create.

**Test caselar (bun test — API):**

1. Create `performedServices:[X]` (X'da BOM bor) → item quantity BOM.qty ga kamayadi, `out` movement.
2. Update `[X]`→`[X,Y]` → faqat Y BOM ayriladi (delta).
3. Update `[X,Y]`→`[X]` → Y BOM qaytariladi (`in` movement), quantity oshadi.
4. Update bir xil `[X]`→`[X]` → nol yangi movement.
5. Create `[X,X]` → X BOM **2×** ayriladi (duplikat occurrence).
6. Update `performedServices` berilmagan (undefined) → movement yo'q.

**Test caselar (vitest — web, `VisitNoteFormModal.test.tsx` kengaytirish):**

7. Modal `performedServices` MultiSelect render qiladi va tanlanган qiymatlar submit body'ga kiradi.
8. `stageId` tanlansa body'da uzatiladi; tanlanмаса `undefined`.

## 4. Implementatsiya rejasi (TDD)

**API (bun test):**

1. **Failing test** — `stock.service.test.ts` (yoki integration) ga 6 case yoz; hozir 2,3,4,5,6 qizil.
2. **Impl:**
   - `stock.service.ts`: `reconcileForServices(c, before, after, visitNoteId)` qo'sh —
     count-map diff, `out`/`in` movement + `stockItems` quantity update per occurrence,
     `maybeAlertLowStock` chaqiruvi ayirish yo'lida. `deductForServices`'ni duplikat-aware qil
     (occurrence bo'yicha) yoki `reconcileForServices(c, [], serviceIds, id)` ga delegatsiya qil.
   - `visit-notes.service.ts` `update`: `input.performedServices !== undefined` bo'lganда
     `deps.reconcileStock?.(c, before.performedServices ?? [], input.performedServices, id)` chaqir
     (yangi narrow dep). `clinical.routes.ts:90-95` wiring'ga `reconcileStock: stockService.reconcileForServices` qo'sh.
3. **Verify:** `bun test` (stock + visit-notes) yashil; `bun run typecheck`.

**Web (vitest):**

4. **Failing test** — `VisitNoteFormModal.test.tsx`ga 7,8 case; hozir qizil.
5. **Impl:**
   - `clinical.schema.ts` `visitNoteFormSchema`ga `performedServices: z.array(z.string()).default([])`
     va `stageId: z.string().nullable().optional()` qo'sh.
   - `VisitNoteFormModal.tsx`: `services`/`stages` prop'lari + MultiSelect/Select; submit'да uzat.
   - `VisitNotesTab.tsx`: `useServiceCatalog()` + plan bosqichlari (workable) modalга uzat.
6. **Verify:** `vitest` (clinical) yashil; typecheck.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya YO'Q** — `stock_movements` (`in`/`out`/`adjustment`) enum kifoya; yangi ustun yo'q.
- **Xavf (hujjatlashtirilган):** agar xizmat BOM'i create'dan keyin, edit'gача o'zgargan bo'lsa,
  qaytarish *joriy* BOM bo'yicha ketadi (tarixiy ayirilgan miqdor emas) → kichik drift. Ledger-based
  reconcile (rad etilgan alt) buni yopardi; hozir qabul qilinади.
- **Backward-compat:** eski PATCH'lar `performedServices` yubormaydi → `undefined` → stockга tegmaydi
  (regressiya yo'q).
- **Rollout:** feature-branch, TDD, lokal verify (typecheck + bun/vitest), main'ga merge.

## 6. Qabul mezonlari

- [ ] Create xizmat bilan → BOM ayriladi (occurrence bo'yicha, duplikat to'g'ri).
- [ ] Edit qo'shsa → delta ayriladi; olib tashlasa → delta qaytariladi (`in` movement).
- [ ] Bir xil PATCH → nol movement (idempotent).
- [ ] `performedServices` berilmasa → stock o'zgармаydi.
- [ ] UI'da `performedServices` + `stageId` inputlari mavjud va body'ga kiradi.
- [ ] `bun test` + `vitest` + `typecheck` yashil.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/stock/stock.service.ts` (yangi `reconcileForServices`, `deductForServices` duplikat-fix)
- `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts` (update reconcile)
- `apps/api/src/modules/clinical/clinical.routes.ts:90-95` (DI wiring)
- `apps/web/src/features/clinical/clinical.schema.ts:30-38` (form schema)
- `apps/web/src/features/clinical/components/visit-notes/VisitNoteFormModal.tsx`
- `apps/web/src/features/clinical/components/visit-notes/VisitNotesTab.tsx`
- Testlar: `stock.service` (API), `VisitNoteFormModal.test.tsx` (web)
