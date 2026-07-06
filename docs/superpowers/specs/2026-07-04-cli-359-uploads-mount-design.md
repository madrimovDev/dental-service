# Dizayn: CLI-359 — `uploads.ts` route mount + tenant-scoping

**Sana:** 2026-07-04
**Status:** Tasdiqlangan (spec → plan)
**Linear:** CLI-359 (High)

## Maqsad

`apps/api/src/routes/uploads.ts` (`GET /uploads/:key{.+}`) hech qayerda
`apps/api/src/app.ts`ga mount qilinmagan. Natija: `storage.ts`ning
`serveUrl()` generatsiya qilgan `/uploads/${encodeURIComponent(key)}` URL
(patient-images.service.ts har bir rasm uchun `url` maydonida qaytaradi)
har doim **404** beradi — bemor rasmlari HTTP orqali umuman olinmaydi.

Mount qilishning o'zi yetarli emas: `uploads.ts` hozir faqat
`authMiddleware()` qo'llaydi (istalgan tenantdagi login qilgan foydalanuvchi),
RLS/tenant tekshiruvi yo'q — key esa tenant-scoped path
(`tenants/{tenantId}/patients/{patientId}/{imageId}.{ext}`, generator:
`patientImageKey()`, `apps/api/src/lib/s3.ts:16-24`). Mount qilingan zahoti
bu — **cross-tenant IDOR** (boshqa tenant foydalanuvchisi key'ni bilsa/
taxmin qilsa boshqa klinikaning bemor rasmini oladi). Shuning uchun mount +
tenant-check **bitta ticket doirasida, ajralmas holda** qilinadi.

## Topilgan faktlar (research)

- `apps/api/src/routes/uploads.ts:22-44` — `uploadsRoutes(storage: StorageAdapter)`
  factory, `authMiddleware()` + `GET /:key{.+}` (path-traversal himoyasi
  `storage.ts`ning `resolveSafePath` ichida, bu yerda qo'shimcha shart emas).
  `c.req.param('key')` Hono tomonidan **bir marta avtomatik decode qilingan**
  holda keladi — qayta `decodeURIComponent` chaqirilMAYDI (uploads.ts:11-18
  izohida asoslangan, boshqacha `%` bilan tugagan fayl nomlarida crash).
- `apps/api/src/lib/storage.ts:14-20` — `StorageAdapter` interfeysi
  (`save/stream/remove/exists/serveUrl`); `serveUrl(key)` →
  `` `/uploads/${encodeURIComponent(key)}` `` (storage.ts:62-64).
  `createLocalStorageAdapter(baseDir?)` — `baseDir` default
  `process.env.UPLOADS_DIR ?? DEFAULT_DIR` (storage.ts:9-12,40-41) — bir nechta
  chaqiruv bir xil `baseDir`ga ishora qiladi (state yo'q, sof config).
- `apps/api/src/lib/s3.ts:1-24` — modul-darajasida bitta
  `const storage = createLocalStorageAdapter();` instansiya yaratadi (M3/CLI-340
  MinIO→local filesystem ko'chirish). **Key format aynan shu yerda hujjatlangan:**
  ```
  tenants/{tenantId}/patients/{patientId}/{imageId}.{ext}
  ```
  (`patientImageKey()`, s3.ts:16-24) — `patient-images.service.ts` (:68-73)
  chaqiradi, so'ng `uploadObject`/`presignedGetUrl` orqali `storage.save`/
  `storage.serveUrl`ga o'tadi. **Bu — yagona producer**; `seed-demo.ts` ham
  bir xil shaklda qo'lda key yozadi (`tenants/${TENANT_ID}/patients/${id}/...`).
- `apps/api/src/middleware/auth.ts:22-46` (`authMiddleware()`) — valid JWT'dan
  `c.set('activeTenantId', claims.atid)` (`atid: string | null`,
  `apps/api/src/lib/jwt.ts:21`). Tip: `ContextVariableMap.activeTenantId?: string | null`
  (`apps/api/src/lib/audit-logger.ts:18`).
- `apps/api/src/app.ts` — `uploadsRoutes`/`storage.ts` import qilinmagan (tasdiqlangan
  grep bilan). Qiziq: app.ts:160-161 izohida **allaqachon** `/uploads/*` "yuqorida
  ro'yxatdan o'tgan" deb yozilgan — bu izoh yolg'on/oldindan yozilgan bo'lib chiqdi
  (yoki rejalashtirilgan-lekin-unutilgan) — mount qo'shilganda shu izoh to'g'ri bo'ladi.
- Kodbazada **hech qanday mavjud presedent yo'q** — path/key ichidan tenantId
  ajratib `c.get('activeTenantId')` bilan solishtiradigan boshqa joy topilmadi
  (barcha boshqa tenant-check'lar DB RLS orqali, `getDb(c)` bilan). `uploads.ts`
  filesystem-based bo'lgani uchun RLS qamrovidan **tashqarida** — bu yerda
  tekshiruv qo'lda, string darajasida qilinishi shart.

## Yondashuv

### 1. Mount (`app.ts`)

`app.ts`da bitta `createLocalStorageAdapter()` instansiya yaratiladi
(mavjud `s3.ts`dagi instansiyadan mustaqil — ikkalasi ham bir xil
`baseDir`ga (`UPLOADS_DIR` env yoki platform default) ishora qiladi, state
yo'q, shuning uchun ikkita instansiya xavfsiz) va autentifikatsiyalangan
route'lar qatoriga qo'shiladi:

```ts
import { createLocalStorageAdapter } from './lib/storage.ts';
import { uploadsRoutes } from './routes/uploads.ts';
// ...
const uploadsStorage = createLocalStorageAdapter();
app.route('/uploads', uploadsRoutes(uploadsStorage));
```

`WEB_DIST_DIR` catch-all (`app.get('*', serveStatic(...))`) dan **oldin**
joylashtiriladi — Hono aniqroq route'ni avval moslashtiradi, lekin tartib
o'qilishi uchun ham muhim (app.ts:160-161 izohi allaqachon shuni taxmin qiladi).

Ticket matnida `app.route('/uploads', uploadsRoutes({ storage }))` deb
yozilgan, lekin haqiqiy signature `uploadsRoutes(storage: StorageAdapter)`
(positional, object emas) — **haqiqiy manba signature saqlanadi**, ticket
paraphrase xato.

### 2. Tenant-scoping tekshiruvi (`uploads.ts` ichida)

Key format har doim `tenants/{tenantId}/...` bilan boshlanadi (yagona
producer `patientImageKey()`). Tekshiruv — **string-darajasida**, DB/RLS
ishtirokisiz (filesystem access RLS qamrovidan tashqarida):

```ts
const [prefix, keyTenantId] = key.split('/');
if (prefix !== 'tenants' || !keyTenantId || keyTenantId !== activeTenantId) {
  return c.json(fail('NOT_FOUND', 'File not found'), 404);
}
```

**403 emas, 404 qaytariladi** — qaror: fayl mavjudligini boshqa tenantga
oshkor qilmaslik (mavjud `!storage.exists(key)` branch bilan bir xil kod —
enumeration orqali "bu key boshqa tenantda mavjud ekan" ma'lumotini oldini
olish). Ticket "403/404" deb ikkalasini ham qabul qiladi — 404 tanlanadi
mavjud uslub bilan izchillik uchun.

`activeTenantId` `undefined`/`null` bo'lishi mumkin emas bu route'da —
`authMiddleware()` allaqachon 401 bilan bloklaydi token yo'q/invalid bo'lsa;
lekin `atid: null` (workspace hali tanlanmagan holat, jwt.ts:21) bo'lsa
`keyTenantId !== null` solishtiruvi baribir mos kelmaydi → 404 (xavfsiz
default, RLS middleware'dagi "tenantId yo'q → 0 row" konvensiyasi bilan izchil).

## Global cheklov

**Cross-tenant fayl kirish HAR QANDAY holatda bloklanishi shart.** Bu —
ticket'ning yagona xavfsizlik talabi: mount qilingandan keyin ham boshqa
tenant foydalanuvchisi (haqiqiy, valid JWT bilan, faqat boshqa
`activeTenantId`) o'z tenantiga tegishli bo'lmagan key'ni so'rasa —
natija har doim 404 (fayl mavjud/yo'qligidan qat'i nazar bir xil javob
shakli) bo'lishi kerak, hech qachon fayl bytelarini qaytarmasligi kerak.

## DoD

- [ ] `apps/api/src/app.ts`ga `app.route('/uploads', uploadsRoutes(uploadsStorage))`
      qo'shilgan (`createLocalStorageAdapter()` instansiya bilan), `WEB_DIST_DIR`
      catch-all'dan oldin.
- [ ] `apps/api/src/routes/uploads.ts` ichida key'dagi `tenants/{tenantId}` segmenti
      `c.get('activeTenantId')` bilan solishtiriladi; mos kelmasa 404 (`fail('NOT_FOUND', ...)`).
- [ ] Integratsion test (`apps/api/tests/integration/cli-359-uploads-mount.test.ts`,
      real `createApp()` + real JWT (`signAccess`) + real fayl (`createLocalStorageAdapter`
      bilan tmp-dir'ga yozilgan)):
  - O'z tenant JWT bilan `GET /uploads/:key` → 200, fayl bytelari mos.
  - Boshqa tenant JWT bilan xuddi shu key'ga `GET` → 404 (403 emas — yuqoridagi qaror).
  - `Authorization` header'siz → 401 (mount tasdiqlash regressiyasi).
- [ ] `bun --filter @dental/api typecheck` va tegishli test fayli yashil.
- [ ] Follow-up qatorlar CLAUDE.md'dagi "Ma'lum follow-up'lar" ro'yxatidan
      `uploads.ts` mount qilinmagan degan band olib tashlanadi/yangilanadi
      (hujjat yangilash — implementatsiya bosqichida, alohida commit emas shart emas).

## Tashqarida (non-goals)

- MinIO/S3 presigned URL qaytarish — Local Desktop offline arxitekturasi
  o'zgarmaydi (RFC/qaror CLI-340 allaqachon local filesystem'ga o'tgan).
- `requireModule` mount qilish, `/activate` frontend sahifasi, `/settings` IPC
  bridge — bular CLAUDE.md'dagi **boshqa** ochiq follow-up'lar, bu ticket
  doirasida emas.
- Rasm o'chirilganda (`patient-images` DELETE) storage tozalash — mavjud
  xulq o'zgarmaydi, bu ticket faqat GET route mount+tenant-check haqida.
