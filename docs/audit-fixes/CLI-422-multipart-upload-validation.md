# CLI-422 — Hand multipart upload route validatsiyани o'tkazиб yuboradi (500 + orphan object)

> Audit: MEDIUM M9. `uploadImageMetadataSchema` qo'llanмаydi; noto'g'ri patientId → PG cast 500; Invalid Date → object yozилгач insert fail → orphan fayl.

## Bog'liq ticketlar

- **CLI-421** — cross-entity ownership. **Yagona tartib upload yo'lида:** schema-shakl validatsiya (bu ticket)
  → ownership (421) → storage write → insert. Bu doc validatsiya + orphan-cleanup qatlamини belgилайди;
  421 ownership assert'ини shakl-validatsiyадан keyin joyлаydi.

## 1. Muammo va ildiz sabab

`patient-images.routes.ts:96-149` — multipart POST **hand** yozилган (orval mutator multipart'ни
qo'llаб-quvvatlамaydi, shu sabab OpenAPI spec'дан tashqаri). Mavjud `uploadImageMetadataSchema`
(`patient-images.schema.ts:14-31`) **umuман ishlatilмaydi** (import ham qilинmagан). Route faqat
ad-hoc tekshiruvlar qiladi:

- `patientId` — faqat `!patientId` (bo'shми) tekshiriladi (114-qator), **UUID emas**. Noto'g'ri
  string → service `db.insert` da `patients` FK cast → **PG 500**.
- `visitNoteId` — hech qanday validatsiyа (109-qator).
- `takenDate` — service'да `new Date(input.takenDate)` (`patient-images.service.ts:108`); "Invalid Date"
  → object allaqачон yozilган (90-qator) → insert fail → **orphan fayl** (service faqat `!row`
  holатини tozаlaydi, exception'ни emas — 113-116 qator faqat `returning()` bo'sh bo'lса ishlaydi).
- `title`/`description` — uzunlик cap yo'q.
- `toothNumbers` — FDI (butun, musbat) tekshiruvи yengil (129-qator `n > 0`), lekin schema'даги
  transform ishlatilmayди.

## 2. Dizayn qarori

**Aniq yechim (tanlangan):**

1. **Schema qo'llаш:** yig'ilган form maydonларини (`patientId`, `type`, `visitNoteId`, `title`,
   `description`, `toothNumbers`, `takenDate`) `uploadImageMetadataSchema.safeParse(...)` bilan
   validatsiya qil. **Storage yozишдан OLDIN** (object'дан oldin) 400 qaytar — bad input'да hech
   qanday fayl yozилмайди.
   - `toothNumbers` transform allaqачон string/array'ни handle qiladi; FDI musbat-butun filtri
     schema'га ko'chиriladi (`.int().positive()`).
   - `takenDate` `z.iso.datetime()` → Invalid Date umuман kelмайди.
2. **Orphan-cleanup:** service `upload`да storage-write + insert'ни shunday o'rа: insert **exception**
   (nafaqat bo'sh `returning`) otса ham `deleteObject(objectKey)` chaqirilsin. Hozirги `if (!row)`
   bloki (113-116) faqat bo'sh natijани yopadi; `try/catch` bilan har throw'да cleanup qo'shamiz.
3. Fayl-darajа tekshiruvlar (`file instanceof File`, `MAX_UPLOAD_BYTES`, `ALLOWED_CONTENT_TYPES`)
   — mavjud, saqlanadi.

**Rad etilган alternativalar:**

- *Route'ни createRoute (OpenAPI) ga o'tkazиш* — multipart orval mutator'да qo'llаб-quvvatlанmaydi
  (fayl izohи 93-95 qator). **Rad:** hand route qoladi, faqat schema qo'lда `safeParse` qilinadi.
- *Faqat orphan-cleanup, validatsiyаsиз* — 500'ни yashiradi, lekin noto'g'ri UUID hali insert'ga boradi.
  **Rad:** validatsiya birlaмchи himoya.

## 3. Spec — xulq + chekka holatlar

**Validatsiya tartibi (route ichида):**

1. Fayl mavjud + tur/hajm (mavjud, oldин).
2. `uploadImageMetadataSchema.safeParse({patientId, type, visitNoteId, title, description, toothNumbers, takenDate})`
   → fail → **400** `image.invalid_metadata` (details bilan). **Object yozилмайди.**
3. (CLI-421) ownership assert.
4. `service.upload(...)` — storage write → insert; insert throw → `deleteObject` (orphan yo'q).

**Chekka holatlar:**

- Noto'g'ri `patientId` (UUID emas) → 400, object yo'q.
- Noto'g'ri `visitNoteId` → 400.
- Invalid `takenDate` → 400 (schema `z.iso.datetime()`).
- `title` > 200 belgi → 400.
- `toothNumbers="11,foo,21"` → transform NaN'ни tashlab `[11,21]` (yoki qat'iy 400 — qaror: NaN filtr,
  mavjud xulqни saqlash).
- Insert exception (masalan DB constraint) → object o'chirилади (orphan yo'q).
- Yaxshi yo'l → 201, object + row.

**Test caselar (bun test):**

1. Bad `patientId` (non-UUID) → 400; storage'да object YO'Q (mock `uploadObject` chaqирилмади).
2. Invalid `takenDate` → 400, object yo'q.
3. `title` cap oshиши → 400.
4. Insert throw (mock) → `deleteObject(objectKey)` chaqирилди (orphan cleanup).
5. Yaxshi yo'l → 201, object + DB row mavjud.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `patient-images.routes.test.ts` (yoki integration)ga 5 case; 1-4 qizил.
2. **Impl:**
   - `patient-images.routes.ts:96-149`: `uploadImageMetadataSchema`ни import qil; form maydonларини
     yig'ib `safeParse` → fail → 400. Parse'lanган qiymatларни `service.upload`ga uzat.
   - Schema `toothNumbers` transform'ига `.filter(n => Number.isInteger(n) && n > 0)` (FDI) qo'sh.
   - `patient-images.service.ts:74-117` `upload`: storage-write + insert'ни `try { ... } catch (e) {
     await deleteObject(objectKey).catch(()=>{}); throw e }` bilan o'rа (bo'sh `!row` bloki qoladi yoki
     shu catch bilan birlаshadi).
3. **Verify:** `bun test` yashил; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya YO'Q.**
- **Xavf:** frontend hozир form-data yubоради (`api.upload()`); yangi 400'lар mijoz UI'да
  MutationCache toast bilan ko'rinади — regressiya emas, aniqroq xato. Mavjud yaxshi yo'l o'zgармаydi.
- **Backward-compat:** to'g'ri metadata bilan upload'lар avvалgидек ishlaydi.
- **Rollout:** feature-branch, TDD, lokal verify, main merge.

## 6. Qabul mezonlari

- [ ] Bad `patientId` → 400, object yozилмади.
- [ ] Invalid `takenDate` / cap oshган `title` → 400.
- [ ] Insert throw → object o'chirилди (orphan yo'q).
- [ ] Yaxshi yo'l → 201.
- [ ] `bun test` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/patient-images/patient-images.routes.ts:96-149` (schema qo'llаш)
- `apps/api/src/modules/patient-images/patient-images.schema.ts:14-31` (toothNumbers FDI filtr)
- `apps/api/src/modules/patient-images/patient-images.service.ts:74-117` (try/catch orphan cleanup)
- Testlar: `patient-images.routes`/service (API)
