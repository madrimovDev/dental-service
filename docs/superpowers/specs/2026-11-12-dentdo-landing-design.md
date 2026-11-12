# Dentdo landing sahifasi — dizayn

**Sana:** 2026-11-12 · **Holat:** maket va qarorlar tasdiqlangan; dizayn hujjati foydalanuvchi ko'rib chiqishida

## 1. Maqsad va nima uchun

Mahsulot sotuvini yo'lga qo'yish. Sahifani **o'zi qidirib kelgan** (Google, Instagram) 1–10 shifokorli stomatologiya klinikasi rahbari ochadi; u bizni tanimaydi. Sahifaning yagona vazifasi — uni **«30 kun bepul boshlash»** tugmasini bosishga va o'zi bulut versiyasida klinika ochishga olib kelish. Savoli bo'lsa — telefon yoki Telegram.

**Muvaffaqiyat:** tashrif buyurgan rahbar 1-ekranda nima ekanini, narxini va bepul sinovni ko'radi; ro'yxatdan o'tish 2 daqiqada, sotuvchisiz.

**Raqobatdan farq** (tadqiqot 2026-11-12: StomPro, ClinicaGo, Z-Dental, Dental Pro, Dentist Plus, BIT.Stomatologiya):
- Hech kim darhol o'zi sinab ko'rishni bermaydi (hammasi «ariza / konsultatsiya»). Dentdo — o'zi ochadi.
- Narxni ochiq ko'rsatadi va arzon (bozor ~250–300 ming so'm/oy, qo'shimchalar alohida).
- Hamma tariflarda barcha imkoniyatlar (Telegram, ombor, lab — qo'shimcha to'lovsiz).
- Internetsiz ishlaydigan kompyuter versiyasi va lab portali — raqobatchilarda yo'q.

## 2. Maqsadlar / maqsad emas / anti-maqsad

**Maqsad:** yuqoridagi taklifni tasdiqlangan maketdagidek ko'rsatish; o'zbek va rus tili; telefon va kompyuterda to'g'ri ishlash; qidiruvda topilish (sarlavha, tavsif, til teglari, ulashish rasmi).

**Maqsad emas:** blog, mijoz sharhlari, ariza formasi (sotuv — telefon/Telegram), onlayn to'lov, lablar uchun alohida sahifa, chat vidjeti.

**Anti-maqsad** (texnik ishlasa ham muvaffaqiyatsizlik):
- ClinicaGo'ga o'xshab qolish (oq-yashil, ariza formasi) — Dentdo o'z rangida (emal ko'ki).
- Yolg'on va'da: sahifada dasturda yo'q imkoniyat yoki siz tasdiqlamagan xizmat yozilsa.
- Sekin yoki og'ir sahifa (mobil internetda ochiladi).
- Stok foto, emoji belgilar, «inqilobiy/eng yaxshi» kabi so'zlar.

## 3. Qarorlar (foydalanuvchi bilan kelishilgan)

| # | Qaror |
|---|---|
| D1 | Nom — **Dentdo**. Domen kelajakda `dentdo.uz` (bo'sh ko'rinadi; foydalanuvchi oladi). |
| D2 | Taklif — **30 kun bepul, karta kerak emas**. |
| D3 | Narxlar: **Start** 1–2 shifokor 149 000; **Klinika** 3–5 shifokor 299 000 (ajratilgan, «Ko'pchilik tanlaydi»); **Pro** 6–10 shifokor, bir nechta filial 549 000 so'm/oy. Yillik = 10 oy narxi (2 oy bepul): 1 490 000 / 2 990 000 / 5 490 000. 10+ shifokor — «yozing, alohida narx». |
| D4 | Barcha tariflarda barcha imkoniyatlar; farq — shifokor soni va filial. Kompyuter versiyasi bir xil narxda. |
| D5 | 1-ekran yondashuvi — «Mahsulotni ko'rsatish»: «Klinikangiz — bitta ekranda» + dasturning haqiqiy ekrani. |
| D6 | Ko'rinish — **Dentdo dizayn tizimi** (https://claude.ai/artifact/BmUmJ67uVQN2zNAaQpuoqF), woodo.uz skeleti asosida. Tokenlar, shrift (Manrope), komponentlar va matn qoidalari — o'sha tizimning README'si. |
| D7 | Tuzilma — tasdiqlangan maket v2: `.superpowers/brainstorm/2542951-1794498371/content/landing-v2.html` (lokal, gitignored; reja bosqichida repo'ga nusxa ko'chiriladi). Bo'limlar tartibi: topbar → menyu → hero + sahna → «0 so'm» → 6 imkoniyat kartasi → rollar → bulut/kompyuter → lab → narxlar → 3 qadam → FAQ → oxirgi chaqiriq → footer. |
| D8 | Aloqa: **+998 95 044 50 14**, Telegram **@madrimov**. |
| D9 | Asosiy tugma → bulutda ro'yxatdan o'tish sahifasi. Kompyuter versiyasi o'zi yuklab olinmaydi — «yozing, o'rnatib beramiz». |

## 4. Mening qarorlarim (foydalanuvchi o'zgartirishi mumkin)

| # | Qaror | Sabab |
|---|---|---|
| M1 | Til: o'zbekcha (lotin) asosiy, ruscha ikkinchi. Ikkita alohida sahifa (`/` va `/ru/`), almashtirgich bilan; `hreflang`. | Qidiruvda ikkala til ham topilsin; JS'siz ishlasin. |
| M2 | Manzillar hozircha: landing — `https://dental.madrimov.uz/`; ilova — `https://app.dental.madrimov.uz/` (DNS `*.dental` allaqachon bor). `dentdo.uz` olingach: landing `dentdo.uz`, ilova `app.dentdo.uz`. | Landing asosiy manzilda bo'lishi kerak; ilova yo'llari (/login, /register) bilan aralashmasin. |
| M3 | Ilova ko'chishi: bulut `WEB_ORIGIN`, host Caddy sayt fayllari, `infra/vps/` hujjatlari yangilanadi; eski `dental.madrimov.uz/login` kabi yo'llar `app.`ga yo'naltiriladi. | Real klinika yo'q — hozir arzon. |
| M4 | Ilova ichida «Dental Service» → «Dentdo» (i18n `app.name`, `index.html` title, Telegram bot matnlari, PWA/desktop nomi). Litsenziya va kod identifikatorlari o'zgarmaydi. | Sahifa va ilova bir nomda bo'lsin. |
| M5 | SaaS sinov muddati kodda **14 → 30 kun** (`apps/supervisor-api/src/modules/saas/saas.routes.ts` `SAAS_TRIAL_DAYS`). | D2 bilan mos bo'lishi shart. |
| M6 | Ekranlar — **haqiqiy ilovadan skrinshot** (maketdagi HTML-chizmalar o'rniga), alohida namuna klinikasida o'ylab topilgan ism-familiyalar bilan; prod bazadagi «E2E-test» yozuvlari emas. Rasmlar WebP, `loading="lazy"` (hero'dan tashqari). | Ishonch; real ma'lumot oshkor bo'lmaydi. |
| M7 | Landing — statik sahifa (yig'ilgan HTML/CSS, minimal JS: tarif almashtirgichi, FAQ `<details>`). Server ko'tarilmaydi; host Caddy fayllarni beradi. | Tez, xavfsiz, oddiy deploy. |
| M8 | Logo hali yo'q: vaqtincha so'z-belgi «Dent» + «do» brand rangida va 2×2 rangli kvadrat belgi (maketdagidek). | Haqiqiy logo chizilganda almashadi. |
| M9 | Qorong'i mavzu tizim tokenlari bilan avtomatik (`prefers-color-scheme`). | Dizayn tizimi ikkala mavzuni beradi. |

| M10 | Asosiy tugma manzili: `https://app.dental.madrimov.uz/register-tenant` (mavjud o'z-o'zidan ro'yxatdan o'tish: klinika + egasi + login, karta va qo'lda tasdiqsiz — 2026-11-12 prod E2E'da o'tgan). Tugma `/start` orqali yo'naltiriladi (host Caddy `redir`), shunda bosishlar Caddy loglarida sanaladi — tashqi analitika skripti yo'q. | O'lchov bor, uchinchi tomon kuzatuvi yo'q. |
| M11 | Ilova ko'chganda `/api/*` va `/uploads/*` ham ilova bilan `app.` hostiga o'tadi (bir origin, CORS o'zgarmaydi); `WEB_ORIGIN=https://app.dental.madrimov.uz`. Eski hostda `/login`, `/register-tenant`, `/select-workspace`, `/api/*`, `/uploads/*` → `app.` ga 308. Desktop bulut domeniga bog'lanmagan (lokal server), ta'sir yo'q. `app.dental…` sertifikati DNS (`*.dental`) tayyor bo'lgani uchun bitta yangi ACME so'rovi. | Real klinika yo'q — bitta ko'chish yetadi. |
| M12 | Kod joyi: `apps/landing` (monorepo, biome/typecheck ichida). Bitta shablon + `uz`/`ru` lug'atidan bun skripti ikkita statik sahifa yig'adi (qo'lda ikki nusxa emas). `infra/vps/deploy.sh landing` → `/srv/dental/landing`, host Caddy `file_server`. | Ikki til bir-biridan uzoqlashmaydi. |
| M13 | SEO: hozircha kanonik — `dental.madrimov.uz`; `dentdo.uz` ishga tushganda eski host 301 bilan o'tadi (noindex qo'yilmaydi). Footer'da qisqa «Maxfiylik» sahifasi (qanday ma'lumot yig'iladi: klinika nomi, ism, telefon; kimga berilmaydi) — matnni foydalanuvchi ko'rib chiqadi. | Ro'yxatdan o'tishda shaxsiy ma'lumot olinadi. |
| M14 | Skrinshotlar: lokal muhitda alohida namuna klinikasi (seed skripti, o'ylab topilgan ismlar), ~9 ta ekran (hero kalendar, rahbar telefoni, 6 karta, Telegram xabari), har biri **uz va ru**, faqat yorug' mavzu (sahifada qorong'i ramkada turadi). | Til bo'yicha to'g'ri, ish hajmi cheklangan. |
| M15 | «Dentdo» nomi: `apps/web` (title, i18n `app.name`, matnlar), desktop'ning ko'rinadigan matnlari (tray, bildirishnoma, dialog sarlavhalari; `productName`, mDNS nomi, firewall qoidasi va `ProgramData\\DentalService` yo'llari identifikator sifatida o'zgarmaydi — reja bosqichida aniqlangan), Telegram xabar shablonlari ichidagi «Dental Service», Supervisor admin va lab portali sarlavhalari. Klinikaning o'z Telegram boti nomiga tegilmaydi (u klinikaniki). | CTA'dan keyin aralash brend bo'lmasin. |

## 5. Cheklovlar

- Matnlarda faqat dasturda **haqiqatan bor** imkoniyatlar: yozilish + Telegram eslatma (24 soat, «Kelaman/Boshqa vaqt»), bot orqali bron, anketa, chek; tish xaritasi (FDI), vizit yozuvi, allergiya ogohlantirishi, retsept, konsent, rasmlar; kassa (naqd/karta, karta turi Terminal/Click/Payme/Boshqa — *integratsiyasiz*), qarzlar, bo'lib to'lash; navbat; hisobotlar; ish haqi; ombor (xizmatdan avtomatik yechish); lab portali; rollar; filiallar; Excel import; kunlik zaxira (bulut va desktop 20:00); uz/ru.
- Narxlar va 30 kun — D2/D3 bilan aynan bir xil, hamma joyda.
- Kontrast va o'lchamlar — dizayn tizimi qoidalari (matn ≥ 4.5:1, ikkala mavzu).
- Sahifa telefonda (≥ 360px) yonga siljimaydi.

## 6. Quruvchiga qoldirilgan

- Fayl tuzilmasi va yig'ish usuli (statik bo'lishi sharti bilan), rus tilidagi matnlarning aniq tarjimasi (ma'no o'zgarmasin).
- Skrinshot olish usuli (`scripts/ui/app-shot.ts` naqshi), rasmlar o'lchami.
- Ulashish rasmi (OG) — muqova uslubida, dizayn tizimi ranglarida.
- Hero sahnasining telefonda soddalashuvi (maket v2: suzuvchi kartochkalar yashiriladi).

## 7. Foydalanuvchi tasdiqlagan va'dalar (2026-11-12)

- FAQ: «Click yoki Payme orqali to'lash mumkin» — **qoladi** (obuna to'lovi qo'lda qabul qilinadi, keyin Supervisor'da uzaytiriladi; onlayn to'lov integratsiyasi yo'q).
- 3 qadam: «Kerak bo'lsa, klinikaga kelib o'rgatamiz» — **qoladi**.
- Klinika va Pro: «Bepul ko'chirish va o'rgatish» — **qoladi**.
- `dentdo.uz` hozircha olinmaydi: vaqtinchalik manzillar (M2) bilan ishlanadi, keyin bir marta ko'chiriladi.
