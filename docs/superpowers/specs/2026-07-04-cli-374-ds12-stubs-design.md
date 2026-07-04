# CLI-374 — ds12 data-gap stub'lari production'da ko'rinadi (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-374 (Medium)
> **Scope:** `apps/web/src/features/appointments/components/WaitlistCard.tsx`, `apps/web/src/features/appointments/components/DayStatsCard.tsx:58`

---

## 1. Maqsad

Ikkita right-rail komponent (`CalendarScreen.tsx`, kun/hafta ko'rinishi) — `WaitlistCard` va `DayStatsCard`ning "Bo'sh slot" KPI ustunchasi — hozir **doim bo'sh/nol natija** ko'rsatadi, lekin buni oddiy foydalanuvchidan yashirmaydi: ko'rinishi jihatidan bu ikkalasi ham "hech qanday kutish yozuvi yo'q" / "bugun bo'sh slot yo'q" degan **haqiqiy natija**dan farq qilmaydi. Fayl kommentlari ochiq tan oladi — ikkalasi ham ds12 (Qaror #33) data-gap, real backend manbasi ulanmagan. DoD ikki yo'l beradi: (a) kamida vizual jihatdan aniq "tez orada" ko'rinish BERISH, YOKI (b) real backend data manbai bilan to'liq implementatsiya (alohida ds12/Qaror #33 doirasidagi feature sifatida).

Bu spec — **(a) yo'lini** asosiy reja sifatida tanlaydi (pastda sabab bilan) va (b) uchun kerak bo'ladigan ishni aniq follow-up sifatida hujjatlashtiradi, qurmasdan.

> ⚠️ **MUHIM — bu spec ticket matnining so'zma-so'z ko'rsatmasidan bitta joyda chetga chiqadi (foydalanuvchi tasdiqlashi kerak):** `WaitlistCard` uchun (a) yo'li ("coming soon" Tag) to'g'ridan-to'g'ri qo'llanadi. Lekin `DayStatsCard`ning "Bo'sh slot" tile'i uchun tekshiruv (§2.2) shuni ko'rsatdi — xuddi shu rail'da, xuddi shu `appointments.free_slots` labeli bilan, `FreeSlotsCard` **allaqachon real jonli ma'lumot ko'rsatadi** (`schedule.view` ruxsati bo'lgan foydalanuvchilar uchun). Agar `DayStatsCard` tile'iga ham "Tez orada" Tag qo'shilsa — bitta ekranda, bitta ustunda, bitta label ostida ikkita bir-biriga zid karta paydo bo'ladi: biri "hali yo'q" deydi, ikkinchisi pastda real sonlarni ko'rsatadi. Bu — hozirgi noaniq `—`dan **battar**: `—` noaniq, "Tez orada" esa qo'shni karta tomonidan **darhol yolg'onga chiqariladigan aniq da'vo**. Shu sababli bu spec `DayStatsCard` uchun **Task 2ni "coming soon" Tag qo'shish o'rniga tile'ni butunlay olib tashlashni** tavsiya qiladi (§4.2) — bu ticketning so'zma-so'z DoD variantlaridan (a)/(b) birortasiga to'g'ridan-to'g'ri mos kelmaydi, lekin ticketning tub maqsadini ("stub haqiqiy natijadan farqlanishi kerak") to'g'riroq bajaradi. **Amalga oshirishdan oldin foydalanuvchi tasdiqlashi so'raladi.**

---

## 2. Tekshiruv — har ikkala komponentning holati

### 2.1 `WaitlistCard.tsx` (17-58 qator, to'liq o'qildi)

`CalendarScreen.tsx:304`da `<WaitlistCard appts={apptList} />` deb chaqiriladi (`apptList = useMemo(() => appts ?? [], [appts])` — real appointment ro'yxati, DayStatsCard bilan bir xil manba). Ammo komponent:

```tsx
export function WaitlistCard(_props: { appts?: Appointment[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ ...chrome }}>
      <span>{t('appointments.waitlist.title')}</span>
      <div data-testid="waitlist-empty" style={{ ...dashedBox }}>
        {t('appointments.waitlist.empty')}
      </div>
    </div>
  );
}
```

`_props` prefiksi (`_`) ochiq ko'rsatadi — `appts` propi **hech qachon o'qilmaydi**. Fayl komment (4-13 qator): "Live data / endpoint / 'Slotga joylashtirish' amali JO'NATILMAYDI — bu ham data-gap, ham yangi feature (ds12 / Qaror #33)."

**Backend tekshiruvi:** `grep -rli "waitlist" apps/api/src apps/web/src packages` — natija faqat 4 fayl: `WaitlistCard.tsx`, uning testi, `CalendarScreen.tsx` (import/chaqiruv) va ikkala i18n locale fayli (`appointments.waitlist.title/empty` kalitlari). **Backendda "kutish ro'yxati" tushunchasi umuman yo'q** — na jadval, na endpoint, na service. Bu — haqiqiy, to'liq data-gap (feature hali loyihalanmagan, faqat i18n string va bo'sh-holat UI skeleti bor).

### 2.2 `DayStatsCard.tsx` (12-92 qator, to'liq o'qildi)

`Jami` / `Tasdiqlangan` / `Kutilmoqda` — uchtasi ham `appts` propidan client-side hisoblanadi (`list.length`, `.filter(status===...)`) — bular **real** hisoblar, appointments ro'yxati orqali. To'rtinchi tile (58-59 qator):

```tsx
// "Bo'sh slot" — data manbai yo'q (ds12 data-gap) → placeholder.
{ key: 'free', labelKey: 'appointments.free_slots', value: '—' },
```

Komment (10-qator): `"Bo'sh slot" → — (data manbai yo'q — ds12 data-gap; backend chaqiruvi qo'shilmaydi)`.

**MUHIM TOPILMA:** Bu komment endi **eskirgan**. `CalendarScreen.tsx:301-303`da xuddi shu rail'da, `DayStatsCard`dan pastda, allaqachon **to'liq ishlaydigan** `FreeSlotsCard` bor:

```tsx
{hasPermission('schedule.view') && (
  <FreeSlotsCard branchId={branchId} date={localDateKey(date.toISOString())} enabled />
)}
```

`FreeSlotsCard.tsx` (to'liq o'qildi) — `useBranchAvailability({ branchId, date, enabled })` hook orqali **`GET /schedule/availability/branch`** (`schedule.view` ruxsati) chaqiradi, filialdagi barcha doktorlarning bo'sh slotlarini dedupe qilib ro'yxat + son (`slotLabels.length`) ko'rsatadi. Ya'ni **"bo'sh slot" ma'lumoti haqiqatda mavjud va allaqachon shu ekranda jonli render qilinmoqda** — faqat alohida kartada, `DayStatsCard`ning KPI tile'iga ulanmagan holda.

Demak `DayStatsCard`dagi "data manbai yo'q" degan asos **noto'g'ri** — manba bor, lekin `DayStatsCard`ning o'ziga ulanmagan. Buning sabablari (to'liq ulash hozir qilinmayotgani uchun):

1. `DayStatsCard` hozir faqat `{ appts }` prop oladi — `branchId`/`date` yo'q. To'liq ulash uchun `CalendarScreen`dan qo'shimcha 2 prop uzatish kerak.
2. `FreeSlotsCard` allaqachon `hasPermission('schedule.view')` bilan **chaqiruvchida** gate qilingan (CLI-153 darsi — cheklangan rollarda 403 oldini olish uchun). `DayStatsCard` esa **har doim** render qilinadi (permission tekshiruvisiz) — agar shu tile `useBranchAvailability`ni to'g'ridan chaqirsa, xuddi shu gate `DayStatsCard` ichida ham takrorlanishi kerak (yoki prop orqali uzatilishi), aks holda `schedule.view`siz rollarda 403/xato holat paydo bo'ladi.
3. Ikkita komponent (`DayStatsCard` tile + `FreeSlotsCard`) bir xil querini ikki marta chaqiradi (TanStack Query bir xil key bilan dedupe qiladi, lekin loading/error holatlarini ikki joyda alohida boshqarish kerak bo'ladi) — yoki tile qiymati `FreeSlotsCard`dan yuqoriga ko'tarilishi (lifting state up, `CalendarScreen` darajasida bitta `useBranchAvailability` chaqiruvi + ikkala komponentga natija uzatish) kerak bo'ladi — bu ikkala komponent signature'ini o'zgartiradigan refactor.

Bu — **haqiqiy, bajarish mumkin bo'lgan follow-up** (data manbai mavjud), lekin ticket doirasidan (UI-polish, "vizual aniqlik") tashqari — prop-threading + permission-gating + potentsial state-lifting refactor talab qiladi.

**Yana bir muhim oqibat (bevosita ticket matnida so'ralmagan, lekin tekshiruv paydo qildi):** `CalendarScreen.tsx:297-304`da ikkalasi ham bir xil rail-ustunda ketma-ket render qilinadi:

```tsx
<DayStatsCard appts={apptList} />
{hasPermission('schedule.view') && (
  <FreeSlotsCard branchId={branchId} date={localDateKey(date.toISOString())} enabled />
)}
<WaitlistCard appts={apptList} />
```

`schedule.view` ruxsati bor foydalanuvchi uchun bitta ekranda **ikkita** "Bo'sh vaqtlar" (`t('appointments.free_slots')` — bir xil label!) kartasi ko'rinadi: yuqoridagi `DayStatsCard` tile — statik `—`, pastdagi `FreeSlotsCard` — real son + ro'yxat. Bu — ticket ochilishidan oldin ham mavjud bo'lgan, lekin ticketda tilga olinmagan **ikkinchi, bog'liq muammo**: hatto `—` ham (Tag qo'shilmasdan) allaqachon chalkash — ayni paytda pastda real ma'lumot ko'rinib turibdi. Agar bu tile'ga "Tez orada" Tag qo'shilsa, chalkashlik **aniq ziddiyatga** aylanadi (§ yuqoridagi ogohlantirish qutisi). Shuning uchun bu tile uchun to'g'ri chora — Tag qo'shish emas, **tile'ni olib tashlash** (§4.2).

---

## 3. Mavjud "coming soon" pattern — topildi va tekshirildi

`grep -rn "coming_soon" apps/web/src packages/i18n/src` → yagona manba `apps/web/src/shell/Sidebar.tsx:211-223` (disabled nav-item):

```tsx
<span aria-disabled="true" title={t('shell.coming_soon')}>
  <Icon />
  <span className={classes.label}>{label}</span>
  <span className={classes.soon}>{t('shell.coming_soon')}</span>
</span>
```

`.soon` CSS-class (`Sidebar.module.css:102-111`) — kichik badge: mono shrift, uppercase, `letter-spacing`, 1px border, rounded pill (`border-radius: 20px`), `padding: 1px 6px`, rang `--text-3`. **Komponentlashtirilmagan** — faqat `Sidebar` ichida, CSS-module-bog'liq (CLI-372 spec ham xuddi shu xulosaga keladi: `packages/ui`da qayta ishlatiladigan "ComingSoonBadge" yo'q).

`shell.coming_soon` tarjima kaliti (`uz: "Tez orada"`, `ru: "Скоро"`) — namespace `shell` bo'lsa-da, matn generic va CLI-372 tomonidan allaqachon boshqa featurega (Integrations Connect/Configure tugmalari) qayta ishlatilgan (precedent — yangi dublikat kalit qo'shilmagan).

**`WaitlistCard`/`DayStatsCard` uchun tanlov:** CLI-372dagi holatdan farqli o'laroq (u yerda `Button`, tooltip+disabled pattern mos edi), bu ikki komponent **interaktiv emas** (button yo'q) — doimiy ko'rinadigan statik karta/tile. Tooltip-only yechim mos kelmaydi, chunki DoD "vizual jihatdan farqlanadigan" deydi — hover talab qiladigan narsa doim-ko'rinadigan farq bermaydi. Shuning uchun **doim-ko'rinadigan neytral label** kerak.

`packages/ui/STATUS-INDICATORS.md` (CLI-181) konvensiyasiga ko'ra:

| Vosita | Qachon |
|---|---|
| `StatusPill` | semantik status (cheklangan enum) |
| **`Tag`** | **neytral yorliq, semantikasiz erkin matn** |
| `Badge` | dinamik/enum'ga sig'maydigan |

"Tez orada" — semantik status emas, oddiy neytral label → **`Tag`** (`@dental/ui`, `packages/ui/src/primitives/Tag/Tag.tsx`) to'g'ri tanlov: `<Tag>{t('shell.coming_soon')}</Tag>`. Bu — mavjud, allaqachon eksport qilingan (`packages/ui/src/index.ts` → `./primitives`), loyihaning belgilangan konvensiyasiga mos primitiv; yangi CSS yoki komponent yozilmaydi.

---

## 4. Yondashuv — tanlangan yechim (kichik scope, birlamchi reja)

**Ikkala komponentga ham `@dental/ui` `Tag` bilan `t('shell.coming_soon')` doim-ko'rinadigan label qo'shish — mavjud bo'sh-holat/placeholder qatoriga, uni almashtirmasdan.**

### 4.1 `WaitlistCard`

Hozirgi `data-testid="waitlist-empty"` bo'sh-holat qutisi ichiga (yoki undan yuqorida, sarlavha qatorida) `<Tag>{t('shell.coming_soon')}</Tag>` qo'shiladi. Matn `appointments.waitlist.empty` ("Hozircha kutish ro'yxati bo'sh") o'zgarmaydi — u hali ham to'g'ri umumiy bo'sh-holat xabari; `Tag` shunchaki **nega** doim bo'sh ekanini vizual ravishda aniqlashtiradi (feature hali yo'q, real bo'sh natija emas).

### 4.2 `DayStatsCard` — tile'ni olib tashlash (Tag QO'SHILMAYDI — yuqoridagi ogohlantirish qutisiga qarang)

Dastlabki reja (WaitlistCard bilan bir xil — Tag qo'shish) §2.2 oxiridagi topilma tufayli **rad etildi**: `FreeSlotsCard` xuddi shu rail'da, xuddi shu labelda, real ma'lumot bilan allaqachon ko'rinadi — Tag qo'shish "hali yo'q" (Tag) va "mana, bor" (FreeSlotsCard) degan ikkita ziddiyatli da'voni bitta ekranda qo'yib qo'yadi.

**Tanlangan yechim:** `tiles` massividan `free` tile'ni butunlay olib tashlash. `DayStatsCard` faqat 3 tile qaytaradi: `total` / `confirmed` / `pending`. Sabab-natija zanjiri:

- `schedule.view` bor foydalanuvchi uchun — "Bo'sh vaqtlar" ma'lumoti pastdagi `FreeSlotsCard`da bor va to'liq ishlaydi; `DayStatsCard`dagi statik `—` tile shunchaki **ortiqcha va chalg'ituvchi dublikat**, hech qanday qo'shimcha ma'lumot bermaydi.
- `schedule.view` yo'q foydalanuvchi uchun — `FreeSlotsCard` umuman render qilinmaydi (permission-gate), lekin bu foydalanuvchi baribir "bo'sh slot" ma'lumotini ko'rish huquqiga ega emas (`schedule.view` aynan shu ma'lumotni qo'riqlaydi) — demak bu foydalanuvchiga ham statik `—` yoki "Tez orada" ko'rsatish ma'nosiz (ular baribir ruxsatga ega bo'lmaguncha bu ma'lumotni ololmaydi); tile'ning yo'qligi ular uchun ham to'g'ri.
- Grid layout (`gridTemplateColumns: '1fr 1fr'`) 4 emas endi 3 tile bilan ishlaydi — CSS grid avtomatik 2-qatorga bitta tile + bitta bo'sh katak qoladi (vizual jihatdan kam simmetrik, lekin funksional; grid o'zgartirilmaydi, chunki ticket scope'i faqat "aniqlik", pixel-perfect grid retuning emas).

Bu — ticketning so'zma-so'z ikkita DoD variantidan ("Tag qo'shish" YOKI "to'liq implementatsiya qurish") birortasi emas, **uchinchi yo'l** (olib tashlash) — shuning uchun yuqoridagi ogohlantirish qutisida alohida ta'kidlangan va foydalanuvchi tasdig'iga taqdim etiladi.

### Rad etilgan muqobillar

- ❌ **`DayStatsCard`ning "Bo'sh slot" tile'iga ham WaitlistCard kabi "Tez orada" Tag qo'shish.** Dastlabki reja edi, lekin §2.2 aniqladi — bu ziddiyat yaratadi (Tag "yo'q" deydi, `FreeSlotsCard` pastda "bor" deb ko'rsatadi bir xil labelda). Hozirgi noaniq `—`dan ham battar bo'lardi.
- ❌ **To'liq implementatsiya (DayStatsCard → `useBranchAvailability` ulash).** §2.2da ko'rsatilganidek, texnik jihatdan mumkin (data manbai bor — aslida `FreeSlotsCard` orqali allaqachon ko'rinmoqda), lekin prop-threading (`branchId`/`date`) + permission-gate takrorlash (CLI-153 pattern) + `FreeSlotsCard` bilan potentsial state-lifting/dedupe refactor talab qiladi — bu ticketning "UI-polish" doirasidan katta VA amalda `FreeSlotsCard`ni takrorlagan bo'lardi (ikkita joyda bir xil son). Alohida ds12/Qaror #33 ticket sifatida qoldiriladi (pastdagi Follow-up) — ehtimol kerak ham emas, chunki `FreeSlotsCard` allaqachon vazifani bajaradi.
- ❌ **WaitlistCard uchun ham real endpoint qurish.** Backendda "kutish ro'yxati" tushunchasi butunlay yo'q (§2.1) — bu to'liq yangi feature (jadval + service + route + UI amal "Slotga joylashtirish"), Medium-priority UI-polish ticket doirasidan tashqarida.
- ❌ **Yangi CSS-badge yozish (Sidebar `.soon`ga o'xshash inline style, WaitlistCard uchun).** `@dental/ui` `Tag` allaqachon xuddi shu vizual maqsadga (neytral label) mo'ljallangan, eksport qilingan primitiv — uni takrorlash DRY buzadi.
- ❌ **Tooltip-only (`title` yoki Mantine `Tooltip`, WaitlistCard uchun).** Statik, hover'siz doim-ko'rinadigan kartalar uchun kam foydali — DoD "vizual jihatdan aniq" talabini hover ortida yashirib qo'yadi.

---

## 5. Follow-up (bu ticketda QURILMAYDI — hujjatlashtirilgan)

Agar kelajakda **to'liq implementatsiya** yo'li tanlansa (DoD §b), quyidagilar kerak bo'ladi — yangi Linear ticket (ds12/Qaror #33 doirasida):

- **DayStatsCard "Bo'sh slot":** bu spec tile'ni **olib tashlashni** tavsiya qiladi (§4.2), chunki `FreeSlotsCard` allaqachon aynan shu ma'lumotni (`useBranchAvailability` / `GET /schedule/availability/branch`, `schedule.view`) xuddi shu rail'da ko'rsatadi — follow-up ehtimol **kerak emas**. Agar kelajakda baribir KPI-tile shaklida (masalan bosh sahifa dashboard'ida, `FreeSlotsCard` yo'q joyda) kerak bo'lsa: (1) `CalendarScreen`dan `branchId`+`date` propini uzatish, (2) `schedule.view` permission-gate takrorlash yoki state-lifting, (3) `FreeSlotsCard` bilan bitta query manbasini ulashish (dublikat fetch/holat oldini olish uchun).
- **WaitlistCard:** data manbai **umuman yo'q** — yangi backend feature: jadval (masalan `waitlist_entries`), service/route (`waitlist.view`/`waitlist.manage` permission), "Slotga joylashtirish" amali (appointment yaratish bilan integratsiya). Bu — to'liq yangi klinik feature, faqat UI-polish emas.

---

## 6. DoD

- [ ] **Foydalanuvchi ushbu specdagi ⚠️ ogohlantirishni (DayStatsCard tile olib tashlanishi, Tag emas) ko'rib chiqib tasdiqlagan** — bu ticketning so'zma-so'z ikkita variantidan (Tag / to'liq implementatsiya) farqli uchinchi yo'l.
- [ ] `WaitlistCard.tsx` — bo'sh-holat qatoriga `@dental/ui` `Tag` bilan `t('shell.coming_soon')` qo'shilgan (yangi i18n kalit yo'q).
- [ ] `DayStatsCard.tsx` — "Bo'sh slot" (`key: 'free'`) tile `tiles` massividan olib tashlangan; qolgan 3 tile (`total`/`confirmed`/`pending`) o'zgarmaydi va hamon real ma'lumot ko'rsatadi.
- [ ] Ikkala komponentda mavjud testlar (`WaitlistCard.test.tsx`, `DayStatsCard.test.tsx`) yangilanadi va PASS bo'ladi (`waitlist-empty` testid saqlanadi + yangi coming-soon assertion; `DayStatsCard`ning eski `'"Bo‘sh slot" data manbai yo‘q → — placeholder'` testi endi tile yo'qligini tekshiradigan testga almashtiriladi — pastdagi reja Task 2, Step 1ga qarang).
- [ ] Yangi hardcoded UI matn yo'q — hammasi `t()` orqali, mavjud `shell.coming_soon` kaliti qayta ishlatilgan (dublikat kalit qo'shilmagan).
- [ ] `bun run typecheck` (`apps/web`) toza.
- [ ] Follow-up (to'liq implementatsiya, §5) — bu PR/branch'da QURILMAYDI, faqat ushbu specda hujjatlashtiriladi (kelajakda alohida ticket, ehtimol kerak ham emas — §5ga qarang).
