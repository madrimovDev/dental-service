# R2 — Klinik C (media: bemor rasmlari): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-52 (Klinik media), Milestone M4/M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), [RFC-0003](../../rfcs/0003-design-system-theming.md), R2-A (`features/patients/` etalon), R2-B (`features/appointments/` etalon), R2 Navbat (`features/queue/`)
- **Status:** Draft (orchestrator review kutilmoqda)
- **Branch:** `feat/r2-clinical`

## Maqsad

R2 klinik re-skin'ning **C — media guruhi**: bemor rasmlari tabi (upload / MinIO). Mavjud `apps/web/src/components/clinical/PatientImagesTab.tsx` (295q, to'g'ridan `api.patientImages` chaqiradi, xom `['patient-images', patientId]` query-key, `confirm()`, emoji) RFC-0010 `features/clinical/` ga ko'chiriladi + teal dizaynga re-skin qilinadi. Mavjud funksiyalar (upload multipart, list, preview modal, delete, presigned URL, tur tanlash, tish raqamlari, olingan sana) **yo'qotilmaydi**. Komponent `features/patients/components/PatientCard.tsx` registrida `img` tab sifatida render qilinadi — registr ulanishi saqlanadi (faqat import yo'li o'zgaradi).

## Qamrov

**Ichida:** `features/clinical/` (RFC-0010 qatlamlar — `images` namespace), rasm tab re-skin (R0 primitivlar + teal), `confirm()` → Mantine modal, emoji → lucide, sof mapper (formatBytes/title-fallback/contentType), inline hooklar → `clinical.api.ts`, i18n `image.*` tuzatish/kengaytirish (uz+ru), `PatientCard.tsx` registr import yangilash.

**Tashqarida:**
- **Backend o'zgarishi YO'Q** (gap topilmadi — §1 ga qarang).
- **Thumbnail generatsiyasi** → YO'Q (sharp + DICOM + derivative storage + migratsiya + async job — re-skin chegarasidan tashqari, yangi feature).
- **Annotatsiya (rasm ustida belgilar)** → YO'Q (alohida quyi-tizim, R2 emas).
- **Edit-metadata modal** → out-of-scope, lekin **backend tayyor** (§1.2). Orchestrator qarori; default'da R2 da ulanmaydi.
- Odontogram / ToothChart / VisitNotes / Prescriptions / Consent / LabOrders / TreatmentPlans tablari → boshqa guruhlar (A, B).

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + RFC-0010 ko'chirish** (funksiya saqlanadi) | R2 maqsadi: mavjud ekranni teal + feature-folder |
| 2 | **Backend gap YO'Q — backend UI'dan oldinda** | Tekshirildi (§1): upload/list/get/PATCH/delete + presigned URL + `before_after` enum + tur/tish/sana hammasi mavjud |
| 3 | **`images` — `features/clinical/` ichida o'z namespace** (`clinicalKeys.images(...)`, `components/images/`) | A/B/C parallel ishlaydi; namespace izolyatsiyasi stomp'ni oldini oladi (§6) |
| 4 | **`update`/PATCH endpoint tayyor, lekin UI ulamaydi** (out-of-scope) | Mavjud komponentda edit-metadata yo'q; R2 re-skin doirasini kengaytirmaslik |
| 5 | **Preview + upload modallari saqlanadi**, teal'ga moslanadi | Mavjud UX yo'qotilmaydi |

## 1. Backend gaplari (RFC-0009) — **gap YO'Q**

Backend moduli (`apps/api/src/modules/patient-images/`) to'liq va R2 uchun yetarli. Tekshirilgan tafsilot:

### 1.1 Mavjud (gap emas)
- **CRUD to'liq:** `POST /patient-images` (multipart upload), `GET /patients/:patientId/images` (list), `GET /patient-images/:id`, `PATCH /patient-images/:id` (updateMetadata), `DELETE /patient-images/:id` — hammasi `requirePermission` + `rlsMiddleware` + audit bilan.
- **MinIO/S3:** `uploadObject` / `presignedGetUrl` / `deleteObject` (`lib/s3.ts`); object key layout `tenants/{tenantId}/patients/{patientId}/{imageId}.{ext}`; download — backend qisqa-muddatli signed URL beradi (`row.url`). Upload-first, DB-insert keyin (orphan cleanup mavjud).
- **Kategoriyalash / before-after:** `patient_image_type` enum allaqachon 8 qiymat (`xray_panoramic` … `before_after` … `other`) — prompt'dagi "categorization / before-after tagging" gap **emas**, mavjud.
- **Metadata:** `title`, `description`, `toothNumbers` (FDI array), `takenDate`, `contentType`, `sizeBytes` — barchasi mavjud.
- **Validatsiya:** `ALLOWED_CONTENT_TYPES` (jpeg/png/webp/heic/heif/dicom), `MAX_UPLOAD_BYTES` (30 MB), `imageType` Zod enum.
- **api-client:** `endpoints.ts` `patientImages.{list,get,upload,update,remove}` + `types-m5.ts` `PatientImage`/`PatientImageType` — tayyor.

### 1.2 `update`/PATCH — tayyor, lekin UI ulamaydi
`PATCH /patient-images/:id` (service `updateMetadata`, api-client `patientImages.update`) **to'liq mavjud va simlangan**, ammo joriy komponent uni hech qachon chaqirmaydi (edit-metadata UI yo'q). Bu — **frontend imkoniyati mavjud endpoint ustida**, backend gap emas. R2 doirasidan tashqari; orchestrator xohlasa keyin edit-modal ulashi mumkin. Bu fakt "backend to'liq" xulosasini mustahkamlaydi.

### 1.3 Haqiqiy yo'qliklar (gap-sifatida rad etildi)
- **Thumbnail:** sharp + DICOM render + derivative object + schema ustun + migratsiya + ehtimol async job. R2 "kichik, asosli gap" o'lchamidan kattaroq (qiyos: navbat gap'i bitta nullable FK + migratsiya edi). → **YO'Q.**
- **Annotatsiya:** alohida quyi-tizim. → **YO'Q.**

> **Xulosa:** backend gap YO'Q. R2-C — **sof frontend re-skin + RFC-0010 ko'chirish.** Backend tegmaydi.

## 2. `features/clinical/` (kanonik RFC-0010 — `images` namespace)

```
apps/web/src/features/clinical/
├── index.ts               # SHARED A/B/C — append-only (images eksportlari qo'shiladi)
├── clinical.keys.ts       # SHARED — clinicalKeys.images(patientId) namespace qo'shiladi
├── clinical.types.ts      # SHARED — PatientImageVM (images bo'limi) qo'shiladi
├── clinical.mappers.ts    # SHARED (sof) — toPatientImageVM / formatBytes qo'shiladi
├── clinical.mappers.test.ts  # SHARED — images mapper testlari qo'shiladi
├── clinical.api.ts        # SHARED — images hooklari qo'shiladi
├── clinical.schema.ts     # SHARED — uploadImageFormSchema (Zod) qo'shiladi
└── components/
    └── images/            # C guruhi o'z subkatalogi (stomp yo'q)
        ├── PatientImagesTab.tsx   # asosiy tab (re-skin)
        ├── ImageCard.tsx          # grid karta (preview/download/delete)
        ├── ImagePreviewModal.tsx  # to'liq ko'rish modali
        └── ImageUploadModal.tsx   # upload formasi (Mantine form + Zod)
```

> **Qatlam:** `components/images → clinical.api.ts (hooks) → api-client`. Komponent `api.patientImages`'ni bevosita chaqirmaydi. `clinical.mappers.ts` — sof funksiya (DTO → view-model), biznes-mantiqsiz.
>
> **DIQQAT (parallel):** `index.ts`, `clinical.keys.ts`, `clinical.types.ts`, `clinical.mappers.ts(+test)`, `clinical.api.ts`, `clinical.schema.ts` — A/B guruhlar bilan **ulashiladi**. Har biri **append-only**, `images*` namespace ostida (§6 merge qoidasi). `components/images/` — faqat C.

### 2.1 `clinical.keys.ts` (images bo'limi)
```ts
images: {
  byPatient: (patientId: string) => ['clinical', 'images', patientId] as const,
}
```
Xom `['patient-images', patientId]` (joriy) o'rniga factory.

### 2.2 `clinical.types.ts` (images bo'limi)
- `PatientImageVM` — `{ id, type, typeLabel?, url, isImage: boolean, displayTitle, sizeLabel, toothNumbers, takenDate, createdAt, contentType, description }`. (`typeLabel` `t()` komponentda, VM da xom `type` saqlanadi.)

### 2.3 `clinical.mappers.ts` (sof, MAJBURIY — test bilan)
- `formatBytes(b: number): string` — joriy inline funksiya (B/KB/MB) ko'chiriladi.
- `toPatientImageVM(dto: PatientImage): PatientImageVM` — `displayTitle = title ?? originalFilename`, `isImage = contentType.startsWith('image/')`, `sizeLabel = formatBytes(sizeBytes)`. Sof, `t()` siz.

### 2.4 `clinical.api.ts` (images hooklari)
- `usePatientImages(patientId)` → `api.patientImages.list` + `clinicalKeys.images.byPatient`, `select` orqali `toPatientImageVM` map.
- `useUploadPatientImage(patientId)` → `api.patientImages.upload(FormData)`, `onSuccess` invalidate `clinicalKeys.images.byPatient`.
- `useDeletePatientImage(patientId)` → `api.patientImages.remove(id)`, invalidate.

### 2.5 `clinical.schema.ts` (upload form)
- `uploadImageFormSchema` (`@mantine/form` + zod-resolver): `file` (majburiy, content-type/size client-tekshiruv), `type` (enum), `title?`, `description?`, `toothNumbers?` (string → number[] transform), `takenDate?`.

## 3. Tab re-skin (mavjud funksiya yo'qotilmaydi)

- **R0 primitivlar:** `PageHead`/`Title`, `Button`, `Card`, `StatusPill`/`Badge` (tur belgisi), `Mono` (hajm/sana), teal token. CSS Module kerak bo'lsa.
- **lucide ikonkalar** (emoji o'rniga, teal izchillik — navbat spec presedenti):
  - `📄` (non-image fayl, joriy 144q) → lucide `IconFile`.
  - `🦷` (tish raqamlari, joriy 173q) → lucide `IconDental` (yoki mavjud `@tabler` ekvivalent).
- **Grid:** `SimpleGrid` saqlanadi (responsive cols), har element `ImageCard`.
- **Permission gating saqlanadi:** `patient_image.view` (ko'rish), `patient_image.upload` (yuklash/o'chirish). `canView` bo'lmasa — `patients.no_medical_permission` matni.
- **Preview / upload modallari** Mantine `Modal` (joriy) saqlanadi, teal'ga moslanadi.

## 4. `confirm()` → Mantine modal (HARD CONSTRAINT)

- Joriy `if (confirm(t('image.confirm_delete'))) removeMut.mutate(img.id)` (193q) → Mantine pattern.
- Yondashuv: `@mantine/modals` `modals.openConfirmModal` (yoki kichik boshqariladigan `Modal`) — sarlavha `image.confirm_delete`, tasdiqda `useDeletePatientImage().mutate(id)`. Loyiha bo'ylab izchil bo'lishi uchun R2-A/B da ishlatilgan usul tanlanadi (plan'da aniqlanadi).

## 5. i18n + R0 primitiv

- **Bug tuzatish:** download tugmasi joriy `t('image.upload')` (185q) — **noto'g'ri label** va `image.download` kaliti yo'q. Yangi `image.download` (uz: "Yuklab olish", ru: "Скачать") qo'shiladi va tugmaga ishlatiladi.
- Mavjud `image.*` kalitlar (uz+ru) saqlanadi. Re-skin'da yangi matn (masalan, non-image fayl labeli) kerak bo'lsa — **ikkala** faylga qo'shiladi.
- R0 primitivlar: `PageHead`, `Button`, `Card`, `Badge`/`StatusPill`, `Mono`, `Modal`, `FileInput`/`Select`/`TextInput`/`Textarea` (Mantine form), lucide ikonkalar.

## 6. Ulashilgan fayllar (HARD CONSTRAINT 4 — parallel A/B/C merge qoidasi)

Guruhlar A, B, C bir vaqtda `features/clinical/` da ishlaydi. Aniq to'qnashuv nuqtalari va merge strategiyasi:

| Fayl | To'qnashuv | Qoida |
|---|---|---|
| `features/clinical/index.ts` | A/B/C eksport qo'shadi | **Append-only** — C `components/images/*` + images hook/type eksportlarini qo'shadi, mavjud satrlar tegmaydi |
| `clinical.keys.ts` | umumiy factory | **`images` namespace** ostida append (`clinicalKeys.images.*`); A/B o'z namespace'larida |
| `clinical.types.ts` | umumiy tiplar | `PatientImageVM` append |
| `clinical.mappers.ts` (+`.test.ts`) | umumiy mapperlar | `toPatientImageVM`/`formatBytes` append; testga images bloki append |
| `clinical.api.ts` | umumiy hooklar | images hooklari append |
| `clinical.schema.ts` | umumiy Zod | `uploadImageFormSchema` append |
| `components/images/` | faqat C | Izolyatsiya — stomp yo'q (A/B o'z subkataloglarida) |
| `PatientCard.tsx` (38–42 lazy, 105 render) | A/B/C import yo'lini yangilaydi | **Append-only / minimal edit** — `PatientImagesTab` lazy importi `@/components/clinical/...` → `@/features/clinical/...` ga o'zgaradi (render satri o'zgarmaydi); A/B o'z tablarini xuddi shunday yangilaydi. Build plan bu edit'ni **serializatsiya** qiladi (merge konflikt oldini olish) |
| i18n `image.*` (`uz.json`/`ru.json`) | C namespace, ammo fayl A/B kalitlari bilan ulashiladi | C faqat `image.*` bloki ichida append (`image.download` + yangi matn); boshqa namespace tegmaydi |

> **Build plan eslatmasi:** `PatientCard.tsx` va `features/clinical/index.ts` — A/B/C uchun yagona shared edit nuqtasi. Plan bu fayllarning edit'larini ketma-ket (serial) qilishi yoki bitta integratsiya qadamiga yig'ishi kerak.

## 7. Testlar

- **`clinical.mappers.test.ts`** (images bloki, eng muhim): `formatBytes` (B/KB/MB chegaralari), `toPatientImageVM` (`displayTitle` fallback `title ?? originalFilename`, `isImage` true/false `contentType` bo'yicha, `sizeLabel`).
- **`PatientImagesTab`** smoke (renderApp + mock hooks): grid render, bo'sh holat, permission gating (`canView` yo'q → ruxsat matni).
- **`ImageUploadModal`** behavioral: file + type tanlash → `useUploadPatientImage` chaqiruvi (FormData maydonlari); validatsiya (file yo'q → submit bloklangan).
- **Delete confirm modal** behavioral: o'chirish bosilganda Mantine confirm modal ochiladi (native `confirm` emas), tasdiqda `useDeletePatientImage` chaqiriladi.

## 8. Verifikatsiya

- `turbo test --filter @dental/web` (exit 0) + build + typecheck. (Backend tegmaydi — API test/migratsiya YO'Q.)
- Dev fidelity (inson): rasm tabi teal, grid + preview modal + upload modal ishlaydi; upload (rasm/DICOM) → ro'yxatga tushadi; download tugmasi to'g'ri label + signed URL ochadi; delete → Mantine confirm modal → o'chadi; permission gating; tish raqamlari/tur belgisi ko'rinadi; emoji yo'q (lucide).

## Qurilish tartibi (plan'da)

1. **`features/clinical/` images skeleti:** keys (`images` namespace) → types (`PatientImageVM`) → mappers (`formatBytes`/`toPatientImageVM` + test) → api hooklari → schema.
2. **Komponentlar (`components/images/`):** `ImageCard` → `ImagePreviewModal` → `ImageUploadModal` (Mantine form + Zod) → `PatientImagesTab` (re-skin, lucide, teal).
3. **`confirm()` → Mantine confirm modal** + behavioral test.
4. **i18n:** `image.download` qo'shish (uz+ru) + download tugma bug tuzatish; yangi matnlar.
5. **`index.ts` eksport (append) + `PatientCard.tsx` lazy import yo'lini yangilash** (shared — build plan serializatsiya qiladi).
6. Verifikatsiya (test + build + typecheck + dev fidelity).

## Ochiq mayda nuqtalar (plan'da)

- Mantine confirm modal usuli (`@mantine/modals` vs boshqariladigan `Modal`) — R2-A/B bilan izchil tanlanadi.
- `toothNumbers` upload formasida string ("11, 12") → number[] transform: Zod schema'da (`clinical.schema.ts`) yoki upload hook'ida — schema afzal (sof). Backend allaqachon ikkala shaklni qabul qiladi (`uploadImageMetadataSchema`).
- `useUploadPatientImage` `FormData` qurish: hook ichida (joriy inline `uploadMut` mantiqi) yoki komponentda yig'ib uzatish — hook ichida afzal (komponent toza qoladi).
- lucide tish ikonkasi aniq nomi (`@tabler/icons-react` da `IconDental` mavjudligini tekshirish; bo'lmasa `IconTooth`/fallback).
