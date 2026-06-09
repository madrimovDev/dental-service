# Dizayn ↔ Arxitektura: Gap-Analysis & Mahsulot Blueprint

> Claude Design "clinik" bundle (30+ ekran, teal design system) ni hozirgi backend (M1–M5) bilan solishtirish. Maqsad: dizayn nimani nazarda tutadi, arxitektura nimaga moslashishi kerak, va "dizayn to'g'rimi?" degan savolga javob.

**Sana:** 2026-06-09
**Manbalar:** `docs/ux-ia-concept.md`, Claude Design `clinik` bundle, hozirgi `apps/api` + `packages/db-schema`
**Status:** Tahlil — strategik qarorlar kutilmoqda

---

## 1. TL;DR (eng muhimi)

- **Dizayn = CONCEPT.md'dagi to'liq vizyon, konkret ko'rinishda.** U klinik + moliya + ombor + HR + analitika + ko'p-filial — hammasini qamraydi.
- **Yadro allaqachon qurilgan.** Bemor, tibbiy karta, yozilish, navbat, kassa, xizmat/narx, klinik (odontogram, davolash rejasi, vizit, ICD-10), resept, konsent, lab, rasm, RBAC, audit (yozish) — **backend'da bor va ishlaydi.**
- **Gap'lar ikki joyda to'plangan:**
  1. **Ko'ndalang (cross-cutting) — ko'p ekranni bloklaydi:** bemor **balansi**, **rol dashboard'lari uchun agregatsiya/hisobot qatlami**, bemor **teg/manba/sug'urta** maydonlari.
  2. **Butun yangi modullar:** **ombor (stock)**, **xarajat (expenses)**, **ish haqi (payroll)**, **hisobotlar/analitika (reports)**, **audit-log o'qish UI**, **bildirishnomalar**.
- **"Dizayn to'g'rimi?" — Ha, lekin u scope'ni to'liq vizyongacha qaytaradi** — bu biz ataylab ogohlantirgan tuzoq. Rol dashboard'lari (redesign'ning yuragi) balans + hisobot qatlamisiz ishlamaydi. Shuning uchun **birinchi launch scope'ini kesish kerak.**

---

## 2. Moslik xaritasi

Belgilar: ✅ qurilgan · 🟡 kichik gap (maydon/endpoint qo'shish) · 🔴 butun modul yo'q

| Dizayn talab qiladi | Backend holati | Izoh |
|---|---|---|
| Auth, workspace switcher, RBAC, rollar, ruxsatlar | ✅ | To'liq |
| Bemor CRUD + qidiruv + PII masking + arxiv | ✅ | |
| Tibbiy karta: allergiya, surunkali, dorilar, qon guruhi | ✅ | `medical_records`'da bor (lekin patient-*create* DTO'sida yo'q — pastga qarang) |
| Yozilish (kalendar, konflikt, status) + walk-in navbat | ✅ | |
| Kassa POS: item, usul, refund, kunlik svod, fiskal noop | ✅ | |
| Xizmat katalogi + filial bo'yicha narx | ✅ | |
| Odontogram (FDI), davolash rejasi+bosqich, vizit SOAP, ICD-10 | ✅ | |
| Resept, konsent (shablon+imzo), lab buyurtma (material/shade/deadline), rasm | ✅ | |
| Ko'p-filial, branch switcher | ✅ | branch'lar bor; switcher — frontend |
| **Bemor balansi** (qarz/kredit) — patients list, kassa "eski balans", karta | 🟡→🔴 | **Tranzaksiyalar bor, balans yo'q.** Computed yoki ledger kerak. Ko'p ekranni bloklaydi |
| **Bemor teglari** (VIP, Sug'urta, Reja faol) — list filter, karta, patient-new | 🟡 | `patients`'da `tags` ustuni yo'q |
| **Bemor manbasi** ("Qayerdan keldi?") + **sug'urta** — patient-new | 🟡 | Ustun yo'q. Marketing/segmentatsiya uchun |
| **Rol dashboard'lari** (6 ta) KPI + grafik | 🔴 | Backend'da agregatsiya/hisobot endpoint yo'q (faqat `cashier/daily-summary`) |
| **Hisobotlar** (daromad doktor/xizmat/filial bo'yicha, no-show, samaradorlik) | 🔴 | Modul yo'q |
| **Ombor / Stock** (material, dori, sarf, kam qoldi) — stock.html, asistent | 🔴 | Jadval/modul yo'q |
| **Xarajatlar** (kategoriya, oylik svod) — expenses.html, buxgalter | 🔴 | Jadval/modul yo'q |
| **Ish haqi / Payroll** (foiz/oylik sxema, davr, hisoblash) — payroll.html | 🔴 | Jadval/modul yo'q. Xodim komissiya % yo'q |
| **Audit-log o'qish** (audit.html) | 🟡 | Yozish ✅, o'qish endpoint yo'q (`audit_log.view` ruxsat bor, route yo'q) |
| **Bildirishnomalar** (qo'ng'iroq ikonkasi, SMS eslatma) | 🔴 | Modul yo'q (auth'da mock OTP bor) |
| **Xodim profili** (mutaxassislik, "ta'tilda" status, ish boshlagan sana, komissiya) | 🟡 | `user_assignments` bor; profil maydonlari yo'q |
| **Qarindoshlar** (patient-card oila bog'lash) | 🔴 | Jadval yo'q |
| **Sozlamalar: vertikal gating** (Stomatologiya → odontogram/lab tab'lari) | 🔴 | Backend'da "vertical" tushunchasi yo'q (kengaytirilish ambitsiyasi) |
| Dark mode, ⌘K command palette | — | Sof frontend |

---

## 3. Kritik ko'ndalang gap'lar (avval shular)

Bular bitta ekran emas — **ko'p ekranni bloklaydi**, shuning uchun ustuvor:

1. **Bemor balansi.** patients list (Balans ustuni), kassa (eski balans + carry-forward), patient-card (balans, to'lovlar tarixi) — hammasi balansga tayanadi. Kerak: tranzaksiyalardan bemor balansini hisoblash (computed view yoki materializatsiya). **Eng ko'p bloklovchi gap.**

2. **Dashboard/hisobot agregatsiya qatlami.** 6 rol dashboard'i + reports + menejer/buxgalter KPI'lari — hammasi agregatsiyaga muhtoj (daromad, no-show%, slot band, plan completion, doktor yuklamasi). Hozir faqat `cashier/daily-summary` bor. Kerak: hisobot/analitika moduli (oddiy query'lardan boshlab).

3. **Bemor teg/manba/sug'urta.** Kichik, lekin patient-new + patients list dizayni shularga tayanadi. `patients`'ga `tags text[]`, `source text`, `insurance` qo'shish.

4. **patient *create* DTO ↔ medical_records.** Dizayndagi "tezkor tibbiy eslatma" (allergiya/surunkali/qon guruhi/dorilar) — backend'da `medical_records`'da bor, faqat create paytida to'ldirilmaydi. Yechim: create'ni medical_records'ni ham to'ldiradigan qilish (kichik).

---

## 4. "Dizayn to'g'rimi?" — baho

**Ha — dizayn sifatli va vizyonga sodiq.** Lekin uchta ogohlantirish:

- **Scope to'liq vizyongacha kengaydi.** Ombor, xarajat, payroll, hisobotlar, ko'p-filial tarmoq — bular CONCEPT.md'da bor edi, lekin **hali qurilmagan** (backend M5 klinikda to'xtagan). Dizaynni "to'g'ridan-to'g'ri" implement qilish = bu modullarning hammasini qurish. Bu — solo dev uchun aynan biz ogohlantirgan tuzoq.
- **Rol dashboard'lari (redesign yuragi) eng og'ir qism.** Ular balans + hisobot qatlamiga tayanadi, ya'ni "chiroyli sahifa" emas, balki backend ishi.
- **Vertikal gating dizaynda paydo bo'ldi** (settings'da "Stomatologiya vertikali"). Bu kengaytirilish ambitsiyasi — YAGNI bo'yicha hozir kerak emas, keyinga.

**Xulosa:** dizaynni *source-of-truth* sifatida qabul qilamiz, lekin **birinchi launch uchun kesilgan to'plam** bilan — keyin to'liq vizyonga o'samiz.

---

## 5. Tavsiya etilgan ketma-ketlik (kesilgan birinchi to'lqin)

**Bosqich A — Qobiq + tayyor yadro (eng tez qiymat):**
- Yangi shell (topbar + rolga moslashuvchi sidebar, teal/IBM Plex Mantine theme).
- Allaqachon backend'i bor ekranlarni yangi dizaynga ko'chirish: bemor (list/new/card), yozilish/kalendar, navbat, kassa, xizmatlar, klinik (odontogram/plan/visit/rx/lab/konsent/rasm), rollar/branch/users/settings.
- Kichik 🟡 gap'lar: bemor teg/manba/sug'urta, patient-create→medical_records.

**Bosqich B — Ko'ndalang qatlam (dashboard'larni yoqadi):**
- Bemor balansi (computed).
- Hisobot/agregatsiya moduli → rol dashboard'lari + reports + KPI'lar.
- Audit-log o'qish endpoint + UI.

**Bosqich C — Yangi ERP modullari (vizyonni to'ldiradi):**
- Ombor (stock), Xarajatlar, Ish haqi (payroll), Bildirishnomalar (Eskiz SMS), xodim profili, qarindoshlar.

**Bosqich D (keyin):** vertikal gating, dark mode polish, command palette kuchaytirish.

---

## 6. Strategik qarorlar (foydalanuvchi hal qiladi)

1. **Birinchi launch scope:** faqat Bosqich A (tayyor yadroni qayta dizayn) bilan chiqamizmi, yoki A+B (dashboard'lar bilan) shartmi?
2. **Yangi ERP modullari (ombor/xarajat/payroll):** birinchi launch'ga kiradimi yoki keyingi to'lqinga?
3. **Source of truth:** dizayn bundle ekranlari endi haqiqiy spec bo'ladimi (CONCEPT.md o'rnini bosadi), yoki ikkalasi parallel?
