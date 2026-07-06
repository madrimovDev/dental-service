# CLI-396 — ClinicsPage N+1 so'rov patterni (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-396 (Low)
> **Scope:** `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` (`GET /`), `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx`, `apps/supervisor-admin/src/features/clinics/clinics.types.ts`.

---

## 1. Maqsad (Goal)

`ClinicsPage.tsx` klinikalar jadvalida "Litsenziya"/"Tarif"/"Holat" ustunlarini ko'rsatish uchun `GET /v1/admin/clinics` (bare klinika ro'yxati) dan tashqari **har bir qator uchun** `GET /v1/admin/clinics/:id` (`fetchClinicDetail`) so'raydi (`useQueries`, `ClinicsPage.tsx:21-26`). N klinika bo'lsa — 1 + N HTTP so'rov. Klinika soni o'sgani sayin (Supervisor bir nechta klinikani boshqaradi) bu chiziqli o'sadigan tarmoq/DB yuklamasi va sekin sahifa yuklanishiga olib keladi. Maqsad — `GET /v1/admin/clinics` javobiga litsenziya summary maydonlarini qo'shib, frontend'dagi N+1 so'rovni butunlay olib tashlash (natija: 1 so'rov, klinika sonidan mustaqil).

## 2. Joriy holat

**Frontend (`ClinicsPage.tsx:8-26`):**
```tsx
const { data: clinics = [], isLoading, isError } = useQuery({
  queryKey: ['clinics'],
  queryFn: fetchClinics,
});

const detailQueries = useQueries({
  queries: clinics.map((clinic) => ({
    queryKey: ['clinic', clinic.id],
    queryFn: () => fetchClinicDetail(clinic.id),
  })),
});
```
Jadval qatorida (`ClinicsPage.tsx:60`) `detailQueries[index]?.data?.license`dan **faqat** uchta maydon o'qiladi: `license.licenseKey` ("Litsenziya" ustuni), `license.plan` ("Tarif" ustuni), `license.isActive` (Badge — "Holat" ustuni). To'liq `ClicnicDetail`ning qolgan maydonlari (`fingerprint`, `modules`, `gracePeriodDays`, `lastHeartbeatAt`, `activatedAt`, hatto `license.id`/`branchId`) bu sahifada ishlatilmaydi.

**Backend — ikki endpoint, ikki xil javob shakli:**
- `GET /` (`clinics.routes.ts:68-71`): `db.query.clinics.findMany()` — bare klinika qatorlari, litsenziya yo'q.
- `GET /:id` (`clinics.routes.ts:121-132`): `clinic` (`findFirst` by id) + `license` (`db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) })` — **`orderBy` yo'q**, clinicId bo'yicha birinchi topilgan license qatori, arbitrary tartib) alohida ikkita so'rov bilan olib, `{ clinic, license }` qaytaradi.

**DB sxema (`apps/supervisor-api/src/db/schema.ts`):** `licenses.clinicId` — `NOT NULL` FK → `clinics.id`, lekin **unique emas** (bitta klinikada nazariy jihatdan bir nechta license qatori bo'lishi mumkin). Amaliyotda `POST /` (`clinics.routes.ts:74-118`) klinika + filial + **bitta** license'ni bitta tranzaksiyada yaratadi — hozirgi kodda klinikaga ikkinchi license qo'shadigan boshqa yo'l yo'q. Shuning uchun "bitta klinika → bitta license" amaldagi invariant, lekin sxema darajasida bu majburlanmagan.

**Drizzle relations() — mavjud emas:** butun monorepo bo'yicha qidiruv (`grep -rn "= relations("`) hech qanday natija bermadi — loyihada Drizzle'ning relational query `with:` konfiguratsiyasi (`relations()` helper) **hech qayerda ishlatilmaydi**, faqat oddiy `db.query.<table>.findFirst/findMany({ where })` (relations config'siz — bu `with` talab qilmagani uchun ishlaydi). N+1'ni bitta so'rovga qisqartirish uchun mavjud pretsedent — `apps/api/src/modules/clinical/treatment-plans/treatment-plans.repository.ts:15-60` (`listPlans`): parent ro'yxat (`treatmentPlans`) + bitta `inArray(...)` child-query (`treatmentStages`) + xotirada `Map<parentId, child[]>` guruhlash — **relations() emas, qo'lda IN-query + Map**.

## 3. Yondashuv (Approach)

### 3.1 Backend — `GET /v1/admin/clinics` javobiga `license` summary qo'shish

`treatment-plans.repository.ts`dagi bir xil naqsh: parent-ro'yxat + bitta `inArray` child-query + xotirada `Map` bo'yicha guruhlash (relations() kiritilmaydi — loyihada hech qayerda ishlatilmagan yangi pattern boshlashdan ko'ra, mavjud pretsedentga ergashish).

`clinics.routes.ts`da import qatoriga `inArray` qo'shiladi:
```ts
import { eq, inArray } from 'drizzle-orm';
```

`GET /` handler (`clinics.routes.ts:68-71`) quyidagicha almashtiriladi:
```ts
// Klinikalar ro'yxati + litsenziya summary (frontend ClinicsPage jadvali
// litsenziya kaliti/tarif/holatni shu javobdan oladi — har-qator
// GET /:id chaqiruvi (N+1) endi kerak emas, CLI-396).
// N+1 fixi treatment-plans.repository.ts'dagi (apps/api) bir xil naqsh:
// parent-ro'yxat + bitta IN-query + xotirada Map bo'yicha guruhlash.
app.get('/', async (c) => {
  const rows = await db.query.clinics.findMany();
  if (rows.length === 0) return c.json([]);

  const licenseRows = await db
    .select({
      clinicId: licenses.clinicId,
      licenseKey: licenses.licenseKey,
      plan: licenses.plan,
      isActive: licenses.isActive,
      expiresAt: licenses.expiresAt,
    })
    .from(licenses)
    .where(
      inArray(
        licenses.clinicId,
        rows.map((r) => r.id),
      ),
    );

  // GET /:id (pastda) clinicId bo'yicha findFirst ishlatadi — orderBy yo'q,
  // birinchi topilgan qator. Bu yerda ham xuddi shu semantikani saqlaymiz
  // (clinicId bo'yicha birinchi uchragan license'ni olamiz) — amaliyotda
  // har klinikada bitta license bor (POST / klinika+filial+license'ni bir
  // vaqtda yaratadi), shuning uchun ko'p-licenseli holat bugun yo'q.
  const licenseByClinic = new Map<string, (typeof licenseRows)[number]>();
  for (const l of licenseRows) {
    if (!licenseByClinic.has(l.clinicId)) licenseByClinic.set(l.clinicId, l);
  }

  const data = rows.map((clinic) => {
    const l = licenseByClinic.get(clinic.id);
    return {
      ...clinic,
      license: l
        ? { licenseKey: l.licenseKey, plan: l.plan, isActive: l.isActive, expiresAt: l.expiresAt }
        : null,
    };
  });

  return c.json(data);
});
```

**Yangi javob shakli** (har bir massiv elementi):
```ts
{
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string; // ISO
  license: {
    licenseKey: string;
    plan: string;      // 'starter'|'standard'|'premium'|'enterprise'
    isActive: boolean;
    expiresAt: string; // ISO
  } | null;
}
```

Jami so'rov soni: **2** (klinikalar + litsenziyalar IN-query), klinika sonidan mustaqil — avvalgi `1 + N`ga solishtirganda.

### 3.2 Field-nomlash qarori: `isActive`, "status" emas

Ticket tavsifida "license-summary fields (plan/status/expiresAt)" deyilgan, lekin mavjud `License` tipi (`clinics.types.ts:9-23`) va `GET /:id` javobi allaqachon `isActive: boolean` ishlatadi (`ClinicsPage.tsx:67`dagi Badge ham shu maydonga bog'langan). Yangi `status` maydon nomi kiritish churn yaratadi va ikki xil konvensiya (`isActive` detail'da, `status` list'da) bir vaqtda yashaydi. **Qaror:** `isActive: boolean` ishlatiladi — DoD'dagi "status" so'zi maydon nomi emas, semantik tavsif sifatida o'qiladi.

`licenseKey` maydoni ham qo'shiladi — DoD matnida aniq sanalmagan, lekin "Litsenziya" ustuni (`ClinicsPage.tsx:64`) buni ko'rsatadi; uni qoldirsak N+1'ni olib tashlagandan keyin bu ustun bo'sh qoladi (regressiya). `expiresAt` DoD'da so'ralgan, hozir UI'da ko'rsatilmaydi, lekin keyingi ("muddati tugayapti" badge) ishlar uchun tayyor qoldiriladi.

### 3.3 Frontend — N+1'ni olib tashlash

**`clinics.types.ts`:** `Clinic` interfeysiga `license` maydoni qo'shiladi:
```ts
export interface ClinicLicenseSummary {
  licenseKey: string;
  plan: string;
  isActive: boolean;
  expiresAt: string;
}

export interface Clinic {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  license: ClinicLicenseSummary | null;
}
```
(`License`/`ClinicDetail` interfeyslari — `GET /:id` uchun — o'zgarmaydi, `ClinicDetailPage.tsx` ularga bog'liqligicha qoladi.)

**`ClinicsPage.tsx`:** `useQueries` bloki (21-26-qatorlar) va `fetchClinicDetail` importi butunlay olib tashlanadi. Jadval qatorida:
```tsx
{clinics.map((clinic) => {
  const license = clinic.license;
  return (
    <Table.Tr key={clinic.id}>
      <Table.Td>{clinic.name}</Table.Td>
      <Table.Td>{license?.licenseKey ?? '—'}</Table.Td>
      <Table.Td>{license?.plan ?? '—'}</Table.Td>
      <Table.Td>
        <Badge color={license?.isActive ? 'green' : 'red'}>
          {license?.isActive ? 'Faol' : 'Nofaol'}
        </Badge>
      </Table.Td>
      <Table.Td>{/* ... "Ko'rish" tugmasi, o'zgarmaydi */}</Table.Td>
    </Table.Tr>
  );
})}
```
(`index`-based `detailQueries[index]` o'rniga to'g'ridan `clinic.license` — endi qo'shimcha array-indeksga bog'liqlik yo'q.)

`fetchClinicDetail` (`clinics.api.ts`) **o'chirilmaydi** — `ClinicDetailPage.tsx` uni hali ham chaqiradi (`GET /:id` sahifasi, to'liq litsenziya ma'lumoti: fingerprint, modules, heartbeat va h.k. kerak).

## 4. Scope tashqarisida (won't-fix bu ticketda)

- **Ko'p-license-per-clinic non-determinizm:** hozirgi `GET /:id`ning o'zi ham `orderBy`siz `findFirst` ishlatadi — bu ticket shu semantikani saqlaydi, tuzatmaydi (alohida muammo, hech qachon amaliyotda uchramagan — POST / bitta license yaratadi).
- **Drizzle `relations()` kiritish:** loyihada hech qayerda ishlatilmagan yangi pattern; N+1 fixi mavjud `treatment-plans.repository.ts` naqshiga (IN-query + Map) ergashadi.
- **`clinics.routes.ts`ni service/repository/mapper qatlamlariga bo'lish (RFC-0009):** bu modul (`@supervisor/api`) hozir ham bitta-fayl konvensiyada (CLAUDE.md: Supervisor alohida mahsulot, dental-service'ning 6-fayl pattern'i unga majburiy emas) — bu ticket faqat mavjud bitta-fayl strukturani kengaytiradi, qayta tashkil qilmaydi.

## 5. Test strategiyasi

- **Backend** (`clinics.test.ts`, mavjud `describe('GET /v1/admin/clinics', ...)` blokiga qo'shiladi): (a) yaratilgan klinika uchun `license` summary to'g'ri qaytishi (`licenseKey`/`plan`/`isActive`/`expiresAt` — `POST /` javobidagi qiymatlar bilan solishtiriladi); (b) license'i yo'q klinika uchun `license: null` (bu holatni public API orqali hosil qilib bo'lmaydi — `POST /` doim license bilan yaratadi — shuning uchun test to'g'ridan-to'g'ri `db.insert(clinics)` bilan "orphan" klinika kiritadi, xuddi mavjud `licenses`/`clinics` importlarini kengaytirib).
- **Frontend** (`ClinicsPage.test.tsx`): mavjud fixture'lar (`clinicOne`/`clinicTwo`) `license` maydoni bilan to'g'ridan-to'g'ri boyitiladi, `/v1/admin/clinics/c1`/`/c2` detail-endpoint stub'lari olib tashlanadi (endi chaqirilmaydi). **Yangi regressiya testi:** `fetchMock`ning barcha chaqiruvlarini tekshirib, `GET /v1/admin/clinics` roppa-rosa bitta marta chaqirilganini va `/v1/admin/clinics/c1`/`/c2` (per-row detail) hech qachon chaqirilmaganini tasdiqlaydi — bu aynan N+1 regressiyasini ushlaydigan test (fix'dan oldin FAIL bo'ladi, chunki joriy kod ikkita qo'shimcha detail-so'rov yuboradi).

## 6. DoD

- [ ] `GET /v1/admin/clinics` javobidagi har bir element `license: { licenseKey, plan, isActive, expiresAt } | null` maydoniga ega (§3.1).
- [ ] Backend: 2 ta so'rov (klinikalar + bitta `inArray` license-query), klinika sonidan mustaqil — N+1 yo'q.
- [ ] `ClinicsPage.tsx`: `useQueries`/`fetchClinicDetail` chaqiruvi olib tashlangan, jadval to'g'ridan `clinic.license`dan o'qiydi.
- [ ] `clinics.types.ts`: `Clinic` interfeysi `license: ClinicLicenseSummary | null` maydoniga ega.
- [ ] `fetchClinicDetail`/`ClinicDetailPage.tsx` o'zgarishsiz ishlaydi (regressiya yo'q).
- [ ] Yangi backend test: `license` summary to'g'ri qaytishi + `license: null` orphan-holat.
- [ ] Yangi frontend test: `GET /v1/admin/clinics` bitta marta chaqirilishi, per-row detail chaqiruvi yo'qligi.
- [ ] Mavjud testlar (backend + frontend) buzilmaydi.
- [ ] Typecheck toza (`apps/supervisor-api`, `apps/supervisor-admin`).
