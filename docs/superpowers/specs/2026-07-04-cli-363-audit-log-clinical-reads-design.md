# CLI-363 — `medical_record.view` o'qishlari audit_log'ga yozilishi (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-363 (High)
> **Scope:** `apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts`, `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts`, `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts` — faqat **o'qish** funksiyalari (list/getLatest/get/listPlans/getPlan). Mutation funksiyalar (create/update) allaqachon audit yozadi — o'zgarmaydi.

---

## 1. Maqsad (Goal)

CLAUDE.md §3.10: "Sensitive read (masalan, `medical_record.view`) ham yoziladi (lekin tarkibi yoziladi emas, faqat ko'rilgani)." Uchta klinik modul — tooth-charts, visit-notes, treatment-plans — barchasi route darajasida `requirePermission('medical_record.view')` bilan himoyalangan, lekin faqat mutation funksiyalar (`create`, `update`, `updatePlan`, `setConsent`, `updateStage`) `deps.audit.record` chaqiradi. O'qish funksiyalari (`list`, `getLatest`, `get`, `listPlans`, `getPlan`) hech qanday audit yozuvi qoldirmaydi — bu §3.10'ni buzadi va real audit trail'da "kim qaysi bemorning klinik tarixini ko'rgani" ma'lumoti yo'qolgan.

Bu spec — shu gap'ni yopish uchun aniq kod o'zgarishlari va test strategiyasini belgilaydi.

---

## 2. Joriy holat — aniq o'qiladigan kod

**`tooth-charts.service.ts`** (`apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts:9-10`):
```ts
const list = (c: Context, patientId: string) => repo.list(c, patientId);
const getLatest = (c: Context, patientId: string) => repo.getLatestWithStates(c, patientId);
```
Route (`tooth-charts.routes.ts:26,49`): ikkalasi ham `requirePermission('medical_record.view')` + `requireFeature('odontogram')`. `list` — patient bo'yicha barcha snapshot+states tarixi; `getLatest` — eng so'nggi snapshot yoki `null`.

**`visit-notes.service.ts`** (`apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts:22-23`):
```ts
const list = (c: Context, patientId?: string) => repo.list(c, patientId);
const get = (c: Context, id: string) => repo.find(c, id);
```
Route (`visit-notes.routes.ts:39,107`): ikkalasi `requirePermission('medical_record.view')`. `list` — tenant-wide yoki patient-filtered (SOAP matni tarkibi bilan); `get` — bitta yozuv yoki `null`.

**`treatment-plans.service.ts`** (`apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:49-50`):
```ts
const listPlans = (c: Context, query: ListPlansQuery) => repo.listPlans(c, query);
const getPlan = (c: Context, id: string) => repo.getPlanWithStages(c, id);
```
Route (`treatment-plans.routes.ts:56,118`): ikkalasi `requirePermission('medical_record.view')`. `listPlans` — `{data, meta}` paginatsiyalangan, har plan nested stage'lar bilan; `getPlan` — plan+stages yoki `null`.

**Non-goal eslatma:** `treatment-plans.service.ts`'da `estimate(c, planId)` funksiyasi ham `medical_record.view` bilan himoyalangan computed-read (`treatment-plans.routes.ts:142`), lekin ticket DoD faqat `listPlans`/`getPlan`'ni nomlaydi. `estimate` ushbu ticket scope'ida emas — kelajakda alohida follow-up kerak bo'lsa, CLI-364 uslubi qo'llanadi.

---

## 3. Pozitiv kontrol — `patients.service.ts` naqshi (aynan shu ko'chiriladi)

`apps/api/src/modules/patients/patients.service.ts:230-247` (`findById`):
```ts
async function findById(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(patients).where(eq(patients.id, id));
  if (!row) return null;

  const hasPii = userHasPiiAccess(c);

  // Sensitive read'ni audit log'ga yozish (faqat PII access bo'lsa)
  if (hasPii) {
    await deps.audit.record(c, {
      action: 'viewed_pii',
      resourceType: 'patient',
      resourceId: id,
    });
  }

  return hasPii ? row : maskPii(row);
}
```

`patients.service.ts:345-361` (`getMedicalRecord`):
```ts
async function getMedicalRecord(c: Context, patientId: string) {
  const db = getDb(c);
  const [record] = await db
    .select()
    .from(medicalRecords)
    .where(eq(medicalRecords.patientId, patientId));

  if (record) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'medical_record',
      resourceId: record.id,
    });
  }

  return record ?? null;
}
```

**Xulosa (aniq naqsh):** bitta-yozuvli `get`-tur funksiyalarda audit chaqiruvi **faqat 3 maydon** bilan chaqiriladi — `action: 'viewed'`, `resourceType`, `resourceId` — **hech qanday `before`/`after` maydoni yo'q**. Yozuv topilmasa (`null`), audit ham yozilmaydi (ko'rish akti sodir bo'lmagan). Bu — "faqat ko'rilgani" tamoyilining aynan kodga tarjimasi.

---

## 4. Global constraint

**Audit `'viewed'` chaqiruvi klinik tarkibni HECH QACHON `audit_log.after`/`before`'ga yozmaydi.** Ya'ni: `visitNotes.subjective`/`objective`/`plan`/`freeNotes` matni, `toothStates` array tarkibi, `treatmentStages` narx/xizmat tafsilotlari — булар audit yozuviga kirmaydi. Faqat **identifying metadata** ruxsat etiladi:
- bitta-yozuvli `get` funksiyalar: `resourceId` (yozuvning o'z id'si) — boshqa hech narsa (§3'dagi `getMedicalRecord` naqshi bilan bir xil).
- ko'p-yozuvli `list` funksiyalar: `resourceId` (mavjud bo'lsa — patientId, patient-scoped list uchun) + `after: { patientId, count }` — faqat son va identifikator, tarkib emas.

Bu farq §3.10'dagi "tarkibi yoziladi emas, faqat ko'rilgani" talabini to'g'ridan-to'g'ri qondiradi.

---

## 5. Yondashuv — har funksiya uchun aniq audit chaqiruvi

### 5.1 `tooth-charts.service.ts`

```ts
const list = async (c: Context, patientId: string) => {
  const rows = await repo.list(c, patientId);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'tooth_chart',
    resourceId: patientId,
    after: { count: rows.length },
  });
  return rows;
};

const getLatest = async (c: Context, patientId: string) => {
  const chart = await repo.getLatestWithStates(c, patientId);
  if (chart) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'tooth_chart',
      resourceId: chart.id,
    });
  }
  return chart;
};
```
`list` har doim log qiladi (bo'sh natija ham — "bu bemorda hali tooth chart yo'q" ma'lumoti ham klinik jihatdan sezilarli, patients.service'dagi `list` audit yozmasligidan farqli — u yerda bemor ro'yxati emas, alohida bemorning klinik tarixi ko'riladi). `getLatest` — faqat topilganda (§3 naqshi).

### 5.2 `visit-notes.service.ts`

```ts
const list = async (c: Context, patientId?: string) => {
  const rows = await repo.list(c, patientId);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'visit_note',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
};

const get = async (c: Context, id: string) => {
  const note = await repo.find(c, id);
  if (note) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'visit_note',
      resourceId: id,
    });
  }
  return note;
};
```

### 5.3 `treatment-plans.service.ts`

```ts
const listPlans = async (c: Context, query: ListPlansQuery) => {
  const result = await repo.listPlans(c, query);
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'treatment_plan',
    resourceId: query.patientId ?? null,
    after: { patientId: query.patientId ?? null, count: result.data.length },
  });
  return result;
};

const getPlan = async (c: Context, id: string) => {
  const plan = await repo.getPlanWithStages(c, id);
  if (plan) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan',
      resourceId: id,
    });
  }
  return plan;
};
```

Uchala modulda ham `list`/`getLatest`/`get`/`listPlans`/`getPlan` hozir arrow-function bir-qatorli delegatsiya (`const x = (c, ...) => repo.x(c, ...)`) — audit qo'shish uchun `async function`/`async (c, ...) => {...}` shakliga o'tkaziladi (repo funksiyasini o'zgartirmasdan, faqat service qatlamida wrap qilinadi).

---

## 6. Test strategiyasi

Repo'da **service-darajasidagi audit'ni mock/spy qiluvchi convention YO'Q** (`jest.fn`/`vi.fn`/`mock.module` audit uchun hech qayerda ishlatilmagan). Mavjud aniq namuna — **real DB integration test**:

- `apps/api/tests/integration/medical-record-history.test.ts` — real `createAuditLogger({ db })` + real service factory + `ctx()` helper (`c.get(k)` orqali `db`/`activeTenantId`/`user`/`accessClaims`/`req.header` beradi) + `db.transaction` ichida `SET LOCAL app.current_tenant_id` + keyin audit natijasini **to'g'ridan-to'g'ri modul funksiyasi orqali** (`medicalRecordHistory`) yoki **`auditLog` jadvalidan select** bilan tasdiqlash.
- `apps/api/tests/integration/patient-images-visit-link.test.ts` va `apps/api/tests/integration/clinical.test.ts` — audit predmet bo'lmaganda **no-op stub** ishlatiladi: `const noopAudit = { record: async () => {} } as unknown as AuditLogger;`.

Demak ikki holat bor: (a) audit **predmet emas** → `noopAudit` stub; (b) audit **predmet** (bizning holat) → real `createAuditLogger({ db })` + keyin `db.select().from(auditLog).where(and(eq(auditLog.action,'viewed'), eq(auditLog.resourceType, '...'), eq(auditLog.resourceId, ...)))` bilan qatordagi yozuv borligini tasdiqlash. Bu ticket **(b)** guruhiga kiradi — hech qanday yangi mock kutubxona kerak emas.

⚠️ **Muhim:** `apps/api/tests/integration/clinical.test.ts` va boshqa mavjud testlar ushbu uchta servisga `noopAudit` beradi — `noopAudit.record` har doim `Promise<void>` qaytaradi, shuning uchun yangi `await deps.audit.record(...)` chaqiruvlari bu mavjud testlarni BUZMAYDI (regression yo'q, faqat qo'shimcha no-op chaqiruv).

---

## 7. DoD

- [ ] `tooth-charts.service.ts`: `list` va `getLatest` `action: 'viewed'` audit yozadi (§5.1 aniq kod).
- [ ] `visit-notes.service.ts`: `list` va `get` `action: 'viewed'` audit yozadi (§5.2).
- [ ] `treatment-plans.service.ts`: `listPlans` va `getPlan` `action: 'viewed'` audit yozadi (§5.3).
- [ ] Audit yozuvlarida klinik tarkib (SOAP matni, tooth states, stage narxlari) **yo'q** — faqat id/count/patientId (§4 global constraint).
- [ ] Har modul uchun real-DB integration test — o'qish chaqirilganda `audit_log`'da mos yozuv paydo bo'lishini tasdiqlaydi (`bun test --env-file=../../.env`).
- [ ] Mavjud `clinical.test.ts` (noopAudit bilan) va boshqa mavjud testlar o'zgarishsiz yashil qoladi.
- [ ] Typecheck toza (`turbo typecheck` yoki `bun --filter @dental/api typecheck`).
