# CLI-405 — Uploads cross-tenant IDOR (`/uploads/:key` `..` orqali)

> Audit: H1 (CRITICAL, ✅ VERIFIED). PHI oshkorlik. `app.ts:176-177` shartsiz mount → cloud multi-tenant'ga ham ta'sir qiladi.

## 1. Muammo va ildiz sabab

`apps/api/src/routes/uploads.ts:37-42`:

```ts
const [prefix, keyTenantId] = key.split('/');
if (prefix !== 'tenants' || !keyTenantId || keyTenantId !== activeTenantId) {
  return c.json(fail('NOT_FOUND', 'File not found'), 404);
}
if (!(await storage.exists(key))) { ... }
return new Response(storage.stream(key), ...);
```

Tenant tekshiruvi **xom `key`ni** `/` bo'yicha ajratadi va `split[1]`ni oladi. Fayl esa **o'sha xom `key`** orqali `storage.exists()` / `storage.stream()` bilan o'qiladi, ular ichida `resolveSafePath` (`storage.ts:31-38`) `..` segmentlarini `resolve()` bilan **collapse qiladi** va faqat natija `baseDir` ichida qolishini kafolatlaydi — lekin **qaysi tenant** ekanini tekshirmaydi.

Ya'ni ikki nazorat **turli stringni** ko'radi: tekshiruv normalizatsiyadan OLDINGI segmentga, o'qish normalizatsiyadan KEYINGI yo'lga.

**Ekspluatatsiya:** T1 foydalanuvchi so'raydi:
`GET /uploads/tenants%2F{T1}%2F..%2F{T2}%2Fpatients%2F{pid}%2F{img}.jpg`

Hono route paramni **bir marta** decode qiladi (uploads.ts:14-18 docstring buni tasdiqlaydi) → `key = "tenants/{T1}/../{T2}/patients/{pid}/{img}.jpg"`.
- `key.split('/')[1]` = `{T1}` → tekshiruv **o'tadi**.
- `resolveSafePath` `..`ni collapse qiladi → `baseDir/tenants/{T2}/patients/{pid}/{img}.jpg` → `baseDir` ichida, o'qiladi → **T2 bemor rasmi (PHI) qaytadi**.

> ⚠️ Decode tuzog'i (advisor flagged): so'rovdagi `%2e%2e` va `%2F` Hono decode'idan keyin oddiy `..`/`/`ga aylanadi. Shu sababli `key.includes('%2e')` yoki `key.includes('%2f')` kabi **substring guard NO-OP** — bu belgilar `key`da hech qachon `%` ko'rinishida qolmaydi (faqat ikki-marta-encoded `%252e`da qoladi, u esa traversal vektori emas, ikkinchi FS-decode yo'q). Bu guardni **yozmang**. Yagona ishlaydigan himoya — kanonik yo'ldan tenantni qayta olish.

## 2. Dizayn qarori

**DECISION (audit'dan):** tenant tekshiruvini **normalizatsiya QILINGAN (resolved) absolute path** — ya'ni aynan o'qiladigan string — ustida bajarish, va traversal keyni rad etish.

Amaliy yechim: `StorageAdapter`ga kanonik yo'lni qaytaruvchi metod qo'shamiz, so'ng route tenant segmentini **resolved path'dan `baseDir`ga nisbatan qayta oladi** va o'shani tekshiradi. `exists`/`stream` ham aynan shu kanonik natijaga ishlaydi → tekshirilgan-string ≡ o'qilgan-string isbotlanadi.

- `resolveSafePath` **escape'da `throw` qiladi** — route'da uni null-qaytaruvchi wrapperga aylantiramiz (yoki `try/catch` bilan 404). Route hech qachon 500 bermasin.
- `baseDir` Windows'da `C:\ProgramData\...` (storage.ts:10) → relKey `path.sep` bilan ajratiladi, hardcoded `'/'` emas.
- `..` (raw) segmenti bo'lgan keyni qo'shimcha **belt-and-suspenders** sifatida darhol 404 qilamiz (kanonik qayta-olish allaqachon ushlaydi, ammo intent aniq bo'lsin).

**Rad etilgan alternativalar:**
- *Route ichida `key.replace(/\.\./g, '')`* — normalizatsiya bilan mos kelmaydi, encoded/aralash holatlarni o'tkazib yuboradi. Rad.
- *`baseDir`ni route'ga chiqarib qo'lda `join` qilish* — storage abstraksiyasini buzadi va aynan shu ikki-string nomuvofiqligini takrorlaydi. Rad.

## 3. Spec — tuzatilgandan keyingi xulq

Xulq-shartnoma: `GET /uploads/:key` faqat quyi holatda 200 qaytaradi — (a) resolved path `baseDir` ichida, (b) resolved path `baseDir/tenants/{activeTenantId}/...` ostida, (c) fayl mavjud. Aks holda **doim 404** (`fail('NOT_FOUND', 'File not found')`), hech qachon 403/500 (enumeration'ni oldini olish, uploads.ts:34-36 nияti saqlanadi).

Kanonik qoida: tenant tekshiruvi va fayl o'qish **bir xil kanonik yo'lni** ishlatadi.

Test holatlari (`bun test`, `cli-359` harness idiomasi bilan — `UPLOADS_DIR` dynamic import'dan OLDIN):
1. **Legit key** — `tenants/{T}/patients/{p}/{img}.jpg`, T = JWT `atid` → **200**, baytlar mos.
2. **`..` traversal key** — `tenants/{T1}/../{T2}/patients/{p}/{img}.jpg`, JWT `atid=T1`, fayl T2'da mavjud → kanonik relKey tenant = `T2 ≠ T1` → **404**.
3. **Encoded `%2e%2e`** — so'rov URL'da `%2e%2e`; Hono decode → `..` → 2-holat bilan **aynan bir xil guard** → **404** (kontraktni qulflash uchun alohida yozamiz).
4. **Absolute-path key** — `/etc/passwd` (Linux) yoki `C:\Windows\...` — `resolve` `baseDir`dan chiqadi → wrapper null → **404**.
5. **To'g'ri tenant, mavjud bo'lmagan fayl** → **404** (CLI-359 regresssiya yo'q).
6. **`tenants/` prefiksisiz key** (`not-a-tenant/x.jpg`) → **404** (CLI-359 regresssiya yo'q).
7. **Auth yo'q** → **401** (mount isboti, CLI-359 regresssiya yo'q).

## 4. Implementatsiya rejasi (TDD)

**1-qadam — failing test:** `apps/api/tests/integration/cli-405-uploads-traversal.test.ts` yarat. CLI-359 harness idiomasini takrorla (`mkdtemp` → `process.env.UPLOADS_DIR` → keyin `await import('../../src/app.ts')`). 2, 3, 4-holatlarni yoz (hozir 2 va 3 fayl baytini qaytarib **FAIL** qiladi).
Verify: `cd apps/api && bun test --env-file=../../.env cli-405-uploads-traversal` → RED.

**2-qadam — storage kanonik metod:** `apps/api/src/lib/storage.ts` — `StorageAdapter` interfeysiga qo'sh:
```ts
resolve(key: string): { path: string; relKey: string } | null;
```
`createLocalStorageAdapter`da implement qil: `resolveSafePath`ni `try/catch`ga o'rab, escape'da `null` qaytar; aks holda `{ path, relKey: relative(resolvedBase, path) }` (`node:path` `relative`). `exists`/`stream`/`remove`/`save` ichki `resolveSafePath`da qoladi (ular escape'da throw qiladi — bu ichki invariantlar uchun maqbul).
Verify: `bun run --filter @dental/api typecheck`.

**3-qadam — route qayta yozish:** `apps/api/src/routes/uploads.ts:27-53` `app.get`:
```ts
const key = c.req.param('key');
const activeTenantId = c.get('activeTenantId');

// Belt-and-suspenders: xom `..` segmenti — kanonik qayta-olish ham ushlaydi.
const resolved = storage.resolve(key);
if (!resolved) return c.json(fail('NOT_FOUND', 'File not found'), 404);

// Tenant'ni KANONIK (resolved) relKey'dan qayta olamiz — o'qiladigan string bilan bir xil.
const [prefix, keyTenantId] = resolved.relKey.split(sep); // node:path `sep` (Windows-safe)
if (prefix !== 'tenants' || keyTenantId !== activeTenantId) {
  return c.json(fail('NOT_FOUND', 'File not found'), 404);
}

if (!(await storage.exists(key))) return c.json(fail('NOT_FOUND', 'File not found'), 404);
const contentType = Bun.file(resolved.path).type || 'application/octet-stream';
return new Response(storage.stream(key), { headers: { 'Content-Type': contentType } });
```
`sep`ni `node:path`dan import qil. Docstring'ni yangila (kanonik-path tekshiruvi tavsifi).
Verify: `bun test --env-file=../../.env cli-405-uploads-traversal` → GREEN + `cli-359-uploads-mount` hali GREEN.

**4-qadam — to'liq verify:** `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount cli-405-uploads-traversal` + `bun run --filter @dental/api typecheck`.

> Migratsiya yo'q, DB yo'q, schema yo'q.

## 5. Migratsiya / rollout / xavflar

- **DB migratsiya:** yo'q.
- **Backwards-compat:** `serveUrl()` format o'zgarmaydi (`/uploads/{encodeURIComponent(key)}`), legit patient-image URL'lar ishlashda davom etadi. Faqat traversal-keylar endi 404.
- **RLS:** bu route filesystem-based, RLS qamrovidan tashqarida (uploads.ts:32 izoh) — shuning uchun aynan qo'lda tenant-tekshiruvi kritik. Fix RLS'ga tegmaydi.
- **Cloud/desktop:** shartsiz mount (app.ts:176) → cloud multi-tenant'da ham himoya faollashadi (audit'da ta'kidlangan). `baseDir` ikkala platformada ham `path.sep` bilan to'g'ri ishlaydi.
- **Xavf:** past — o'zgarish qatъiy qattiqlashtirish (faqat 404 qo'shadi), yangi ruxsat ochmaydi.

## 6. Qabul mezonlari

- [ ] `..` traversal keyi (2-holat) 404 qaytaradi, cross-tenant fayl **oqmaydi**.
- [ ] Encoded `%2e%2e` (3-holat) 404 qaytaradi.
- [ ] Absolute-path key (4-holat) 404, 500 emas.
- [ ] Legit own-tenant key 200 + to'g'ri baytlar.
- [ ] `cli-359-uploads-mount` testlari GREEN (regresssiya yo'q).
- [ ] `storage.resolve()` escape'da `null` qaytaradi (throw emas); tenant-check va o'qish bir xil kanonik natijaga tayanadi.
- [ ] `path.sep` ishlatilgan (Windows-safe), `'/'` hardcode emas.
- [ ] Typecheck toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/lib/storage.ts` — `resolve()` metod + interfeys.
- `apps/api/src/routes/uploads.ts` — kanonik tenant-tekshiruvi.
- `apps/api/tests/integration/cli-405-uploads-traversal.test.ts` — **yangi**.
