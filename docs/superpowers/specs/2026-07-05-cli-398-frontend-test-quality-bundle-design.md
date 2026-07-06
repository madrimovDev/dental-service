# CLI-398 — Frontend test-sifat nuqsonlari to'plami (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-398 (Low, round-2 audit — 4 kichik masala)
> **Scope:** `apps/web/src/features/appointments/components/WaitlistCard.test.tsx`, `apps/web/src/features/auth/pages/select-workspace.page.test.tsx`, `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx(.test.tsx)`, `apps/web/src/features/settings/components/IntegrationsSettingsScreen.test.tsx`, `apps/web/src/features/cashier/components/PosPanel.tsx`.

---

## 1. Maqsad (Goal)

Round-2 audit topgan 4 ta kichik, bir-biriga bog'liq bo'lmagan test-sifat/i18n nuqsonini tuzatish: (1) ikkita test hardcoded o'zbekcha tarjima matniga bog'langan (brittle, ru-locale yo'lini hech qachon tekshirmaydi); (2) `DesktopServerConnectionCard`da tayyor "ulanmoqda..." i18n kaliti hech qayerda render qilinmaydi (dead key) va in-flight holat testlanmagan; (3) `IntegrationsSettingsScreen.test.tsx`dagi bir test nomi "disabled VA tooltip ko'rsatiladi" deb da'vo qiladi, lekin faqat disabled'ni tekshiradi — soxta ishonch; (4) `PosPanel.tsx`da `t('cashier.noop_fiscal', 'hardcoded uz default')` — sibling chaqiruv (`ReceiptModal.tsx:257`)dan farqli — ortiqcha inline default kalitni yo'qolgan holatda ham "ishlab turgandek" ko'rsatadi.

Har 4 ta tuzatish mustaqil, bir-biriga bog'liq emas — parallel/har xil tartibda bajarilishi mumkin.

## 2. Yondashuv (Approach)

### 2.1. Item 1 — WaitlistCard + SelectWorkspacePage: hardcoded matn → `i18n.t(...)`

**Joriy holat:**
- `WaitlistCard.test.tsx:26`: `expect(screen.getByTestId('waitlist-coming-soon')).toHaveTextContent('Tez orada')` — komponent `t('shell.coming_soon')` chaqiradi (`WaitlistCard.tsx:60`), test esa uz tarjimasining literal natijasini kutadi.
- `select-workspace.page.test.tsx:46`: `expect(screen.getByText('Egasi')).toBeInTheDocument()` — komponent `t('auth.select_workspace.owner_badge')` chaqiradi (`select-workspace.page.tsx:150`).

**Qaror:** ikkala assertsiyani `i18n.t('shell.coming_soon')` / `i18n.t('auth.select_workspace.owner_badge')` chaqiruviga almashtiramiz — kodbazada bu naqsh allaqachon bor va ishlatiladi (`IntegrationsSettingsScreen.test.tsx:15`, `DesktopServerConnectionCard.test.tsx` bir nechta joyda: `i18n.t('settings.desktop_server_url_required')` va h.k.), yangi pattern kiritilmaydi. `i18n` singleton `@/lib/i18n.ts`dan import qilinadi (`test-utils.tsx` ham xuddi shu instansdan `I18nextProvider`ni to'ldiradi — bir xil resolved til).

**Scope chegarasi (qasddan):** bu fix testni faqat *locale-mustaqil* qiladi — `i18n.t(key)` joriy faol tilda (default `uz`, `DEFAULT_LANGUAGE`) qanday qiymat chiqarsa, o'shani tekshiradi, komponentning haqiqiy chiqishi bilan taqqoslaydi. Bu ticket item 1'dagi "never exercises the ru-locale path" tanqidini **hal qilmaydi va hal qilishga urinmaydi** — ya'ni yangi "ru tilida render qilib tekshirish" testi **qo'shilmaydi**. Sabab: (a) ticket DoD "fix each of the 4 items as described" — tavsif faqat hardcode'ni olib tashlashni so'raydi, alohida ru-run talab qilmaydi; (b) `i18n` global singleton `test-utils.tsx` orqali barcha testlar bo'ylab bo'lishiladi — mid-suite `i18n.changeLanguage('ru')` chaqirish keyingi testlarga til sizib chiqishi xavfini tug'diradi (test-isolation regressiyasi), bu 4-itemlik "kichik tozalash" bundle uchun nomutanosib qo'shimcha risk. `i18n.t(key)` yechimi ru-locale'da ham **to'g'ri ishlaydi** (agar kimdir kelajakda shu testni ru kontekstida qayta ishlatsa) — faqat *bugungi kunda* ru bilan ishga tushirilmaydi, bu qasddan qoldirilgan gap emas, chunki fix maqsadi "brittle bo'lmaslik", "ru'ni sinash" emas.

### 2.2. Item 2 — `DesktopServerConnectionCard`: "ulanmoqda..." holatini ulash (wire, delete emas)

**Joriy holat:** komponentda `isSubmitting` state bor, `Button`ga `loading={isSubmitting}` beriladi (spinner ko'rinadi), lekin tugma matni doim `t('settings.desktop_server_connect_button')` ("Ulash") — hech qachon `settings.desktop_server_connecting` ("Ulanmoqda...") ga almashmaydi. Ikkala locale faylida (`uz.json:379`, `ru.json:379`) kalit **to'liq, sifatli tarjima qilingan holda** allaqachon mavjud — bu tasodifiy qoldiq emas, balki ishlatilishi mo'ljallangan, lekin unutilgan ulash.

**Qaror: WIRE (ulash), delete emas.** Ikkita sabab: (a) locale kalitlari haqiqiy, mazmunli tarjima — o'chirish ishlatilishi mumkin bo'lgan ishni yo'qotadi va DoD'dagi "should be wired into the UI... with a test, OR removed if truly not needed" formulasi aynan shu holat uchun "wire"ni afzal ko'radi (kalit "truly not needed" emas — u to'liq tayyor); (b) ticketning o'zi ikki nuqsonni birlashtiradi — **yo'q in-flight test** VA **dead key**. Kalitni o'chirish faqat (b)ni yopadi, (a) — in-flight holat uchun test yo'qligi — baribir qarzda qoladi (loading spinner testlanmagan holicha qoladi). Wiring ikkalasini bir vaqtda yopadi: tugma matnini `isSubmitting` holatida almashtirish + o'sha holatni tekshiruvchi test — ham dead key yo'qoladi, ham in-flight holat testlanadi.

**Aniq o'zgarish:** `DesktopServerConnectionCard.tsx`dagi `Button` bolasi:
```tsx
{isSubmitting ? t('settings.desktop_server_connecting') : t('settings.desktop_server_connect_button')}
```
**Locale fayllar o'zgarmaydi** — `desktop_server_connecting` kaliti uz/ru ikkalasida ham allaqachon bor (yuqorida), implementator yangi/dublikat kalit qo'shmasin.

**Test mexanikasi:** Mantine `Button`ning `loading` prop'i bolalarni DOM'dan olib tashlamaydi (opacity bilan yashiradi, `queryByText`/`findByText` orqali hali ham topiladi) — shuning uchun matn almashinuvini test qilish uchun maxsus `loading`-state DOM query kerak emas, oddiy `findByText` yetarli. Test — `setServerUrl` chaqiruvini **deferred (hali resolve qilinmagan) promise** bilan mock qiladi, tugma bosilgach `isSubmitting=true` holatda ekanida `findByText(i18n.t('settings.desktop_server_connecting'))` topiladi va `t('settings.desktop_server_connect_button')` matni yo'qligi tasdiqlanadi; keyin promise `resolve` qilinib, muvaffaqiyat oqimi (mavjud testlar) buzilmagani ta'minlanadi.

### 2.3. Item 3 — `IntegrationsSettingsScreen.test.tsx`: tooltip matnini haqiqatan tekshirish

**Joriy holat:** test nomi `'Connect/Configure tugmalari disabled va "tez orada" tooltip ko'rsatadi'` (41-49-qator), lekin tanadagi yagona assertsiya — `for (const button of buttons) expect(button).toBeDisabled()`. Tooltip matni (`Tooltip label={t('shell.coming_soon')}`, `IntegrationsSettingsScreen.tsx:140,148`) hech qachon tekshirilmaydi.

**Mexanik cheklov (muhim):** Mantine `Tooltip` faqat `tooltip.opened === true` bo'lganda `label`ni DOM'ga mount qiladi (`mounted: !disabled && !!tooltip.opened`, `Tooltip.cjs:154`) — default holatda **yopiq**, ya'ni `getByText`/`queryByText` bilan darhol topilmaydi. Bundan tashqari, Tooltip'ning `ref` nishoni (`tooltip.reference`) — `Button`ni o'rab turgan `<span style={{alignSelf:'flex-start'}}>` (aynan shuning uchun span bor: disabled tugma pointer-hodisalarni tabiiy tarzda otmaydi, span esa otadi). Shu sabab hover **span'ga**, tugmaning o'ziga emas, berilishi kerak: `button.parentElement`.

**Qaror:** mavjud `.toBeDisabled()` siklini saqlab, ustiga bitta hover+assert qo'shamiz: birinchi tugmaning ota-span'iga `fireEvent.mouseEnter` beriladi, so'ng **async** `await screen.findByText(i18n.t('shell.coming_soon'))` bilan tooltip matni tasdiqlanadi (`getByText` emas — chunki mount kechikishi/animatsiya tugashi kerak bo'lishi mumkin). Bu testni nomiga mos qiladi: endi ham "disabled", ham "tooltip ko'rsatiladi" haqiqatan tekshiriladi.

### 2.4. Item 4 — `PosPanel.tsx`: ortiqcha inline default olib tashlash

**Joriy holat:** `PosPanel.tsx:434`: `t('cashier.noop_fiscal', 'Fiskal hujjat keyinroq Soliqqa yuboriladi')` — ikkinchi argument (i18next default value) `cashier.noop_fiscal` kalitining o'zining uz tarjimasi bilan **so'zma-so'z bir xil** (`uz.json:1089`). Sibling chaqiruv `ReceiptModal.tsx:257`: `t('cashier.noop_fiscal')` — defaultsiz, to'g'ri.

**Nega bu muammo:** i18next'da 2-argument faqat **kalit topilmagan** holatda ishlatiladi. Kalit ikkala locale faylida (`uz.json:1089`, `ru.json:1089`) haqiqiy tarjima bilan mavjud — demak default hech qachon amalda triggerlanmaydi, lekin agar kimdir kelajakda kalitni tasodifan o'chirib qo'ysa (masalan ru.json'dan), **ru interfeysida ham uzbekcha matn** ko'rinadi (chunki fallback — uz literal string, ru emas) — bu aynan "missing-key" holatini yashiradigan, aniqlanishi qiyin xato.

**Qaror:** ikkinchi argumentni olib tashlab, `ReceiptModal.tsx:257` bilan bir xil shaklga keltiramiz: `t('cashier.noop_fiscal')`. Locale fayllar o'zgarmaydi (kalit allaqachon ikkalasida ham bor).

## 3. Won't-fix / scope tashqarisida

- Item 1: ru-locale'da haqiqatan render qilib tekshiradigan yangi test qo'shilmaydi (§2.1'dagi sabab).
- Item 2: `settings.desktop_server_connecting` kalitidan tashqari boshqa i18n kalit qo'shilmaydi/o'zgartirilmaydi.
- Item 3: faqat bitta tugma uchun tooltip tekshiriladi (barcha 4 tasi uchun emas) — bir xil `Tooltip label` barcha kartalarda ishlatilgani uchun bitta namuna yetarli, testni keraksiz shishirmaslik uchun.

## 4. DoD

- [ ] `WaitlistCard.test.tsx:26` va `select-workspace.page.test.tsx:46` — hardcoded matn o'rniga `i18n.t(...)` chaqiradi.
- [ ] `DesktopServerConnectionCard.tsx` — `isSubmitting` holatida tugma matni `t('settings.desktop_server_connecting')`ga almashadi; yangi test in-flight holatni tekshiradi.
- [ ] `IntegrationsSettingsScreen.test.tsx` — tooltip matni `findByText` bilan haqiqatan tasdiqlanadi (nafaqat `.toBeDisabled()`).
- [ ] `PosPanel.tsx:434` — ortiqcha inline default olib tashlangan, `ReceiptModal.tsx:257` bilan bir xil shaklda.
- [ ] Mavjud testlar buzilmaydi, `turbo test --filter @dental/web` (yoki tegishli vitest fayllar) yashil.
- [ ] Typecheck toza.
