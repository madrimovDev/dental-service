# CLI-391 — Supervisor Admin "Qayta faollashtirish" tugmasi noma'lum qiymat (fingerprint) so'raydi (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-391 (Medium)
> **Scope:** `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` (reactivate mutation + license info bloki) va uning test fayli `ClinicDetailPage.test.tsx`. **Hech qanday backend o'zgarishi yo'q** (§1.2 ga qarang — sabab).

---

## 1. Topilgan holat (kod o'qish natijasi)

### 1.1 Muammo — `ClinicDetailPage.tsx:55-72`

```tsx
const reactivate = useMutation({
  mutationFn: async () => {
    if (!data?.license) return;
    const fp = prompt('Yangi fingerprint kiriting:');
    if (!fp) return;
    const res = await authFetch('/v1/reactivate', {
      method: 'POST',
      body: JSON.stringify({ licenseKey: data.license.licenseKey, fingerprint: fp }),
    });
    if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
  },
  onSuccess: () => setMutationError(null),
  onError: (err) => { ... },
});
```

`prompt()` admin'dan qiymat so'raydi, lekin `fingerprint` — `apps/api/src/lib/license.ts:32-43`dagi `getFingerprint()` orqali klinikaning **o'z mashinasida** CPU/system/tarmoq ma'lumotlaridan hisoblangan SHA-256 hex hash (64 belgi). Bu qiymat hech qachon supervisor-admin operatoriga ekranda ko'rinmaydi va u buni "bila olmaydi" — ticket sarlavhasidagi ayni shu.

### 1.2 Muhim topilma: fingerprint **allaqachon** DB'da saqlanadi va GET javobida qaytadi — yangi backend endpoint SHART EMAS

- `apps/supervisor-api/src/db/schema.ts:22-40` — `licenses` jadvali `fingerprint: text('fingerprint')` ustuniga ega (birinchi muvaffaqiyatli `/v1/activate` chaqiruvida yoziladi — `licenses.service.ts:24-47`ning `activate()` metodi).
- `apps/supervisor-api/src/modules/clinics/clinics.routes.ts:121-132` — `GET /v1/admin/clinics/:id` handler `db.query.licenses.findFirst(...)`ni **to'liq Drizzle row** sifatida qaytaradi (`{ clinic, license }`), ustunlarni filtrlab tashlamasdan. Ya'ni `fingerprint` maydoni javobda **allaqachon bor**.
- `apps/supervisor-admin/src/features/clinics/clinics.types.ts:9-23` — frontend `License` interfeysi ham `fingerprint: string | null;`ni **allaqachon e'lon qilgan** (14-qator). `ClinicDetailPage.tsx` bu maydonni hech qayerda o'qimaydi — faqat e'lon qilingan, ishlatilmagan.
- `apps/supervisor-admin/src/features/clinics/clinics.api.ts:10-14` (`fetchClinicDetail`) — o'zgarishsiz `res.json()` qaytaradi, backend javobini qisqartirmaydi.

**Xulosa:** `data.license.fingerprint` component ichida **hozir ham mavjud** — faqat (a) ekranda ko'rsatilmagan va (b) reactivate oqimida ishlatilmagan, o'rniga `prompt()` orqali qayta so'ralgan. Bu **sof display + wiring fix** — yangi endpoint, yangi DB ustun, yangi response maydon kerak emas.

### 1.3 Reactivate'ning haqiqiy semantikasi (nega saqlangan qiymatni qayta yuborish to'g'ri)

`apps/supervisor-api/src/modules/licenses/licenses.service.ts:68-84` (`reactivate()`):
```ts
async reactivate(licenseKey: string, newFingerprint: string) {
  const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
  if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 404 });
  await db.update(licenses)
    .set({ fingerprint: newFingerprint, lastHeartbeatAt: new Date(), isActive: true })
    .where(eq(licenses.id, lic.id));
  ...
}
```

`clinics.routes.ts:138-158`dagi `deactivate` endpointi faqat `isActive: false` qiladi — mashina/fingerprint o'zgarmaydi. Reactivate oqimining amaldagi ishlatilish holati: **admin avval to'lov qilinmagani uchun litsenziyani deaktiv qilgan, keyin to'lov tiklanganda xuddi shu mashinada ishlashni davom ettirish uchun qayta faollashtiradi** — bu holatda fingerprint **o'zgarmaydi**, chunki mashina o'zgarmagan. `clinics.test.ts:174-189`dagi regression test ("rejects a subsequent /v1/activate call with 403 after deactivation") ham shu ssenariyni tasdiqlaydi: deaktivatsiyadan keyin xuddi shu mashina/fingerprint bilan reaktivatsiya kerak bo'ladi, yangisi bilan emas.

Haqiqatan mashina almashgan holat (hardware o'zgarishi → yangi fingerprint) — bu ticket doirasidan **tashqarida**. U holatda ham eski saqlangan qiymat noto'g'ri bo'lar edi, lekin `prompt()` orqali qo'lda kiritish ham yechim emas edi (admin baribir yangi qiymatni "bilmaydi" — buni faqat klinika operatori o'z ekranida ko'rib, alohida kanal orqali (telefon/support) yetkazishi mumkin, bu — butunlay boshqa, kelajakdagi ticket). Shuning uchun bu spec **faqat DoD'da so'ralgan** narsani hal qiladi: allaqachon ma'lum bo'lgan qiymatni ishlatish, `prompt()`ni olib tashlash.

## 2. Yechim

### 2.1 Ko'rsatish (display)

`ClinicDetailPage.tsx`dagi litsenziya `Paper` blokiga (119-126-qatorlar atrofida, "Grace period" qatoridan keyin) yangi qator qo'shiladi:

```tsx
<Text c="dimmed">
  Fingerprint: {data.license?.fingerprint ?? '— (hali faollashtirilmagan)'}
</Text>
```

### 2.2 Reactivate mutation — saqlangan qiymatni to'g'ridan-to'g'ri ishlatish

```tsx
const reactivate = useMutation({
  mutationFn: async () => {
    if (!data?.license?.fingerprint) return;
    const res = await authFetch('/v1/reactivate', {
      method: 'POST',
      body: JSON.stringify({
        licenseKey: data.license.licenseKey,
        fingerprint: data.license.fingerprint,
      }),
    });
    if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
  },
  onSuccess: () => setMutationError(null), // CLI-394 shu handlerga invalidateQueries qo'shadi — §3 ga qarang
  onError: (err) => {
    setMutationError(
      err instanceof Error ? err.message : "Litsenziyani qayta faollashtirib bo'lmadi",
    );
  },
});
```

`prompt()` chaqiruvi butunlay olib tashlanadi.

### 2.3 Tugmani fingerprint yo'q holatda disable qilish

Fingerprint `null` bo'lganda (litsenziya hali birorta mashinada faollashtirilmagan) reactivate qilishga hech narsa yo'q — `mutationFn`dagi guard (`if (!data?.license?.fingerprint) return;`) buni jimgina to'xtatadi, lekin admin uchun tugma bosilib hech nima bo'lmasligi tushunarsiz bo'ladi. Shuning uchun tugma o'zi disable qilinadi:

```tsx
<Button
  size="xs"
  variant="outline"
  onClick={() => reactivate.mutate()}
  disabled={!data.license?.fingerprint}
>
  Reactivate
</Button>
```

## 3. CLI-394 bilan ketma-ketlik (MUHIM — bu ticketni hal qilmang, faqat tartib)

Sibling ticket **CLI-394** xuddi shu `ClinicDetailPage.tsx`dagi `reactivate` mutation'ning `onSuccess` handlerini o'zgartiradi (qc.invalidateQueries yetishmayotganini tuzatadi — `updateModules`/`deactivate` mutationlarida bor, `reactivate`da yo'q). Ikkala ticket ham bir xil mutation blokiga tegadi:

- **CLI-391 (bu ticket) avval qo'llanilishi kerak** — u `mutationFn` tanasini butunlay qayta yozadi (prompt olib tashlash + fingerprint manbasini almashtirish) va JSX'da yangi `Text` qatori + `Button disabled` prop qo'shadi. Bu — kattaroq, struktura darajasidagi o'zgarish.
- **CLI-394 keyin qo'llanilsin** — u faqat `onSuccess: () => setMutationError(null)`ni `onSuccess: () => { setMutationError(null); qc.invalidateQueries({ queryKey: ['clinic', id] }); }` ga almashtiradi (bitta qator qo'shish).

Agar tartib teskari bo'lsa (CLI-394 avval), CLI-391'ning `mutationFn` qayta yozilishi CLI-394'ning `onSuccess` qo'shimchasi bilan merge-conflict yoki bir-birini bekor qilish xavfini tug'diradi (ayniqsa ikkalasi ham agentic worker orqali avtomatik tatbiq qilinsa). Shu sababli **CLI-391 birinchi, CLI-394 ikkinchi** — ushbu spec CLI-394'ni hal qilishga urinmaydi, faqat ketma-ketlikni qayd etadi.

## 4. Global constraint

1. **Backend (`apps/supervisor-api`) o'zgarmaydi** — `fingerprint` allaqachon `GET /v1/admin/clinics/:id` javobida bor (§1.2). Yangi endpoint, yangi response maydon, yangi migration — hech biri kerak emas.
2. **`clinics.types.ts`dagi `License` interfeysi o'zgarmaydi** — `fingerprint: string | null` allaqachon mavjud (14-qator).
3. **`prompt()` global chaqiruvi butunlay olib tashlanadi** — regressiyani ushlab qolish uchun test `prompt` global funksiyasini chaqirilganda xato tashlaydigan stub bilan almashtiradi (agar implementatsiya qaytadan `prompt()`ga tayansa, test darhol qulaydi).
4. **`onSuccess` handler tarkibi bu ticketda faqat `setMutationError(null)` bilan cheklanadi** — cache-invalidation qo'shish CLI-394 doirasi (§3).
5. **Fingerprint `null` bo'lganda reactivate tugmasi disable** — jim no-op o'rniga aniq UX signal.

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] Litsenziya `Paper` blokida saqlangan `fingerprint` qiymati ko'rsatiladi (yoki faollashtirilmagan bo'lsa aniq bo'sh holat matni).
- [ ] `reactivate` mutation'i endi `prompt()` chaqirmaydi — `data.license.fingerprint`ni to'g'ridan-to'g'ri ishlatadi.
- [ ] Fingerprint `null` bo'lganda "Reactivate" tugmasi disable.
- [ ] Yangi test: fingerprint mavjud bo'lganda ko'rsatiladi; reactivate bosilganda `POST /v1/reactivate` `{ licenseKey, fingerprint }` bilan (saqlangan qiymat bilan, promptsiz) chaqiriladi; fingerprint `null` bo'lganda tugma disable va hech qanday `/v1/reactivate` so'rovi yubormaydi.
- [ ] Typecheck toza (`apps/supervisor-admin`).
