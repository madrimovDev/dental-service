# CLI-368 — Supervisor Admin'da klinika yaratish UI (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-368 (Medium)
> **Scope:** `apps/supervisor-admin/src/features/clinics/` (yangi modal + form + api client funksiyasi). `apps/supervisor-api`'da o'zgarish YO'Q — endpoint allaqachon ishlaydi.

---

## 1. Topilgan holat (kod o'qish natijasi)

**Frontend — `apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx:30-36`:**
```tsx
<Tooltip label="Klinika yaratish hozircha faqat API orqali: POST /v1/admin/clinics">
  <span>
    <Button disabled>+ Yangi klinika</Button>
  </span>
</Tooltip>
```
Tugma doim `disabled` — hech qanday holat/handler yo'q. `ClinicsPage.test.tsx` bu tugmaning `disabled` holatini test qilmaydi, shuning uchun uni almashtirish mavjud testni buzmaydi.

**Backend — `apps/supervisor-api/src/modules/clinics/clinics.routes.ts:74-118`** — `POST /` (mount: `apps/supervisor-api/src/app.ts`da `/v1/admin/clinics`ga, `adminJwtMiddleware` bilan gated) **allaqachon to'liq ishlaydi**: klinika + "Main" filial + litsenziya bitta tranzaksiyada yaratiladi. O'zgartirish shart emas.

**Request body (`createClinicSchema`, `clinics.routes.ts:12-19`, aniq Zod sxema):**
```ts
z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise']),
  expiresAt: z.string(), // ISO sana
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
})
```
Validatsiya `zValidator('json', createClinicSchema)` (`@hono/zod-validator`) orqali — muvaffaqiyatsiz bo'lsa default `400 { success: false, error: <ZodError> }` qaytaradi (custom error formatter yo'q). `app.ts`da global `onError` yo'q, shuning uchun frontend bu holatni faqat `!res.ok` orqali generic xato sifatida ko'radi (xuddi `clinics.api.ts`dagi mavjud `fetchClinics`/`fetchClinicDetail` kabi) — server xato tafsilotini parse qilishga urinmaymiz.

**Response (`clinics.routes.ts:117`, muvaffaqiyat, 200):**
```ts
c.json({ clinic: result.clinic, license: result.license })
```
Ya'ni `{ clinic: Clinic, license: License }` — **litsenziya kaliti alohida so'rov bilan emas, xuddi shu javobda `license.licenseKey`da keladi.** Bu shakl `apps/supervisor-admin/src/features/clinics/clinics.types.ts`dagi mavjud `ClinicDetail` interfeysi bilan bir xil (`{ clinic: Clinic; license: License | null }`; bu yerda `license` amalda hech qachon `null` bo'lmaydi, chunki endpoint uni bitta tranzaksiyada yaratadi) — **yangi response tipi kerak emas**, mavjud `ClinicDetail` qayta ishlatiladi.

**Supervisor Admin'da hozirgi holat — Modal pattern yo'q, `zod`/`mantine-form-zod-resolver` YO'Q dependency:**
- `apps/supervisor-admin/package.json` — `zod` va `mantine-form-zod-resolver` ro'yxatda yo'q (faqat `@mantine/core`, `@mantine/hooks`, `@mantine/form`). `apps/web/package.json`da `mantine-form-zod-resolver@^1.3.0` + `zod@^4.4.3` bor — xuddi shu versiyalar qo'shiladi (monorepo ichida boshqa versiya tanlash sabab yo'q).
- Hech qaysi mavjud sahifada (`LoginPage.tsx`, `ClinicDetailPage.tsx`, `ClinicsPage.tsx`) `Modal` yoki `useDisclosure` ishlatilmagan — bu birinchi Modal supervisor-admin'da. `apps/web`da bor pattern (`apps/web/src/shell/AppShell.tsx`, `DesignSystemPage.tsx`) — `useDisclosure` `@mantine/hooks`dan (allaqachon dependency) — shu idiomani ko'chiramiz.
- `LoginPage.tsx` `@mantine/form`ni **zod resolver'siz** ishlatadi (oddiy required-emas forma) — yangi forma esa serverga mos validatsiya kerak bo'lgani uchun `zod4Resolver` bilan yoziladi (loyiha konvensiyasi, `apps/web` bilan bir xil, CLAUDE.md §5 "Frontend").
- `@mantine/dates` YO'Q dependency — `expiresAt` uchun yangi paket qo'shish o'rniga native `<input type="date">` (Mantine `TextInput type="date"`) ishlatiladi — CLI-365 planidagi "yangi dependency qo'shmaslik, mavjud konvensiyaga tayanish" qaroriga mos.
- `CopyButton` — `@mantine/core`ning **allaqachon mavjud** eksporti (yangi paket kerak emas); ichida `@mantine/hooks`ning `useClipboard`idan foydalanadi (u ham allaqachon dependency).

## 2. Maqsad

`ClinicsPage`dagi doim-disabled "+ Yangi klinika" tugmasini ishlaydigan formaga aylantirish: klinika nomi + kontakt + tarif tanlash + litsenziya muddati/grace period — `POST /v1/admin/clinics` chaqiradi — muvaffaqiyatda **litsenziya kalitini** aniq, o'chib ketmaydigan ko'rinishda, nusxalash imkoniyati bilan ko'rsatadi. Production'da yangi klinikani onboarding qilish endi qo'lda HTTP so'rov yozishni talab qilmaydi.

## 3. Yondashuv

**Komponent joylashuvi:** `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.tsx` (yangi `components/` pastki papka — RFC-0010'dagi `components/` konvensiyasiga mos, garchi bu supervisor-admin bo'lsada bir xil feature-folder pattern).

**Forma maydonlari (backend Zod sxemasidan bevosita, ortiqcha maydon yo'q):**
| Maydon | Komponent | Validatsiya (client zod) | Izoh |
|---|---|---|---|
| `name` | `TextInput` | `min(1)` | "Klinika nomi" |
| `contactEmail` | `TextInput type="email"` | ixtiyoriy, bo'sh yoki valid email (`z.union([z.string().email(), z.literal('')])optional()`) | bo'sh qatorni submit'dan oldin `undefined`ga aylantiramiz |
| `contactPhone` | `TextInput` | ixtiyoriy, erkin matn | serverda ham `optional()`, format cheklovi yo'q |
| `plan` | `Select` (tarif) | required, `enum(['starter','standard','premium','enterprise'])` | label: Boshlang'ich/Standart/Premium/Korporativ |
| `expiresAt` | `TextInput type="date"` | required, bo'sh bo'lmagan string | native HTML date input — ISO `YYYY-MM-DD` string chiqaradi, serverga `new Date(...)`ga o'tadi |
| `gracePeriodDays` | `NumberInput` | `int().min(1).max(365)`, default `30` | serverda ham default 30 bor, lekin client har doim aniq qiymat yuboradi (oldindan to'ldirilgan) |

**Ikki-bosqichli modal holati (bitta `Modal` ichida, `success` local state bilan almashadigan ichki view):**
1. **Forma view** (boshlang'ich / xato holatida qayta ko'rsatiladi): yuqoridagi maydonlar + "Yaratish" (submit, `loading={mutation.isPending}`) + "Bekor qilish" (yopadi, hech narsa yubormaydi) tugmalari. Mutatsiya xatosi bo'lsa forma ichida qizil matn (mavjud `ClinicDetailPage.tsx`dagi `mutationError` konvensiyasiga mos).
2. **Muvaffaqiyat view** (mutatsiya `onSuccess`dan keyin): forma yashiriladi, o'rniga:
   - Klinika nomi + tanlangan tarif tasdiq matni
   - Litsenziya kaliti — **monospace, ramkali `Paper`/`Code` blok** ichida (belgi-belgi ko'rinadigan shrift, tasodifiy o'chib ketmaydigan doimiy element — toast EMAS)
   - `CopyButton` (`@mantine/core`) — bosilganda "Nusxalandi!" holatiga o'tadi
   - Yagona chiqish yo'li: aniq "Yopish" tugmasi (boshqa hech qanday avto-yopilish yo'li yo'q — pastdagi Global constraint'ga qarang)

**API client (`clinics.api.ts`ga qo'shiladi):**
```ts
export const createClinic = async (input: CreateClinicInput): Promise<ClinicDetail> => {
  const res = await authFetch('/v1/admin/clinics', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Klinika yaratib bo'lmadi");
  return res.json();
};
```
`CreateClinicInput` — yangi interfeys `clinics.types.ts`ga qo'shiladi (backend sxemaga bevosita moslashtirilgan, pastdagi planga qarang). Javob tipi — **mavjud `ClinicDetail`** (yangi tip shart emas).

**`ClinicsPage.tsx`ga ulash:**
- Disabled `Button`+`Tooltip` bloki o'chiriladi.
- `useDisclosure(false)` (`@mantine/hooks`) — `opened`/`open`/`close`.
- `<Button onClick={open}>+ Yangi klinika</Button>` + `<CreateClinicModal opened={opened} onClose={close} />`.
- `CreateClinicModal` o'zining `useMutation`i `onSuccess`ida `queryClient.invalidateQueries({ queryKey: ['clinics'] })` chaqiradi — yangi klinika jadvalda modal ochiq turgan holatda ham keyingi "Yopish"dan so'ng darhol ko'rinadi (alohida keyingi refetch/reload talab qilinmaydi).

## 4. Global constraint — litsenziya kaliti "bir marta ko'rinadigan" his qildirilishi shart

Litsenziya kaliti amalda keyinchalik ham qayta ko'rish mumkin (`ClinicsPage` jadval ustuni + `ClinicDetailPage`, ikkalasi ham allaqachon `license.licenseKey`ni ko'rsatadi) — texnik jihatdan "abadiy yo'qoladigan sir" emas. Shunga qaramay, **yaratish paytidagi UX** operatorga uni darhol nusxalab qo'yish kerakligini his qildirishi kerak, chunki:
- Bu — vendor operatorining klinikaga litsenziya kalitini yetkazib berishi kerak bo'lgan yagona lahza (masalan email/xabar orqali klientga yuborish uchun).
- Ephemeral bildirishnoma (`@mantine/notifications` toast, avto-yo'qoladigan) — noto'g'ri: operator ko'rmasdan/o'qimasdan yo'qolishi mumkin.

**Talab:**
- Litsenziya kaliti **doimiy, avto-yopilmaydigan elementda** ko'rsatiladi (Modal ichidagi statik blok, timeout yo'q).
- Muvaffaqiyat view holatida Modal `closeOnClickOutside={false}` va `closeOnEscape={false}` — tashqariga bosish yoki Escape orqali tasodifan yopib bo'lmaydi.
- Yagona yopish yo'li — aniq "Yopish" tugmasi (foydalanuvchi ongli ravishda bosishi kerak).
- `CopyButton` orqali bir bosishda clipboard'ga nusxalash imkoniyati mavjud bo'lishi shart (DoD talabi).

## 5. DoD

- [ ] `ClinicsPage`dagi "+ Yangi klinika" tugmasi endi **disabled emas** va modal ochadi.
- [ ] Modal formasi: klinika nomi, kontakt email/telefon (ixtiyoriy), tarif tanlash (`plan` enum), litsenziya muddati (`expiresAt`), grace period (`gracePeriodDays`, default 30 oldindan to'ldirilgan).
- [ ] Submit `POST /v1/admin/clinics`ni to'g'ri body bilan chaqiradi (aniq backend Zod sxemasiga mos maydon nomlari).
- [ ] Muvaffaqiyatda: litsenziya kaliti doimiy, nusxalanadigan blok ichida ko'rsatiladi (`CopyButton`), Modal avto-yopilmaydi (tashqariga bosish/Escape ham yopmaydi), faqat aniq "Yopish" tugmasi orqali yopiladi.
- [ ] Muvaffaqiyatdan keyin klinikalar jadvali (`['clinics']` query) yangilanadi — yangi klinika ro'yxatda ko'rinadi.
- [ ] Xato holatida (server 400/500) forma view'da aniq xato matni ko'rsatiladi, forma ma'lumotlari yo'qolmaydi (qayta urinish mumkin).
- [ ] Client-side validatsiya (`zod4Resolver`) bo'sh/noto'g'ri majburiy maydonlarda submit'ni to'xtatadi va aniq xato matni ko'rsatadi.
- [ ] Yangi/o'zgargan fayllar uchun vitest testlar yashil (`bun run test` yoki `vitest run` `apps/supervisor-admin`da).
- [ ] `apps/supervisor-api`da hech qanday o'zgarish yo'q (endpoint allaqachon ishlaydi, tasdiqlangan).
