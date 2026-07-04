# CLI-375 — RFC-0001 "ikkinchi vertikal" qaytib ko'rish shartini yopish (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-375 (Low)
> **Scope:** `docs/rfcs/0001-extensibility-vertical-model.md` (yangi bo'lim qo'shish) — kod o'zgarmaydi.

---

## 1. Maqsad

RFC-0001 (`docs/rfcs/0001-extensibility-vertical-model.md:55`) shunday shart qo'ygan edi:

> 🔁 **Qaytib ko'rish sharti:** real, qaror qilingan ikkinchi vertikal paydo bo'lganda — yangi RFC bilan abstraksiya loyihalanadi.

CLI-79 (M8/R5, 2026-06-13) `packages/core/src/vertical-features.ts`ni qo'shdi — `VERTICALS = ['dental', 'general']`, `VERTICAL_FEATURES` Record, `hasFeature()`, backend `requireFeature` guard va frontend nav/tab gating. Yuzaki qarasa — shart harfiy bajarilgandek: massivda ikkinchi element bor. Ammo hech qanday follow-up RFC yozilmagan.

Ticket DoD: qisqa follow-up hujjat (yoki RFC-0001'ga qo'shilgan bo'lim) — shipped `VERTICAL_FEATURES` map RFC-0001'ning original "to'liq abstraksiya" savoliga allaqachon javob beradimi, yoki uchinchi vertikal kelganda nima o'zgarishini belgilaydi.

**Bu ticketning haqiqiy deliverable'i — shu tahlil/hujjatning o'zi, kod emas.**

---

## 2. Tekshiruv — nima qurilgan edi, nima qurildi

### 2.1 RFC-0001 nimani deferred qildi (aniq)

RFC-0001 §"Qaror" (18-42 qator) ikkita aniq narsani **rad etdi**, birini **tanladi**:

- ❌ **Rad etilgan (Muqobil 1):** "Vertikal-abstraksiya hozir (registry/provider/gating)" — `VerticalProvider` interfeysi, **modul registry**, vertical config, core ichida gating-dvigatel.
- ✅ **Tanlangan (Muqobil 3):** "Defer + seam izolyatsiya" — dental-spetsifik kod alohida modul/folderda (`clinical`, `lab-orders`, `diagnoses`, `prescriptions`, `packages/odontogram`), core ulardan bir tomonlama bog'liq emas (seam → core, core ⇏ seam). **Core'ga abstraksiya, gating-dvigatel yoki registry qo'shilmaydi.**
- "Dizayndagi vertical sozlamasi" (40-42 qator) — ochiq qoldirilgan: `tenant_settings`da "oddiy yorliq (single value)" sifatida saqlanadi, **real gating yo'q** ("hozir gating-dvigatel qilmaymiz... Real gating — ikkinchi vertikal kelganda").

Demak RFC-0001'ning deferred "abstraksiya savoli" ikki qatlamli edi:
1. **Gating mexanizmi** (tenant qaysi feature'ni ko'radi) — ataylab ochiq qoldirilgan, "ikkinchi vertikal kelganda" qurilishi kutilgan.
2. **Modul/registry abstraksiyasi** (yangi vertikal o'z domenini — yangi entity, yangi route, yangi biznes mantiq — qanday "plug qiladi") — bu RFC to'liq **rad etgan** narsa, "hech qachon qurilmaydi" emas, balki "ikkinchi real vertikal kelmaguncha spekulyatsiya" deb belgilangan.

### 2.2 Shipped narsa (CLI-79, `packages/core/src/vertical-features.ts`)

```ts
export const VERTICALS = ['dental', 'general'] as const;
export type VerticalFeature = 'odontogram' | 'labOrders';
export const VERTICAL_FEATURES: Record<Vertical, Record<VerticalFeature, boolean>> = {
  dental: { odontogram: true, labOrders: true },
  general: { odontogram: false, labOrders: false },
};
export const hasFeature = (vertical, feature) => VERTICAL_FEATURES[vertical]?.[feature] ?? false;
```

Bu **faqat qatlam 1 (gating)** — 14 qatorlik statik boolean Record + bitta lookup funksiya. Ishlatilishi:
- Backend: `apps/api/src/middleware/require-feature.ts` — `requireFeature('labOrders')` guard, `tenant_settings.vertical`ni RLS-bound `db`dan o'qiydi, feature yo'q bo'lsa 403 `feature.disabled`.
- Frontend: `apps/web/src/shell/nav-config.ts` (`isVisible`) va `apps/web/src/features/patients/visible-tabs.ts` (`filterPatientTabs`) — `item.feature`/`tab.feature` bo'lsa `hasFeature()` bilan filtrlanadi.

**Muhim kuzatuv: `general` vertikal hech qanday O'ZINING narsasiga ega emas.** U faqat dental-spetsifik ikkita feature'ni (`odontogram`, `labOrders`) **o'chiradi**. Butun kodbaza bo'yicha grep (`nav-config.ts`, `visible-tabs.ts`, `vertical-features.ts`) tasdiqlaydi — `general` uchun hech qanday yangi route, yangi entity, yangi seam-modul, yangi UI-tab qurilmagan. `general` = "dental minus 2 ta feature", additive yangi domen emas, **subtraktiv lite-rejim**.

Bu — RFC-0001 kontekstida tilga olingan gipotetik ikkinchi vertikal ("kosmetologiya" — 12-qator) bilan **bir xil emas**. Kosmetologiya — o'z protsedura katalogi, o'z konsent oqimi, ehtimol o'z jadval qoidalari bilan **yangi domen** bo'lardi (RFC §"Dental seam'lar" mazmunida — yangi seam modul kerak bo'lardi). `general` esa **mavjud dental seam'larni faqat UI/API darajasida yashiradi** — yangi seam, yangi entity, yangi biznes mantiq qo'shmaydi.

### 2.3 CLI-79 konteksti (CLAUDE.md)

CLAUDE.md (M8/R5 progress yozuvi) buni tasdiqlaydi: "`packages/core/vertical-features.ts` (vertical→feature map, **keystone**)... backend `requireFeature` guard (odontogram=tooth-charts + lab routes, 403 `feature.disabled`) + frontend nav-config/PatientCard tab gating... Settings vertical Select (Stomatologiya/Umumiy klinika)". Ya'ni CLI-79'ning maqsadi ham aynan shu edi — **gating mexanizmini qurish** (RFC-0001'ning ataylab ochiq qoldirilgan qatlam-1 savoli), registry/provider abstraksiyasi emas.

---

## 3. Yondashuv — mening xulosam: **QISMAN (PARTIALLY) qanoatlantiradi**

RFC-0001'ning ikki qatlamli deferred savoliga nisbatan:

1. **Gating mexanizmi savoli — TO'LIQ hal qilindi**, va aynan RFC kutgan minimal shaklda: statik `Record<Vertical, Record<Feature, boolean>>` + `hasFeature()` lookup. Bu RFC-0001'ning YAGNI ruhiga mos — registry, plugin-loader yoki dinamik konfiguratsiya emas, oddiy compile-time xarita. Ikkita vertikal uchun bu **yetarli va to'g'ri darajadagi** yechim; ortiqcha mukammal emas.

2. **Modul/registry abstraksiyasi savoli — HALI TEKSHIRILMAGAN, demak HAL QILINMAGAN.** Sabab: `general` vertikal RFC-0001 nazarda tutgan "real ikkinchi vertikal" turi emas. RFC kontekstida "ikkinchi vertikal" — o'z domeniga ega yangi mahsulot yo'nalishi (kosmetologiya kabi: yangi entity/protsedura/konsent/jadval mantiq). `general` esa dental seam'larni **o'chirish** — hech qanday yangi seam, yangi entity yoki yangi biznes mantiq qo'shmagan subtraktiv variant. Shu sababli RFC-0001 rad etgan savol — "yangi vertikal o'z domenini core'ga qanday registratsiya qiladi (VerticalProvider/registry)" — hali birorta real stsenariyda **sinovdan o'tkazilmagan**. Uni sinamasdan turib "abstraksiya kerak emas" yoki "abstraksiya shu" deb aytish hali ham spekulyatsiya bo'lardi — aynan RFC-0001 dastlab qochgan narsa.

**Xulosa:** Shart harfiy ma'noda (`VERTICALS.length === 2`) bajarilgandek ko'rinadi, lekin **mazmunan** RFC-0001 nazarda tutgan trigger ("real, qaror qilingan ikkinchi vertikal" — o'z domeni bilan) hali kelmagan. `general` — birinchi vertikalning kamaytirilgan varianti, ikkinchi mustaqil vertikal emas. Shu bois **yangi to'liq RFC yozish hali ham erta/spekulyativ bo'lar edi** — bu aynan RFC-0001'ning asl xulosasini tasdiqlaydi, uni bekor qilmaydi.

Bu yaxshi xabar: RFC-0001'ning asl qarori (defer + seam izolyatsiya, YAGNI) **hali ham to'g'ri va amal qiladi**. Yozilishi kerak bo'lgan narsa — yangi og'ir RFC emas, balki **RFC-0001'ga qisqa "Qayta ko'rib chiqildi" bo'lim** qo'shish:
- shart nima uchun harfiy bajarilgan-u, lekin mazmunan hali chaqirilmaganini aniqlashtiradi;
- `general` nimaligini aniq belgilaydi (dental-lite subset, mustaqil vertikal emas);
- **haqiqiy trigger**ni keyingi safar uchun aniq kriteriy bilan qayta belgilaydi: registry/provider abstraksiyasi faqat **yangi vertikal o'z SEAM'ini** (yangi entity/route/biznes-mantiq — mavjud dental seam'larni yoqish/o'chirishdan tashqari narsa) talab qilganda quriladi. Oddiy on/off feature-toggle kengayishi (`VERTICAL_FEATURES`ga yangi qator/ustun qo'shish) bu trigger'ni ISHGA TUSHIRMAYDI.

Bu yondashuv ticket DoD'ning ikkinchi shartini qanoatlantiradi: "yoki uchinchi vertikal kelganda nima o'zgarishini belgilaydi" — men aynan shu kriteriyni yozaman.

**Muqobil ko'rib chiqilgan va rad etilgan:** "Ha, to'liq qanoatlantiradi, hech narsa yozish shart emas" — rad etildi, chunki `general`ning subtraktiv tabiati sabab hali chinakam ikkinchi domen sinovdan o'tmagan; buni "javob berilgan" deb yopib qo'yish keyingi haqiqiy vertikal kelganda xuddi shu spekulyatsiya xavfini qaytaradi. "Yo'q, to'liq yangi RFC-002 yozish kerak" — rad etildi, chunki hali ikkinchi haqiqiy domen yo'q holatda registry/provider loyihalash aynan RFC-0001 ogohlantirgan spekulyatsiya bo'lar edi.

---

## 4. DoD

- [ ] `docs/rfcs/0001-extensibility-vertical-model.md`ga yangi bo'lim ("Qayta ko'rib chiqildi — CLI-375, 2026-07-04") qo'shilgan, quyidagilarni o'z ichiga oladi:
  - CLI-79/`vertical-features.ts` holati tavsiflanadi;
  - xulosa: shart harfiy bajarilgan, mazmunan hali yo'q (`general` — subset, mustaqil domen emas);
  - keyingi haqiqiy trigger uchun aniq kriteriy (yangi seam/entity/route talab qilingan payt).
- [ ] Bo'lim RFC-0001'ning qolgan qismi bilan ziddiyatga kirmaydi (mavjud "Qaror"/"Oqibatlar" bo'limlari o'zgarmaydi, faqat yangi bo'lim qo'shiladi).
- [ ] Hech qanday kod, schema yoki test o'zgarmaydi — bu sof hujjat yangilanishi.
- [ ] Linear CLI-375 "Done"ga o'tkaziladi (yoki foydalanuvchi tomonidan qo'lda).
