# CLI-362 — `.lic` RSA signature verifikatsiyasi (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-362 (High, security)
> **Scope:** `apps/api/src/lib/license.ts` (`isLicenseValid`) + yangi `packages/core/src/supervisor-public-key.ts` + `packages/core/src/license-signature.ts`.

---

## 1. Maqsad (Goal)

`apps/api/src/lib/license.ts:86-90`dagi `isLicenseValid()` faqat `expiresAt` + `gracePeriodDays`ni tekshiradi, `LicenseData.signature`ni **hech qachon** tekshirmaydi (kodda `TODO(security)` kommentariyasi shu holatni allaqachon belgilab qo'ygan, license.ts:78-85). AES kalit `getFingerprint()`dan hosil qilinadi va bu sir emas — mahalliy admin `getFingerprint()`ni o'zi chaqirib xuddi shu kalitni hisoblab, ixtiyoriy `modules`/`expiresAt` bilan `.lic` faylni qayta yozib, `requireModule` module-gating'ni to'liq chetlab o'tishi mumkin (barcha modullarni faollashtirib qo'yish yoki litsenziya muddatini cheksiz uzaytirish).

Supervisor allaqachon har bir `.lic` javobni RSA-2048/SHA-256 bilan imzolaydi (`apps/supervisor-api/src/modules/licenses/licenses.service.ts:19` — `signLicense(payload, PRIVATE_KEY)`), lekin client (`apps/api`) tomonda bu imzo hech qachon tekshirilmaydi. Maqsad — client tomonda ochiq kalit bilan signature verifikatsiyasini qo'shish, shunda soxta/qo'lda tahrirlangan `.lic` fayl har doim rad etiladi.

---

## 2. Topilgan aniq holat (investigation)

### 2.1 Supervisor tomonida imzolash — o'zgarmaydi

`apps/supervisor-api/src/lib/rsa.ts` (to'liq, o'zgarmaydi):

```ts
import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';

const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());

export const generateKeyPair = (): { privateKey: string; publicKey: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
};

export const signLicense = (data: object, privateKeyPem: string): string => {
  const sign = createSign('SHA256');
  sign.update(canonicalize(data));
  return sign.sign(privateKeyPem, 'hex');
};

export const verifySignature = (data: object, signature: string, publicKeyPem: string): boolean => {
  try {
    const verify = createVerify('SHA256');
    verify.update(canonicalize(data));
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
};
```

`licenses.service.ts` imzolangan payload aynan quyidagi 6 maydon (signature'siz):

```ts
const payload = {
  licenseKey: lic.licenseKey,
  clinicId: lic.clinicId,
  modules: lic.modules as string[],
  expiresAt: lic.expiresAt.toISOString(),
  gracePeriodDays: lic.gracePeriodDays,
  issuedAt,
};
// { ...payload, signature: signLicense(payload, PRIVATE_KEY) }
```

`apps/api/src/lib/license-client.ts` bu javobni bevosita `LicenseData` sifatida qabul qiladi (`activateLicense`/`sendHeartbeat`) — demak client tomonda `LicenseData`dan `signature`ni ayirib qolganda payload **aynan** shu 6 maydon bilan mos keladi (`canonicalize` kalitlarni sort qilgani uchun property tartibi ahamiyatsiz, lekin **maydonlar to'plami** aniq mos bo'lishi shart).

### 2.2 Xususiy kalit qayerda yashaydi (2-3 qadam topilma)

- `licenses.service.ts:6`: `const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY!; // VPS env'dan` — kalit **faqat env var**, hech qachon fayl/DB'da persist qilinmaydi.
- `infra/supervisor/README.md:23-41` va `infra/supervisor/.env.production.example` bu jarayonni aniq hujjatlashtirgan: kalit **bir marta, umrbod** `generateKeyPair()` bilan qo'lda generatsiya qilinadi (`bun -e "..."`), `privateKey` → VPS'ning `.env.production`iga (repo'ga hech qachon commit qilinmaydi), `publicKey` → **qo'lda copy-paste** `packages/core/supervisor-public-key.ts`ga. README so'zma-so'z: *"Rotating it invalidates every previously issued license signature, so treat it as a long-lived root of trust."*
- Bu jarayon **hali bajarilmagan** — `packages/core/supervisor-public-key.ts` fayli mavjud emas (`ls packages/core/src` — yo'q).
- Lokal dev muhitda `apps/supervisor-api/.env` (gitignored, `.gitignore:16`) ichida **allaqachon** bitta generatsiya qilingan `RSA_PRIVATE_KEY` PEM bor (real qiymat bilan to'ldirilgan — `.env.example`da bo'sh, `.env`da to'ldirilgan). Bu — dev/lokal test uchun generatsiya qilingan kalit, lekin **hech qanday joyda mos ochiq kalit fayl sifatida saqlanmagan** (faqat xotirada, `generateKeyPairSync` chaqiruvi paytida).
- `apps/supervisor-api/src/lib/rsa.test.ts` va docs/superpowers/plans/2026-06-29-supervisor-service.md — faqat `generateKeyPair()` runtime'da chaqirilib sinaladi (round-trip test); hech qanday joyda public key **artefakt** sifatida yozib qo'yilmagan.

**⚠️ OCHIQ SAVOL (flag, invent qilinmadi):** Bu qadamda "Supervisor'ning haqiqiy ochiq kaliti" deb ataladigan narsa hali **mavjud emas** — na production uchun alohida generatsiya qilingan, na dev-.env'dagi kalitning ochiq juftligi hech qayerda saqlanган. Ikki variant bor, tanlov **foydalanuvchi/operator qaroriga** qoldiriladi (buni avtonom agent hal qila olmaydi, chunki bu litsenziya root-of-trust qarori):
  1. **Dev-.env'dagi mavjud kalitni "doimiy" deb hisoblash** — undan `crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' })` bilan ochiq kalitni hosil qilib, shuni `supervisor-public-key.ts`ga yozish (loyiha hali production'da emas — solo-dev, birinchi real deploy oldidan).
  2. **Yangi, sof production kaliti generatsiya qilish** (`infra/supervisor/README.md`dagi bir martalik snippet bilan) — production VPS `.env.production`iga yangi `RSA_PRIVATE_KEY`, va o'sha yangi juftlikning ochiq qismini `supervisor-public-key.ts`ga yozish (dev-.env'dagi eski kalit faqat lokal test uchun qoladi).
  
  Bu qaror **implementatsiya boshlanishidan oldin** operator tomonidan olinishi kerak — quyidagi Plan buni **Task 1 (TDD, test-keypair bilan)**dan ajratilgan alohida **qo'lda bajariladigan qadam** sifatida belgilaydi, chunki asosiy verify-logikasi test kaliti bilan to'liq TDD qilinadi va haqiqiy kalitga bog'liq emas.

### 2.3 Cross-package import savoli — `apps/api` `apps/supervisor-api`'dan `verifySignature`ni import qila oladimi?

**Yo'q, to'g'ridan-to'g'ri emas.** Tekshirildi:
- `apps/api/package.json` `dependencies`: `@dental/core`, `@dental/db-schema`, `@dental/fiscal`, ... — `@supervisor/api` **yo'q**.
- `apps/supervisor-api/package.json`: `name: "@supervisor/api"`, `private: true`, **`exports` maydoni yo'q** — bu paket workspace ichida boshqa app tomonidan import qilinishga mo'ljallanmagan (oddiy app, kutubxona emas).
- CLAUDE.md/memory (`project_dental_service.md`, Supervisor bo'limi): `@supervisor/*` **qasddan** `@dental/*`dan alohida mahsulot deb belgilangan — "Supervisor'ning boshqa mahsuloti, lekin bir repoda". Ikkala app orasiga workspace-dependency qo'shish bu izolyatsiyani buzadi (bitta app deploy qilinganda ikkinchisi build-vaqtida talab qilinishi mumkin, ikki mustaqil deploy sikliga qarshi).
- Xulosa (qaror): `verifySignature`ni **`apps/supervisor-api`dan import qilish EMAS**, balki **verify-only** minimal versiyasini `packages/core`ga **dublikat** qilib qo'shish (`packages/core/src/license-signature.ts`, quyida). `apps/supervisor-api/src/lib/rsa.ts` o'zgarmaydi (sign+verify+generateKeyPair — Supervisor'ning o'z ehtiyoji uchun qoladi). Bu — kod duplikatsiyasi (canonicalize+verify, ~10 qator) lekin ikkita mustaqil deploy siklidagi mahsulot orasiga yangi bog'liqlik qo'shishdan xavfsizroq va CLAUDE.md arxitektura qaroriga mos (`packages/core` — `@dental/*` apps orasidagi umumiy joy, ticket ham aynan shu joyni ko'rsatgan).
  - **Maintenance eslatma:** Agar kelajakda `apps/supervisor-api/src/lib/rsa.ts`dagi `canonicalize`/imzolash algoritmi o'zgarsa (masalan SHA256→SHA384), `packages/core/src/license-signature.ts` ham **qo'lda** sinxronlanishi shart — ikkalasi orasida avtomatik tekshiruv yo'q (faqat integration darajasida, real activation orqali sinaladi).

### 2.4 `packages/core` eksport konvensiyasi

`packages/core/src/index.ts` (to'liq):

```ts
// @dental/core — shared types, Zod schemas, business logic, permissions catalog

export * from './diagnoses-seed.ts';
export * from './permissions.ts';
export * from './role-templates.ts';
export * from './types/api-response.ts';
export * from './vertical-features.ts';
```

`package.json` `exports`: `{".": "./src/index.ts", "./*": "./src/*"}` — demak subpath import (`@dental/core/supervisor-public-key`) `packages/core/src/supervisor-public-key.ts`ga to'g'ridan to'g'ri resolve bo'ladi, `index.ts` orqali o'tmasdan ham. Yangi fayllar **ikkalasi** orqali ochiladi: (a) `index.ts`ga `export * from './supervisor-public-key.ts';` + `export * from './license-signature.ts';` qo'shiladi (konvensiya), (b) `apps/api/src/lib/license.ts` esa **subpath import**ni ishlatadi (`@dental/core/supervisor-public-key`, `@dental/core/license-signature`) — sababi §3.2da.

---

## 3. Yondashuv (Approach)

### 3.1 Yangi fayllar

**`packages/core/src/supervisor-public-key.ts`:**
```ts
// Supervisor'ning RSA ochiq kaliti — .lic imzosini offline tekshirish uchun.
// Xususiy juftlik FAQAT Supervisor VPS `.env.production`ida (RSA_PRIVATE_KEY),
// bu repo'ga hech qachon kirmaydi. Ushbu fayl qo'lda copy-paste bilan
// to'ldiriladi (infra/supervisor/README.md "RSA keypair generation").
// ⚠️ Rotatsiya — barcha oldin chiqarilgan litsenziya imzosini bekor qiladi.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
<OPERATOR: infra/supervisor/README.md §"RSA keypair generation"dagi
bir martalik snippet bilan hosil qilingan HAQIQIY ochiq kalitni shu yerga
qo'ying — §2.2dagi ochiq savol hal qilinmaguncha bu placeholder qoladi>
-----END PUBLIC KEY-----
`;
```

**Qasddan fail-closed placeholder:** yuqoridagi matn haqiqiy PEM emas — `verifySignature`/`createVerify` uni PEM sifatida parse qila olmay `throw` qiladi, `license-signature.ts`dagi `try/catch` buni ushlab `false` qaytaradi. Natija: **operator haqiqiy kalitni qo'ymaguncha, `isLicenseValid()` HAR DOIM `false` qaytaradi** — ya'ni yangi kod fail-open emas, fail-closed defolt bilan tushadi (xavfsizroq — placeholder bilan hech qanday `.lic` "tasodifan" valid deb qabul qilinmaydi). Bu ataylab shunday — real Supervisor kaliti kiritilmaguncha production'da faollashtirish umuman ishlamaydi va bu **ko'zga tashlanadi** (jim security-hole emas).

**`packages/core/src/license-signature.ts`:**
```ts
import { createVerify } from 'node:crypto';

// apps/supervisor-api/src/lib/rsa.ts'dagi `canonicalize`+`verifySignature`ning
// verify-only dublikati (§2.3 — cross-app import emas, qasddan ajratilgan).
// Ikkalasi SINXRON saqlanishi shart (algoritm o'zgarsa ikkalasi ham yangilanadi).
const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());

export const verifyLicenseSignature = (
  data: object,
  signature: string,
  publicKeyPem: string,
): boolean => {
  try {
    const verify = createVerify('SHA256');
    verify.update(canonicalize(data));
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
};
```

### 3.2 `apps/api/src/lib/license.ts` o'zgarishi

```ts
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { SUPERVISOR_PUBLIC_KEY_PEM } from '@dental/core/supervisor-public-key';

export const isLicenseValid = (data: LicenseData): boolean => {
  const { signature, ...payload } = data;
  if (!verifyLicenseSignature(payload, signature, SUPERVISOR_PUBLIC_KEY_PEM)) {
    return false;
  }
  const expiry = new Date(data.expiresAt).getTime();
  const grace = data.gracePeriodDays * 86400000;
  return Date.now() < expiry + grace;
};
```

`{ signature, ...payload }` destructuring `payload`ni aynan `{ licenseKey, clinicId, modules, expiresAt, gracePeriodDays, issuedAt }`ga tenglashtiradi — bu `licenses.service.ts:9-16`dagi imzolangan payload bilan **maydon-ma-maydon** mos (§2.1). Subpath import (barrel `@dental/core` emas) tanlandi, chunki mavjud `license.test.ts` `mock.module('@dental/core/supervisor-public-key', ...)` orqali **faqat** ochiq kalitni almashtirishi kerak, `@dental/core`ning qolgan eksportlariga (`fail`, `ok`, `permissions` va h.k., boshqa fayllarda ishlatiladigan) tegmasdan — barrel-darajasida mock qilish `...realCore` spread talab qiladi va boshqa test fayllariga side-effect xavfi tug'diradi (xuddi `license-middleware.test.ts`dagi izohda tasvirlangan racy-mock muammosi kabi, o'sha yerda `./license` uchun).

### 3.3 Test strategiyasi — mavjud fixture'lar bilan ziddiyat yo'qligi tasdiqlangan

Tekshirilgan barcha mavjud test fixture'lar (`signature: 'mock-signature'` / `'sig'` / `'rsa-sig'`):
- `apps/api/src/lib/license.test.ts` — `isLicenseValid` describe blokida faqat **muddati o'tgan** litsenziya sinaladi (`expiresAt` 60 kun oldin). Yangi signature-check qo'shilgandan keyin ham natija **hali ham `false`** bo'ladi (endi ikkita sabab bilan: signature invalid VA muddati o'tgan) — mavjud assertion buzilmaydi, o'zgartirish shart emas. `writeLicense`/`readLicense` round-trip testi `isLicenseValid`ni chaqirmaydi — tegilmaydi.
- `apps/api/src/lib/license-client.test.ts` (`signature: 'rsa-sig'`) — faqat `activateLicense`/`sendHeartbeat`ning HTTP-javob shaklini tekshiradi, `isLicenseValid`ni chaqirmaydi — tegilmaydi.
- `apps/api/src/routes/activate.test.ts` (`signature: 'sig'`) — `writeLicense`ni mock qilib faqat route xulqini (`writeLicenseCalls`) tekshiradi, `isLicenseValid`ni chaqirmaydi — tegilmaydi.
- `apps/api/src/lib/license-middleware.test.ts` — `getActiveModules`ni **butunlay** mock qiladi (`mock.module('./license', () => ({ ...realLicense, getActiveModules: async () => activeModules }))`), `isLicenseValid` yo'liga umuman kirmaydi — tegilmaydi.

**Xulosa:** hech qanday mavjud test signature-check qo'shilgani sababli buzilmaydi. Yagona yangi narsa — `license.test.ts`ga **yangi describe blok** qo'shiladi: test-keypair bilan imzolangan (haqiqiy, muddati o'tmagan) litsenziya `isLicenseValid`dan `true` qaytarishi, va shu litsenziyaning `modules`/`expiresAt` maydoni o'zgartirilgani (signature endi mos kelmaydi) `false` qaytarishi — bu ticket DoD'idagi "fingerprint-forge stsenariysi rad etiladi" talabini bevosita tasdiqlaydi. Test o'z `mock.module('@dental/core/supervisor-public-key', ...)` bilan test-kalitni almashtiradi (haqiqiy `SUPERVISOR_PUBLIC_KEY_PEM` placeholder'iga bog'liq emas).

---

## 4. Global constraint

1. **Verifikatsiya har qanday mos kelmaydigan signature'li `.lic`ni rad etishi shart** — `isLicenseValid()` signature-check'ni **eng birinchi** qadam qilib qo'yadi (expiry-check'dan oldin), fail-closed (`try/catch` → `false`, throw emas).
2. **Mavjud valid activation flow buzilmasligi kerak** — `apps/api/src/routes/activate.ts` `isLicenseValid()`ni umuman chaqirmaydi (faqat `writeLicense`), shuning uchun activation route o'zgarishsiz qoladi; ta'sir faqat keyinchalik `requireModule`/`getActiveModules()` chaqirilganda seziladi. Production/real Supervisor bilan ishlaydigan **haqiqiy** end-to-end oqim faqat §2.2dagi ochiq savol hal qilingandan (haqiqiy public key joylashtirilgandan) keyin to'liq ishlaydi — bu tabiiy, chunki hozir signature umuman tekshirilmayapti.
3. **Test/dev fixture'lar haqiqiy kalitga bog'liq bo'lmasligi kerak** — barcha yangi/mavjud test test-keypair (`generateKeyPairSync` inline) yoki mock qilingan `SUPERVISOR_PUBLIC_KEY_PEM` bilan ishlaydi; CI/lokal `bun test` hech qachon haqiqiy production kalitiga bog'liq bo'lmaydi.
4. **`apps/supervisor-api/src/lib/rsa.ts` o'zgarmaydi** — faqat `packages/core`ga verify-only dublikat qo'shiladi (§2.3). Supervisor'ning o'z testlari (`rsa.test.ts`) tegilmaydi.
5. **`packages/core/src/supervisor-public-key.ts`dagi placeholder** haqiqiy PEM emasligi ochiq qoladigan bo'lsa, bu **loyihaning birinchi haqiqiy production deploy'igacha** normal holat (loyiha hali production'da emas) — lekin shu fayl mavjud bo'lgani (garchi placeholder bo'lsa ham) ticket DoD'ining "fayl yaratiladi" qismini qanoatlantiradi; "haqiqiy kalit bilan" qismi operator qo'lda bajarishi kerak bo'lgan alohida qadam (§2.2, Plan'da alohida belgilangan).

---

## 5. DoD

- [ ] `packages/core/src/supervisor-public-key.ts` yaratiladi, `index.ts`ga qo'shiladi (`export * from './supervisor-public-key.ts';`) — hozircha fail-closed placeholder bilan (§2.2 ochiq savol operator tomonidan hal qilinmaguncha).
- [ ] `packages/core/src/license-signature.ts` yaratiladi (`verifyLicenseSignature`), `index.ts`ga qo'shiladi.
- [ ] `apps/api/src/lib/license.ts`dagi `isLicenseValid()` endi signature'ni ham tekshiradi — noto'g'ri/mos kelmaydigan signature → `false` (expiry'dan qat'i nazar).
- [ ] Yangi test (`apps/api/src/lib/license.test.ts`): test-keypair bilan imzolangan valid litsenziya → `true`; keyin `modules`/`expiresAt` o'zgartirilgan (signature endi mos emas) → `false` — mavjud fingerprint-forge stsenariysi endi rad etilishini tasdiqlaydi.
- [ ] Barcha mavjud testlar (`license.test.ts`, `license-client.test.ts`, `activate.test.ts`, `license-middleware.test.ts`) o'zgarishsiz yashil qoladi (§3.3 tasdiqlangan).
- [ ] `bun run typecheck` (root yoki `apps/api` + `packages/core`) toza.
- [ ] **Operator qadam (kod tashqarisida, ticket'dan tashqari follow-up sifatida hujjatlashtiriladi):** §2.2dagi ochiq savolni hal qilib, haqiqiy Supervisor ochiq kalitini `supervisor-public-key.ts`ga joylashtirish — bu qadam bajarilmaguncha real (mock qilinmagan) `.lic` fayllarning barchasi invalid deb hisoblanadi (fail-closed, xavfsiz defolt).
