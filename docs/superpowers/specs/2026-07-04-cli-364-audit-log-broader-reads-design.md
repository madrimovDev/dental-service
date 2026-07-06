# CLI-364 — Konsent/retsept/lab-order/rasm o'qishlari audit_log'ga yozilishi (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-364 (Medium)
> **Scope:** `apps/api/src/modules/consent/consent.service.ts` (`consent.view`), `apps/api/src/modules/prescriptions/prescriptions.service.ts` (`prescription.view`), `apps/api/src/modules/lab-orders/lab-orders.service.ts` (`lab_order.view`), `apps/api/src/modules/patient-images/patient-images.service.ts` (`patient_image.view`) — faqat o'qish funksiyalari.
> **Bog'liqlik:** CLI-363 bilan konseptual bir xil naqsh (§3.10), lekin alohida modullar/permission'lar — mustaqil Linear ticket.

---

## 1. Maqsad (Goal)

CLI-363 uch klinik modul (tooth-charts, visit-notes, treatment-plans)ning `.view` o'qishlarini audit qildi. Xuddi shu bo'shliq yana to'rtta modulda takrorlanadi: `consent.service.ts`, `prescriptions.service.ts`, `lab-orders.service.ts`, `patient-images.service.ts` — barchasida o'qish funksiyalari (`list`/`get`/`overdue`/`listTemplates`/`getTemplate`/`listForms`) mos `.view` permission bilan himoyalangan, lekin faqat mutation (`create`/`update`/`remove`/`upload`/`updateMetadata`/`signForm`) audit yozadi. Bu ticket — CLI-363'da o'rnatilgan naqshni shu to'rt modulga qo'llaydi.

---

## 2. Joriy holat — aniq o'qiladigan kod va permission guard'lar

**`consent.service.ts`** (`apps/api/src/modules/consent/consent.service.ts`):
- `listTemplates(c, type?, activeOnly = true)` (10-20-qatorlar) → `consent.routes.ts:44` `requirePermission('consent.view')`.
- `getTemplate(c, id)` (22-26-qatorlar) → `consent.routes.ts:103` `requirePermission('consent.view')`.
- `listForms(c, patientId?)` (87-96-qatorlar) → `consent.routes.ts:150` `requirePermission('consent.view')`.
- (`createTemplate`/`updateTemplate`/`signForm` — mutatsiya, `consent.manage`, audit allaqachon bor, o'zgarmaydi.)

**`prescriptions.service.ts`** (`apps/api/src/modules/prescriptions/prescriptions.service.ts`):
- `list(c, patientId?)` (9-18-qatorlar) → `prescriptions.routes.ts:42` `requirePermission('prescription.view')`.
- `get(c, id)` (20-24-qatorlar) → `prescriptions.routes.ts:100` `requirePermission('prescription.view')`.

**`lab-orders.service.ts`** (`apps/api/src/modules/lab-orders/lab-orders.service.ts`):
- `list(c, query: ListLabOrdersQuery)` (17-39-qatorlar) → `lab-orders.routes.ts:43` `requirePermission('lab_order.view')` + `requireFeature('labOrders')`.
- `overdue(c)` (42-54-qatorlar) → `lab-orders.routes.ts:65` `requirePermission('lab_order.view')` + `requireFeature('labOrders')`.
- `get(c, id)` (56-60-qatorlar) → `lab-orders.routes.ts:119` `requirePermission('lab_order.view')` + `requireFeature('labOrders')`.

**`patient-images.service.ts`** (`apps/api/src/modules/patient-images/patient-images.service.ts`):
- `list(c, patientId, visitNoteId?)` (32-51-qatorlar) → `patient-images.routes.ts:46` `requirePermission('patient_image.view')`.
- `get(c, id)` (53-58-qatorlar) → `patient-images.routes.ts:119` `requirePermission('patient_image.view')`. Rasm (X-ray/photo) — eng sensitive PHI turi, audit'siz qolishi eng katta gap.

---

## 3. Naqsh — CLI-363'dan ko'chiriladi (o'zgarmaydi)

Bitta-yozuvli `get`/`getTemplate` funksiyalar `patients.service.ts`'ning `getMedicalRecord` naqshini takrorlaydi:
```ts
if (row) {
  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: '<resource>',
    resourceId: id,
  });
}
```
— hech qanday `before`/`after` yo'q, topilmasa audit ham yo'q.

Ko'p-yozuvli `list`/`listTemplates`/`listForms`/`overdue` funksiyalar har doim log qiladi (bo'sh natija ham klinik jihatdan ma'noli — "bu bemorda konsent/retsept yo'q"):
```ts
await deps.audit.record(c, {
  action: 'viewed',
  resourceType: '<resource>',
  resourceId: patientId ?? null,
  after: { patientId: patientId ?? null, count: rows.length },
});
```

---

## 4. Global constraint

CLI-363 bilan bir xil: audit `'viewed'` chaqiruvi **hech qachon** klinik/PII tarkibni yozmaydi — `consentForms.bodyText` (imzolangan matn), `prescriptions.items` (dori nomi/dozasi), `labOrders.items`/`notes`, `patientImages.objectKey`/`originalFilename`/rasm o'zi — bularning HECH BIRI audit yozuviga kirmaydi. Faqat: `resourceId` (o'z id'si yoki patientId) + `after: { count, patientId? }`.

**Alohida eslatma — `patient-images`:** `objectKey`/URL ni audit'ga yozish ayniqsa xavfli (signed URL orqali tashqi kirish imkoni bo'lishi mumkin) — shuning uchun `list`/`get` audit yozuvida **faqat** `patientId`/`visitNoteId`/`count`/`resourceId` bo'ladi, `url`/`objectKey` HECH QACHON emas.

---

## 5. Yondashuv — har funksiya uchun aniq audit chaqiruvi

### 5.1 `consent.service.ts`

```ts
async function listTemplates(c: Context, type?: string, activeOnly = true) {
  const db = getDb(c);
  const filters = [];
  if (type) filters.push(eq(consentTemplates.type, type as 'treatment'));
  if (activeOnly) filters.push(eq(consentTemplates.isActive, true));
  const rows = await db
    .select()
    .from(consentTemplates)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(consentTemplates.createdAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'consent_template',
    resourceId: null,
    after: { type: type ?? null, count: rows.length },
  });
  return rows;
}

async function getTemplate(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(consentTemplates).where(eq(consentTemplates.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'consent_template',
      resourceId: id,
    });
  }
  return row ?? null;
}

async function listForms(c: Context, patientId?: string) {
  const db = getDb(c);
  const filters = [];
  if (patientId) filters.push(eq(consentForms.patientId, patientId));
  const rows = await db
    .select()
    .from(consentForms)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(consentForms.signedAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'consent_form',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
}
```
`resourceType` create/update naqshi bilan bir xil (`createTemplate`/`updateTemplate` → `'consent_template'`; `signForm` → `'consent_form'`).

### 5.2 `prescriptions.service.ts`

```ts
async function list(c: Context, patientId?: string) {
  const db = getDb(c);
  const filters = [];
  if (patientId) filters.push(eq(prescriptions.patientId, patientId));
  const rows = await db
    .select()
    .from(prescriptions)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(prescriptions.issuedDate));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'prescription',
    resourceId: patientId ?? null,
    after: { patientId: patientId ?? null, count: rows.length },
  });
  return rows;
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'prescription',
      resourceId: id,
    });
  }
  return row ?? null;
}
```

### 5.3 `lab-orders.service.ts`

```ts
async function list(c: Context, query: ListLabOrdersQuery) {
  const db = getDb(c);
  const offset = (query.page - 1) * query.pageSize;
  const filters = [];
  if (query.patientId) filters.push(eq(labOrders.patientId, query.patientId));
  if (query.status) filters.push(eq(labOrders.status, query.status));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [data, totalRows] = await Promise.all([
    db
      .select()
      .from(labOrders)
      .where(where)
      .orderBy(desc(labOrders.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(labOrders).where(where),
  ]);
  const total = totalRows[0]?.total ?? 0;

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'lab_order',
    resourceId: query.patientId ?? null,
    after: { patientId: query.patientId ?? null, count: data.length },
  });

  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

async function overdue(c: Context) {
  const db = getDb(c);
  const rows = await db
    .select()
    .from(labOrders)
    .where(
      and(
        lt(labOrders.expectedDate, new Date()),
        notInArray(labOrders.status, ['delivered', 'cancelled']),
      ),
    )
    .orderBy(labOrders.expectedDate);

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'lab_order',
    resourceId: null,
    after: { overdue: true, count: rows.length },
  });
  return rows;
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id));
  if (row) {
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: id,
    });
  }
  return row ?? null;
}
```

### 5.4 `patient-images.service.ts`

```ts
async function list(c: Context, patientId: string, visitNoteId?: string) {
  const db = getDb(c);
  const rows = await db
    .select()
    .from(patientImages)
    .where(
      visitNoteId
        ? and(eq(patientImages.patientId, patientId), eq(patientImages.visitNoteId, visitNoteId))
        : eq(patientImages.patientId, patientId),
    )
    .orderBy(desc(patientImages.createdAt));

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'patient_image',
    resourceId: patientId,
    after: { patientId, visitNoteId: visitNoteId ?? null, count: rows.length },
  });

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      url: await presignedGetUrl(row.objectKey),
    })),
  );
}

async function get(c: Context, id: string) {
  const db = getDb(c);
  const [row] = await db.select().from(patientImages).where(eq(patientImages.id, id));
  if (!row) return null;

  await deps.audit.record(c, {
    action: 'viewed',
    resourceType: 'patient_image',
    resourceId: id,
  });

  return { ...row, url: await presignedGetUrl(row.objectKey) };
}
```
`list`'da audit `presignedGetUrl` chaqiruvidan OLDIN yoziladi (DB row'lar allaqachon olingan, faqat URL signing keyin) — audit yozuvida `url` yo'q, faqat `patientId`/`visitNoteId`/`count`.

---

## 6. Test strategiyasi

CLI-363 bilan bir xil: **mock/spy YO'Q**. Har modul uchun yangi real-DB integration test — real `createAuditLogger({ db })` + real service factory + `ctx()` helper + `db.transaction` ichida `SET LOCAL app.current_tenant_id`, keyin `auditLog` jadvalidan to'g'ridan-to'g'ri select bilan tasdiqlash (`medical-record-history.test.ts`/CLI-363 testlari bilan bir xil naqsh).

⚠️ `patient-images.service.ts` uchun mavjud `patient-images-visit-link.test.ts` `noopAudit` ishlatadi — bu test o'zgarmaydi (yangi audit chaqiruvi uni buzmaydi). Yangi audit-fokusli test alohida faylda (`cli-364-patient-images-audit.test.ts`).

`presignedGetUrl`/`uploadObject` (`apps/api/src/lib/s3.ts`) — mavjud `patient-images-visit-link.test.ts` izohida "S3 env (presign offline)" deyilgan: test muhitida ishlaydigan presign konfiguratsiyasi mavjud, yangi testlar shu muhitni qayta ishlatadi (alohida MinIO mock kerak emas).

---

## 7. DoD

- [ ] `consent.service.ts`: `listTemplates`, `getTemplate`, `listForms` `action: 'viewed'` audit yozadi (§5.1).
- [ ] `prescriptions.service.ts`: `list`, `get` `action: 'viewed'` audit yozadi (§5.2).
- [ ] `lab-orders.service.ts`: `list`, `overdue`, `get` `action: 'viewed'` audit yozadi (§5.3).
- [ ] `patient-images.service.ts`: `list`, `get` `action: 'viewed'` audit yozadi, `url`/`objectKey` audit yozuviga kirmaydi (§5.4, §4).
- [ ] Har modul uchun real-DB integration test — `bun test --env-file=../../.env`.
- [ ] Mavjud testlar (`patient-images-visit-link.test.ts` va h.k., `noopAudit` bilan) o'zgarishsiz yashil qoladi.
- [ ] Typecheck toza.
