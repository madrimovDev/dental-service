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
