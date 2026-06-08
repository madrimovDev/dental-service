# UX / IA Konsept — Redesign

> Bu hujjat **dizayn uchun oziq** (Claude design / Figma). Vizual uslub (rang, tipografika, komponent ko'rinishi) bu yerda QOTIRILMAYDI — bu yerda **struktura**: kim, qanday ish maydonida, qaysi ekranlar, qanday navigatsiya bilan. Vizual qarorlar dizaynerga qoldiriladi.

**Versiya:** 0.1 (redesign konsepti)
**Sana:** 2026-06-08
**Status:** Muhokama qilindi — sintez bosqichi
**Bog'liq:** [`CONCEPT.md`](../CONCEPT.md) (mahsulot/arxitektura), [`CLAUDE.md`](../CLAUDE.md)

---

## 1. Redesign'ning maqsadi

Mavjud tizimda funksiyalar bor (M4/M5 gacha qurilgan: auth/RBAC, bemor, yozilish, navbat, kassa, odontogram, davolash rejasi, vizit yozuvi, reseptlar, konsent, lab, rasm), **lekin UX tekis va rolga befarq** — bitta umumiy `dashboard`/`home` hammaga bir xil. Redesign uch narsani hal qiladi:

1. **Rolga moslashuvchi ish maydoni** — har xodim o'z kunlik ishiga atalgan ekranga tushadi.
2. **Aniq navigatsiya qobig'i** — sidebar (rolga qarab filtrlanadi) + rol bosh ekrani.
3. **Kelajakka tayyor struktura** — core vertikal-neytral; stomatologiya birinchi vertikal. Boshqa vertikallar (kosmetologiya, lab) keyin *plug-in* sifatida qo'shiladi. **Bu — yo'nalish eslatmasi, bu redesign'ning markazi emas.** Konkret mavzu: stomatologiyani yaxshi qilish.

### Doiradan tashqari (bu hujjatda EMAS)
- Vizual uslub: rang palitra, tipografika, ikonka stili, komponent dizayni — dizaynerga.
- Mobil ilova (xodim/bemor) — backlog.
- Stomatologiyadan tashqari vertikal modullar dizayni — keyingi bosqich.
- Backend/DB o'zgarishlari — alohida (arxitektura) hujjat.

---

## 2. Foydalanuvchilar (rollar)

Platforma **rolga moslashuvchi** — har rol o'z ish maydoniga ega. v1 da quyidagi 6 rolning har biri **atalgan bosh ekran** oladi. Sidebar har rolda ruxsatlar (`permissions[]`) bo'yicha filtrlanadi.

| Rol | Kim | Ustuvorlik |
|---|---|---|
| **Registrator** | Front-desk, eng faol kunlik user | ⭐ Yuqori |
| **Doktor** | Klinik yadro | ⭐ Yuqori |
| **Ega / Menejer** | Sotib oluvchi, qaror qabul qiluvchi | ⭐ Yuqori |
| **Buxgalter** | Moliya | O'rta |
| **Asistent / Hamshira** | Doktorga yordam | O'rta |
| **Texnik (lab)** | Lab buyurtmalari | O'rta |

> **Ega/Owner** — implicit superuser (kodda hardcoded `user.id === tenant.owner_user_id`). U barcha ish maydonlarini ko'ra oladi va o'zi uchun "Menejer" ish maydonini default ko'radi.
> **Bir foydalanuvchi bir nechta rolda/klinikada** bo'lishi mumkin — kontekst **workspace switcher** orqali tanlanadi (qarang §4.3).

---

## 3. Navigatsiya qobig'i (App Shell)

**Tanlangan model: Sidebar (A) + Rol bosh ekrani (B) gibrid.**

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR:  [Klinika·Filial ▾]   [⌘K Qidiruv]   [🔔] [Til] [👤]│
├──────────┬──────────────────────────────────────────────────┤
│          │                                                   │
│ SIDEBAR  │           ROL BOSH EKRANI / KONTENT               │
│ (rolga   │                                                   │
│  qarab   │   (default: aktiv rolning dashboard'i;            │
│  filtr)  │    navigatsiyada boshqa bo'limga o'tilsa —        │
│          │    shu bo'lim ekrani)                             │
│          │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

### 3.1 Top bar (barcha rollar uchun umumiy)
- **Workspace switcher** — joriy `Klinika · Filial`; bosilganda boshqa kontekstga o'tish.
- **Global qidiruv (⌘K / Ctrl-K)** — bemor, yozuv, xizmat, xodim bo'yicha tez topish va tez amallar (command palette sifatida ham). Registrator uchun tezlik kaliti.
- **Bildirishnomalar (🔔)** — eslatma, no-show, lab deadline, kassa hodisalari.
- **Til** — uz / ru almashtirish.
- **Profil** — foydalanuvchi, sozlama, chiqish.

### 3.2 Sidebar
- **Ruxsat bo'yicha filtrlanadi** — foydalanuvchi faqat huquqi bor bo'limlarni ko'radi.
- Bo'limlar mantiqiy guruhlangan (masalan: *Bugun*, *Bemorlar*, *Klinika*, *Moliya*, *Boshqaruv*).
- Yig'iluvchi (collapse) — kichik ekran/desktop'da joy tejash.
- Aktiv kontekst (filial) sidebar tepasida ko'rinadi.

### 3.3 Rol bosh ekrani (landing)
- Login + workspace tanlangach foydalanuvchi **o'z rolining dashboard'iga** tushadi (umumiy `home` emas).
- Dashboard = kunlik tsiklning "boshlanish nuqtasi": eng muhim ma'lumot + eng muhim 3–5 amal qo'l ostida.
- Bir foydalanuvchida bir nechta rol bo'lsa — default rol bosh ekrani ko'rinadi, lekin sidebar barcha ruxsat bergan bo'limlarni beradi.

---

## 4. Rol ish maydonlari

Har rol uchun: **kunlik tsikl → bosh ekran tarkibi → eng muhim amallar → asosiy ekranlar.**

### 4.1 Registrator ⭐
**Kunlik tsikl:** yozilishlarni boshqarish, walk-in navbat, bemorni check-in qilish, to'lov olish, qo'ng'iroqlarga javob, yangi bemor ro'yxatga olish, eslatma yuborish.

**Bosh ekran:** *Bugungi kun*
- Bugungi kalendar (kun/agenda ko'rinishi) — kim, qachon, qaysi doktorga, status.
- Walk-in navbat tablosi — kutayotganlar, chaqirilganlar.
- Tez statistika: bugun kelganlar / kutilayotgan / no-show / bugungi kassa.

**Eng muhim amallar:** `Yangi yozuv` · `Check-in` · `To'lov olish` · `Bemor qidirish/qo'shish`

**Asosiy ekranlar:** Kalendar (yozilish), Navbat tablosi, Bemor qidirish/profil, Kassa (to'lov olish), Yangi bemor formasi.

### 4.2 Doktor ⭐
**Kunlik tsikl:** bugungi bemorlar ro'yxati, bemor kartasini ochish, odontogram, vizit yozuvi (SOAP), davolash rejasi, resept, lab/rasm buyurtmasi.

**Bosh ekran:** *Mening bugungi bemorlarim*
- Bugungi vizitlar ro'yxati (vaqt, bemor, sabab, status: kutyapti / qabulda / tugadi).
- "Keyingi bemor" tezkor kirish.
- Tugallanmagan ishlar: imzolanmagan vizit yozuvlari, kutayotgan davolash rejalari.

**Eng muhim amallar:** `Vizitni boshlash` · `Odontogram` · `Resept` · `Davolash rejasi`

**Asosiy ekranlar:** Bugungi bemorlar, **Bemor kartasi (hub — §6)**, Odontogram, Vizit yozuvi, Davolash rejasi, Reseptlar.

### 4.3 Ega / Menejer ⭐
**Kunlik tsikl:** KPI kuzatish (daromad, no-show, doktor samaradorligi), xodim boshqaruvi, jadval/filiallar, xizmat/narx, tasdiqlovlar.

**Bosh ekran:** *KPI dashboard*
- Daromad (bugun/hafta/oy), filial bo'yicha taqqoslash.
- No-show darajasi, band slotlar, doktor yuklamasi.
- Treatment completion, eng yaxshi xizmatlar.
- Filial bo'yicha filtr (Ega — barcha filial; Branch Manager — o'z filiali).

**Eng muhim amallar:** `Hisobotlar` · `Xodimlar` · `Xizmat/narx` · `Jadval`

**Asosiy ekranlar:** Dashboard/KPI, Hisobotlar, Xodimlar, Rollar (role builder), Xizmatlar va narxlar, Filiallar, Audit log, Sozlamalar.

### 4.4 Buxgalter
**Kunlik tsikl:** kassa svodkasi/yarashtirish, xarajatlar, ish haqi, hisobot, 1C eksport.

**Bosh ekran:** *Moliya dashboard*
- Bugungi/oylik kassa, tushum/chiqim balansi.
- Yarashtirilmagan tranzaksiyalar, kutilayotgan to'lovlar.
- Ish haqi davri holati.

**Eng muhim amallar:** `Tranzaksiyalar` · `Xarajat` · `Ish haqi` · `1C eksport`

**Asosiy ekranlar:** Moliya dashboard, Kassa tranzaksiyalari, Xarajatlar, Ish haqi, Hisobotlar, Eksport.

### 4.5 Asistent / Hamshira
**Kunlik tsikl:** doktorga yordam, tayyorgarlik, sterilizatsiya/ombor sarfi, jadvalni kuzatish.

**Bosh ekran:** *Bugungi jadval + vazifalar*
- Doktor(lar)ning bugungi vizitlari (yordam beradigan).
- Vazifalar: tayyorlash, sterilizatsiya, ombor sarfi qaydi.

**Eslatma:** ko'p hollarda asistent **doktor ish maydonida "yordam rejimi"da** ishlaydi (doktor roli ostida). Mustaqil hisobi bo'lsa — yuqoridagi yengil bosh ekran.

**Asosiy ekranlar:** Bugungi jadval, Ombor sarfi, (cheklangan) Bemor kartasi ko'rinishi.

### 4.6 Texnik (lab)
**Kunlik tsikl:** kelgan lab buyurtmalari, status yangilash, deadline kuzatish.

**Bosh ekran:** *Lab buyurtma navbati*
- Kelgan buyurtmalar (bemor, tish, material, rang, deadline, status).
- Muddati yaqinlashayotgan / kechikkan buyurtmalar ajratilgan.

**Eng muhim amallar:** `Statusni yangilash` · `Bajarildi deb belgilash`

**Asosiy ekranlar:** Lab navbati, Buyurtma tafsiloti.

---

## 5. Ekranlar inventarizatsiyasi (IA)

Sidebar guruhlari va ostidagi ekranlar. Har ekran ruxsatga bog'liq.

```
BUGUN
  ├─ Rol bosh ekrani (dashboard)        ← rolga qarab har xil
  ├─ Kalendar (yozilish)
  └─ Navbat tablosi (walk-in)

BEMORLAR
  ├─ Bemorlar ro'yxati / qidiruv
  ├─ Yangi bemor
  └─ Bemor kartasi (hub — §6)

KLINIKA  (doktor/asistent/texnik)
  ├─ Davolash rejalari
  ├─ Lab buyurtmalari
  └─ Reseptlar

MOLIYA  (registrator/buxgalter)
  ├─ Kassa (to'lov olish)
  ├─ Tranzaksiyalar
  ├─ Xarajatlar
  └─ Ish haqi

BOSHQARUV  (ega/menejer)
  ├─ Dashboard / KPI
  ├─ Hisobotlar
  ├─ Xodimlar
  ├─ Rollar (role builder)
  ├─ Xizmatlar va narxlar
  ├─ Filiallar
  ├─ Ombor
  ├─ Audit log
  └─ Sozlamalar (tenant)

KO'NDALANG (top bar / global)
  ├─ Workspace switcher
  ├─ Global qidiruv (⌘K)
  ├─ Bildirishnomalar
  ├─ Profil va sozlamalar
  └─ Til (uz/ru)
```

---

## 6. Bemor kartasi (markaziy hub)

Bemor kartasi — doktorning eng muhim ekrani va butun klinik ishning markazi. Ko'p modul shu yerda yig'iladi. **Tab/bo'lim tuzilishi:**

| Bo'lim | Tarkib |
|---|---|
| **Umumiy** | Profil, kontakt, PII, qarindoshlar, balans, keyingi vizit |
| **Tibbiy karta** | Anamnez, allergiya, surunkali kasallik, qon guruhi |
| **Odontogram** | Interaktiv FDI tish kartasi (stomatologiya vertikali) |
| **Davolash rejasi** | Multi-stage reja, narx, status, imzo |
| **Vizitlar** | Vizit yozuvlari tarixi (SOAP) |
| **Reseptlar** | Yozilgan reseptlar |
| **Rasmlar** | Rentgen/panoramik/intraoral galereya |
| **Lab** | Bemor bo'yicha lab buyurtmalari |
| **Konsent** | Imzolangan rozilik hujjatlari |
| **To'lovlar** | Bemor moliyaviy tarixi |

> **Vertikal-neytral eslatma:** *Umumiy, Tibbiy karta, Vizitlar, Reseptlar, Rasmlar, To'lovlar* — har klinikada bor. *Odontogram, (dental) Davolash rejasi, Lab* — stomatologiyaga xos; bular keyinchalik vertikal moduli sifatida ajraladi. Dizaynda bu bo'limlar **moslashuvchan (pluggable) tab'lar** sifatida o'ylanishi kerak.

---

## 7. Dizayn tamoyillari (dizaynerga yo'l-yo'riq)

Vizual stilni dizayner tanlaydi, lekin quyidagilar struktura/his talablari:

1. **Desktop-first, zich, lekin toza.** Asosiy foydalanuvchi — klinika kompyuteri oldida. Ma'lumot zichligi ERP'ga yaqin, lekin nafas oladigan.
2. **Tezlik > chiroy (ayniqsa registrator).** Eng ko'p amallar minimal klik/klaviatura bilan. ⌘K va tez amallar birinchi darajali.
3. **Rolga moslashuv ko'rinishda his qilinsin.** Doktor va buxgalter bir ilovaga kirib, har xil "uy" ko'rishi tabiiy bo'lsin.
4. **uz / ru — birinchi darajali.** Har matn ikki tilda; til almashtirish oson. Matn uzunligi farqini layout ko'tarsin.
5. **Status va holat aniq.** Vizit/yozuv/to'lov/lab statuslari rang+yorliq bilan bir qarashda o'qilsin.
6. **Web + Desktop bir xil.** Bitta React UI; Electron qo'shimcha (printer, fiskal) lekin layout o'zgarmaydi.
7. **Auditga sezgir amallar ko'rinarli.** Sensitive ko'rish/o'zgartirish foydalanuvchiga bilinadigan bo'lsin (ishonch).

---

## 8. Ochiq savollar

- Bir foydalanuvchida bir nechta rol bo'lsa, default bosh ekran qanday tanlanadi? (taklif: oxirgi ishlatilgan rol)
- Asistent ko'p hollarda doktor ostida ishlaydimi yoki ko'p klinikada mustaqil hisob kerakmi?
- ⌘K qidiruv qanchalik kuchli bo'lsin — faqat navigatsiya, yoki to'liq command palette (amallar ham)?
- Dashboard widget'lari sozlanuvchimi (drag/yashirish) yoki rolga fikslanganmi? (taklif: v1 da fikslangan)
- Light/dark rejim v1 da kerakmi? (taklif: light birinchi, dark backlog)

---

## 9. Keyingi qadam

1. Bu hujjatni Claude design'ga oziq qilib berish → rol bosh ekranlari va asosiy ekranlar maketlari.
2. Maketlar tasdiqlangach — frontend qobiq (shell) qayta qurish rejasi (arxitektura hujjati alohida).
3. Mavjud ekranlarni (appointments, cashier, patients, settings) yangi qobiqqa bosqichma-bosqich ko'chirish (gibrid yondashuv).
