# RFC-0001: Extensibility / vertikal model

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [`docs/ux-ia-concept.md`](../ux-ia-concept.md), [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md), Linear epik CLI (Arxitektura/RFC)

## Kontekst

Redesign loyihani "Dental SaaS" → **kengaytiriladigan klinika platformasi** deb qayta yo'naltirdi, stomatologiya birinchi vertikal. Bu "kengaytiriladigan" so'zi tabiiy ravishda vasvasaga soladi: hozirdan **vertikal-abstraksiya qatlami** (vertical registry, `VerticalProvider` interfeysi, feature-gating, `vertical === 'dental'` shoxlanishlari) qurish.

Lekin bugungi haqiqat:
- **Bitta vertikal bor** — stomatologiya. Ikkinchisi yo'q (kosmetologiya/lab — faqat kelajak ehtimoli).
- **Qurilgan hamma narsa konkret dental** — odontogram, `tooth_charts`/`tooth_states` (FDI), ICD-10 dental (K00–K14), dental lab materiallari, dental davolash rejasi lug'ati.
- Abstraksiyani **bitta misol** asosida loyihalash = spekulyatsiya. Va bu RFC qolgan RFC'larni (002–008) va kodni belgilaydi — ortiqcha qurilgan 001 hammasini zaharlaydi.

Bu brainstorm'da allaqachon hal qilingan: *"bitta vertikal bilan launch, kengaytiriladigan arxitektura, abstraksiyani ishlatilganda quramiz — YAGNI"*.

## Qaror

**Vertikal-abstraksiya qatlamini HOZIR qurmaymiz (defer).** Stomatologiyani konkret quramiz; dental-spetsifik qismlarni **ajratilgan, olib tashlanadigan modul/folder** sifatida saqlaymiz (seam'lar), lekin core'ga registry/provider/gating o'tkazmaymiz.

### Ajratuvchi savol (har qaror uchun mezon)

> **"Kosmetologiya 18 oydan keyin kelishi mumkinligi uchun BUGUN nimani boshqacha quramiz?"**
> Javob: **Deyarli hech narsa.**

- ✅ **To'g'ri:** dental-spetsifik bo'laklarni o'z modul/folderida izolyatsiya qilamiz, shunda keyin olib tashlash/almashtirish oson. Core (bemor, yozilish, navbat, kassa, xizmat, user/RBAC, audit, branch) nomlanishda vertikal-neytral, lekin **abstraksiyalanmagan**.
- ❌ **Xato:** `VerticalProvider` interfeysi, modul registry, vertical config, core ichida `if (vertical === 'dental')`. Agar RFC shunday o'qilsa — to'xta, YAGNI qarori teskari aylangan.

### Dental seam'lar (izolyatsiya qilinadigan, core EMAS)

Backend modullari: `clinical` (odontogram/tooth-charts/treatment-plans/visit-notes dental qismi), `lab-orders` (dental materiallar), `diagnoses` (ICD-10 dental katalog), `prescriptions` (dental kontekst). Frontend: `packages/odontogram`, bemor kartasidagi dental tab'lar.

Bular **alohida modul/folder** sifatida qoladi — core ulardan import qilmaydi (bog'liqlik bir tomonlama: seam → core, core ⇏ seam).

### Vertikal-neytral core (abstraksiyasiz)

`patients`, `appointments`, `queue`, `cashier`, `services`, `users`/`auth`/`roles`/`permissions`, `audit`, `branches`, `tenants`. Bular nomi/sxemasi bo'yicha biror sohaga bog'lanmaydi (masalan "tish" so'zi yo'q), lekin "vertical" tushunchasini bilmaydi ham.

### Dizayndagi "vertical" sozlamasi

Claude Design settings'da "Stomatologiya vertikali → odontogram/lab tab gating" bor. **Buni hozir gating-dvigatel qilmaymiz** — `tenant_settings`'da oddiy yorliq (single value) sifatida saqlanadi, UI tab'lari hozir doim ko'rinadi. Real gating — ikkinchi vertikal kelganda.

## Muqobillar (ko'rib chiqilgan)

1. **Vertikal-abstraksiya hozir (registry/provider/gating).** ❌ Bitta misol asosida spekulyatsiya; solo dev uchun katta ortiqcha ish; YAGNI qarorini buzadi; 002–008 ni murakkablashtiradi.
2. **Hech qanday izolyatsiya — hammasi aralash.** ❌ Keyin ikkinchi vertikal kelsa, dental kod core'ga chigallashib ketadi, ajratish qimmat bo'ladi.
3. **Defer + seam izolyatsiya (tanlangan).** ✅ Hozir kam ish, kelajakka tayyor "tikuv chiziqlari", spekulyatsiya yo'q.

## Oqibatlar

- ➕ Hozir minimal qo'shimcha ish; fokus konkret dental mahsulotda.
- ➕ Dental seam'lar bir tomonlama bog'liqlik bilan ajratilgani uchun, ikkinchi vertikal kelganda refactor lokal bo'ladi.
- ➖ Ikkinchi vertikal kelganda **refactor kerak bo'ladi** (abstraksiya o'shanda quriladi) — bu ataylab qabul qilingan ayirboshlash (texnik qarz, hozir to'lanmaydi).
- 🔁 **Qaytib ko'rish sharti:** real, qaror qilingan ikkinchi vertikal paydo bo'lganda — yangi RFC bilan abstraksiya loyihalanadi.

## Ochiq savollar

- Seam izolyatsiyasini lint/CI bilan majburlash kerakmi (core → seam import taqiqlash)? — Taklif: hozir code-review yetarli, keyin kerak bo'lsa lint qoidasi.

## Qayta ko'rib chiqildi — CLI-375 (2026-07-04)

**Trigger:** Yuqoridagi "Qaytib ko'rish sharti" (Oqibatlar, 55-qator) — *"real, qaror qilingan ikkinchi vertikal paydo bo'lganda — yangi RFC bilan abstraksiya loyihalanadi."* CLI-79 (2026-06-13, M8/R5) `packages/core/src/vertical-features.ts`ni qo'shdi: `VERTICALS = ['dental', 'general']` + `VERTICAL_FEATURES: Record<Vertical, Record<VerticalFeature, boolean>>` + `hasFeature()`, ishlatilgan joylar: backend `requireFeature` guard (`apps/api/src/middleware/require-feature.ts`, 403 `feature.disabled`) va frontend nav/tab gating (`apps/web/src/shell/nav-config.ts`, `apps/web/src/features/patients/visible-tabs.ts`). Massivda ikkinchi element bor — shart harfiy bajarilgandek.

**Xulosa: shart harfiy bajarilgan, lekin mazmunan hali chaqirilmagan.**

RFC-0001'ning deferred savoli ikki qatlamli edi: (1) gating mexanizmi — tenant qaysi feature'ni ko'radi, ataylab ochiq qoldirilgan ("Dizayndagi vertical sozlamasi", 40-42 qator); (2) modul/registry abstraksiyasi — yangi vertikal o'z domenini (yangi entity/route/biznes-mantiq) core'ga qanday "plug" qiladi, bu **rad etilgan** Muqobil 1 edi (`VerticalProvider`, registry, gating-dvigatel).

CLI-79 faqat qatlam (1)ni qurdi — 14 qatorlik statik boolean Record, RFC kutgan minimal shaklda, YAGNI'ga mos. Qatlam (2) — registry/provider savoli — **hali sinovdan o'tmagan**, chunki `general` vertikal RFC nazarda tutgan turdagi ikkinchi vertikal emas: u hech qanday o'ziga xos domenga ega emas, faqat ikkita dental-spetsifik feature'ni (`odontogram`, `labOrders`) o'chiradi. Butun kodbazada `general` uchun yangi seam-modul, yangi entity yoki yangi biznes-mantiq yo'q — bu **subtraktiv dental-lite rejim**, RFC kontekstidagi gipotetik "kosmetologiya" kabi **additiv yangi domen** emas (12-qator). Additiv yangi domenni sinamasdan turib registry/provider kerak yoki kerak emasligini hal qilish — aynan RFC-0001 dastlab qochgan spekulyatsiya bo'lar edi.

**Amaldagi qaror hali ham to'g'ri: defer davom etadi.** RFC-0001'ning asl xulosasi (Muqobil 3 — defer + seam izolyatsiya, YAGNI) bekor qilinmaydi — CLI-79 buni tasdiqlaydi: ikkita vertikal uchun oddiy feature-toggle Record yetarli bo'ldi, registry/provider hali kerak emas.

**Keyingi haqiqiy trigger — aniq kriteriy:** Registry/provider abstraksiyasi (RFC-0001 Muqobil 1) faqat quyidagi shart bajarilganda qayta ko'rib chiqiladi:

- Yangi vertikal **o'z SEAM'iga** muhtoj bo'lsa — ya'ni mavjud dental seam'larni (`clinical`, `lab-orders`, `diagnoses`, `prescriptions`, `packages/odontogram`) yoqish/o'chirishdan tashqari, **yangi entity, yangi route yoki yangi biznes-mantiq** talab qilsa (masalan: kosmetologiya protsedura katalogi, o'ziga xos konsent oqimi, boshqa jadval qoidalari).

Quyidagilar bu trigger'ni **ishga TUSHIRMAYDI** (mavjud yondashuv bilan davom etiladi, RFC-002 shart emas):
- `VERTICAL_FEATURES` Record'ga yangi `Vertical` qatori yoki yangi `VerticalFeature` ustuni qo'shish (masalan, uchinchi subtraktiv vertikal yoki uchinchi on/off feature);
- Mavjud seam'larni yangi kombinatsiyada yoqish/o'chirish.

Trigger yuzaga kelsa, yangi RFC (RFC-002 yoki keyingi bo'sh raqam) quyidagilarni loyihalaydi: yangi seam-modulning core bilan bog'lanish nuqtasi (registry yoki hali ham oddiyroq mexanizm — dinamik route-mount, DI orqali service-injection va h.k.), va bu qaror **shu paytdagi haqiqiy ikkinchi domen misolida** asoslanadi, bugungi kabi spekulyativ emas.
