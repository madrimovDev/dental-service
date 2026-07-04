# CLI-365 — Litsenziyani bekor qilish (revoke/deactivate) yo'li (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-365 (High)
> **Scope:** `apps/supervisor-api/src/modules/clinics/` (yangi endpoint) + `apps/supervisor-api/src/modules/licenses/licenses.service.ts` (reaktivatsiya fix) + `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` (UI tugma).

---

## 1. Topilgan holat (kod o'qish natijasi)

**`clinics.routes.ts`** (`apps/supervisor-api/src/modules/clinics/clinics.routes.ts`) — `POST /` (69-118 qator) `isActive: true`ni faqat klinika+filial+litsenziya yaratilganda o'rnatadi. Bu faylda boshqa hech qanday PATCH/DELETE route yo'q — `isActive`ni keyinroq o'zgartiradigan yagona kod yo'li yo'q (ticket to'g'ri).

**"Reactivate" allaqachon bor, lekin `clinics.routes.ts`da EMAS** — u alohida modulda: `apps/supervisor-api/src/modules/licenses/licenses.routes.ts` (`POST /v1/reactivate`, `adminJwtMiddleware` bilan gated, ammo `/v1`ga mount qilingan, `/v1/admin`ga emas — mavjud kelishuv, o'zgartirilmaydi) → `licenses.service.ts`ning `reactivate()` metodi (68-84 qator). Bu metod faqat `fingerprint` + `lastHeartbeatAt`ni yangilaydi va `licenseEvents`ga `event: 'reactivated'` yozadi — **`isActive`ga umuman tegmaydi**.

**`licenseEvents` jadval shakli** (`apps/supervisor-api/src/db/schema.ts:43-52`):
```ts
export const licenseEvents = pgTable('license_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  licenseId: uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  event: text('event').notNull(), // 'activated'|'heartbeat'|'reactivated'|'deactivated'
  fingerprint: text('fingerprint'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```
`'deactivated'` string sifatida allaqachon hujjatlashtirilgan (kommentariyada), lekin hech qayerda yozilmaydi — ticketning ta'kidlagani to'g'ri.

**`licenses.isActive`** — `boolean('is_active').notNull().default(true)` (`schema.ts:36`).

## 2. `isActive` heartbeat/activate'da TEKSHIRILADIMI? — **HA, ALLAQACHON BOR**

`licenses.service.ts`:
- `activate()` (24-47 qator): `if (!lic || !lic.isActive) throw ... status: 403` — **mavjud**.
- `heartbeat()` (49-66 qator): `if (!lic || !lic.isActive) throw ... status: 403` — **mavjud**.

`licenses.test.ts` (91-112 qator) `activate`/`heartbeat` uchun `isActive` guard'ini to'g'ridan-to'g'ri test qilmaydi (`isActive: true` bilan seed qilinadi), lekin service kodi guard'ni **allaqachon amalga oshirgan**. **Xulosa: ticketning DoD talabi — "deaktivatsiya qilingan klinika keyingi heartbeat/activate so'rovida rad etilishi kerak" — YANGI kod talab qilmaydi.** Faqat `isActive`ni `false`ga o'zgartiradigan yo'l yetishmayapti; tekshiruv o'zi bor. Reja ushbu qatlamga tegmaydi, faqat regressiya-himoya test qo'shadi (`activate` chaqiruvi deaktivatsiyadan keyin 403 qaytarishini tasdiqlovchi).

## 3. Yashirin ikkinchi bug: `reactivate()` deaktivatsiyani bekor qila olmaydi

Bu ticketda yozilmagan, lekin CLI-365 amalga oshirilgach **darhol amaliy zarar keltiradi**: hozir `isActive`ni hech kim `false` qilmaydi, shuning uchun `reactivate()`ning `isActive`ga tegmasligi ziyonsiz (u doim allaqachon `true`). Ushbu ticket birinchi marta `isActive: false` yozadigan kod yo'lini qo'shadi. Agar `reactivate()` shu bilan bir vaqtda tuzatilmasa — deaktivatsiya qilingan litsenziyani "Reactivate" tugmasi orqali hech qachon qayta yoqib bo'lmaydi (fingerprint yangilanadi, lekin `activate`/`heartbeat` guard `isActive === false` bo'lgani uchun baribir 403 qaytaveradi — o'lik holat). Shu sabab bu spec **Task 2** sifatida `reactivate()`ga `isActive: true`ni qo'shishni ham qamrab oladi — ticket DoD'ining o'zidan tashqari, lekin feature'ni ishlatiladigan holga keltirish uchun zarur (aks holda deaktivatsiya bir tomonlama, qaytarib bo'lmaydigan amal bo'lib qoladi, bu vendor operatori uchun kutilmagan xatti-harakat).

## 4. Admin UI mavjud holat

`ClinicDetailPage.tsx` (106-110 qator) faqat:
```tsx
<Button size="xs" variant="outline" onClick={() => reactivate.mutate()}>
  Reactivate
</Button>
```
`reactivate` mutation `window.prompt()` bilan yangi fingerprint so'raydi, `POST /v1/reactivate`ga yuboradi. Deaktivatsiya uchun tugma/mutation yo'q. `ClinicDetail`/`License` tipida (`clinics.types.ts`) `isActive: boolean` maydoni **allaqachon bor** — UI holat ko'rsatish uchun qo'shimcha backend o'zgarishi shart emas.

Loyihada `@mantine/modals` yo'q (`package.json` tekshirildi) — mavjud "Reactivate" tugmasi ham oddiy `window.prompt()` ishlatadi, maxsus dialog komponenti yo'q. Shu konvensiyaga mos — destruktiv tasdiqlash uchun `window.confirm()` yetarli (yangi dependency qo'shilmaydi).

---

## 5. Yondashuv

### 5.1 Backend endpoint

**`PATCH /v1/admin/clinics/:id/deactivate`** — `clinics.routes.ts`ga qo'shiladi (ticket DoD'ining o'zi shu path'ni taklif qiladi va bu fayl allaqachon `GET /:id` orqali `clinicId → license` lookup pattern'iga ega — 121-132 qator — bir xil pattern qayta ishlatiladi). Route allaqachon mavjud `app.use('*', adminJwtMiddleware)` (65-qator) ostida — qo'shimcha auth kodi kerak emas.

Xatti-harakat:
1. `id` UUID formatini tekshir (mavjud `uuidSchema.safeParse` pattern, 125-126 qator) — noto'g'ri bo'lsa 404.
2. Klinikani top — topilmasa 404.
3. Litsenziyani `clinicId` bo'yicha top (`eq(licenses.clinicId, clinic.id)`) — topilmasa 404.
4. `licenses.isActive = false` qil.
5. `licenseEvents`ga `{ licenseId, event: 'deactivated' }` yoz (fingerprint/metadata shart emas — reason kiritish DoD talab qilmaydi, qo'shilmaydi — YAGNI).
6. Yangilangan `{ clinic, license }`ni qaytar (GET `/:id` bilan bir xil shakl — admin UI shu javobni ishlatib query cache'ni yangilashi mumkin).

**Idempotentlik:** allaqachon `isActive: false` bo'lgan litsenziyaga qayta chaqirilsa — xato qaytarilmaydi (409 emas), oddiy `isActive: false`ni qayta yozadi + yana bitta `'deactivated'` event qo'shadi. Sabab: mavjud `PATCH /licenses/:key/modules` ham hech qanday holat-guard qilmaydi (oddiy overwrite) — izchillik uchun bir xil oddiy naqsh tanlanadi; qo'shimcha guard keraksiz murakkablik.

### 5.2 `reactivate()` fix (Global constraint bilan bog'liq, §6 qarang)

`licenses.service.ts`ning `reactivate()`iga (73-76 qator) `isActive: true`ni `.set({...})` ichiga qo'shish — bitta qator o'zgarish. `licenseEvents`ga yoziladigan `'reactivated'` event o'zgarmaydi.

### 5.3 Admin UI

`ClinicDetailPage.tsx`ga:
- Litsenziya holatini ko'rsatuvchi matn: `Holat: Faol` (yashil/teal) yoki `Holat: Bekor qilingan` (qizil) — `data.license?.isActive` asosida (qo'shimcha backend chaqiruvi shart emas, ma'lumot allaqachon `fetchClinicDetail` javobida bor).
- Yangi **"Bekor qilish"** tugmasi (`color="red"`, mavjud "Reactivate" tugmasi yonida) — bosilganda `window.confirm(...)` bilan tasdiqlash so'raladi (destruktiv amal — DoD "confirmation dialog" talabini shu tarzda qondiradi, mavjud `prompt()` konvensiyasiga mos oddiy yechim). Tasdiqlansa `PATCH /v1/admin/clinics/:id/deactivate` chaqiriladi, muvaffaqiyatli bo'lsa `['clinic', id]` query invalidate qilinadi (mavjud `updateModules` pattern bilan bir xil).
- Xato holati mavjud `mutationError` state'iga yoziladi (mavjud pattern, alohida state kerak emas).

---

## 6. Global constraint

1. **`isActive` guard endi ikki muvozanatli yo'lga ega bo'lishi shart: `false` qiluvchi (yangi deactivate) VA `true`ga qaytaruvchi (mavjud reactivate, Task 2 bilan tuzatiladi).** Faqat deactivate qo'shib, reactivate'ni tuzatmaslik — ishlatib bo'lmaydigan bir tomonlama funksiya yaratadi; ikkalasi bir PR/branch doirasida bajarilishi kerak.
2. **`activate`/`heartbeat`dagi `isActive` tekshiruvi O'ZGARTIRILMAYDI** — allaqachon to'g'ri ishlaydi (§2). Yangi kod faqat `isActive`ni yozadigan tomonga (deactivate/reactivate) tegadi. Agar implementatsiya paytida bu tasdiqlanmasa (masalan kimdir guard'ni keyinchalik olib tashlagan bo'lsa) — Task 1'dagi regressiya-test (`activate` 403 deaktivatsiyadan keyin) buni ushlaydi.
3. **Yangi `licenseEvents` yozuvi metadata'siz** (`fingerprint: null` bilan default) — DoD faqat "event yozuvi" talab qiladi, kim tomonidan/sabab kabi audit maydonlari (admin user id) hozirgi `licenseEvents` sxemasida umuman yo'q (hech bir mavjud event ham buni yozmaydi — `activate`/`heartbeat`/`reactivate` hech biri admin/user identifikatorini saqlamaydi). Scope kengaytirilmaydi.
4. **Response shape** `{ clinic, license }` — mavjud `GET /:id`ning aynan bir xil shakli, admin frontend allaqachon shu shaklni `ClinicDetail` tipida kutadi (`clinics.types.ts`) — yangi tip kerak emas.
5. **`window.confirm()`/`window.prompt()` — mavjud konvensiya, `@mantine/modals` qo'shilmaydi.**

---

## 7. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `PATCH /v1/admin/clinics/:id/deactivate` endpoint (admin JWT gated) — litsenziyani `clinicId` bo'yicha topib `isActive: false` qiladi.
- [ ] `licenseEvents`ga `event: 'deactivated'` yozuvi qo'shiladi.
- [ ] Deaktivatsiyadan keyingi `POST /v1/activate` va `POST /v1/heartbeat` so'rovlari 403 bilan rad etiladi — **mavjud guard orqali, yangi kod shart emas**, faqat regressiya-test bilan tasdiqlanadi.
- [ ] `licenses.service.ts`ning `reactivate()` metodi `isActive: true`ni qaytaradi (feature'ni ishlatiladigan qilish uchun zarur follow-on fix, §3).
- [ ] Supervisor Admin `ClinicDetailPage.tsx`da "Bekor qilish" tugmasi (tasdiqlash dialogi bilan) + joriy holat matni (`Faol`/`Bekor qilingan`).
- [ ] Backend: `clinics.test.ts` (yangi endpoint, 401/200/404/regression-403) + `licenses.test.ts` (reactivate `isActive: true`ga qaytarishini tasdiqlovchi yangi test).
- [ ] Frontend: `ClinicDetailPage.test.tsx` (tugma bosilganda PATCH chaqirilishi, tasdiqlash bekor qilinsa so'rov yuborilmasligi, muvaffaqiyatsizlikda xato xabari).
