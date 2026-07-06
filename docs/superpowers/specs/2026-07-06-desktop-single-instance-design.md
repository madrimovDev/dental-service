# Desktop single-instance — dizayn (2026-07-06)

## Maqsad

Desktop Electron ilovasi bir vaqtda faqat bitta nusxada ishlashi kerak. Ikkinchi
nusxa ishga tushirilsa: yangi nusxa jim chiqadi, birinchi nusxaning oynasi
ko'rsatiladi/fokuslanadi (oyna yopiq — tray-only — bo'lsa, oxirgi URL'da qayta
ochiladi).

Motivatsiya: server rejimida ikkinchi instans postgres:5433/valkey:6380/api
portlariga qayta spawn urinib xato dialogi bilan yiqiladi; foydalanuvchi uchun
esa "ikki marta bosdim — ikkita ilova" chalkashligi.

## Tanlangan yondashuv (A)

Electron'ning o'z `app.requestSingleInstanceLock()` mexanizmi:

- Birinchi instans qulfni oladi va `second-instance` hodisasini tinglaydi.
- Ikkinchi nusxada `requestSingleInstanceLock()` `false` qaytaradi → `app.quit()`
  (hech qanday dialog yo'q — Windows'da odatiy xulq).
- `second-instance` kelganda birinchi instans:
  - oyna mavjud → `restore()` (minimallashtirilgan bo'lsa) + `show()` + `focus()`;
  - oyna yo'q (tray-only) → oxirgi ochilgan URL'da yangi oyna (`openBrowser`);
  - URL hali yo'q (klient "server topilmadi") → hech narsa qilmaydi.

Rad etilgan B varianti: qo'lda lock-fayl/port tekshiruvi — stale-lock muammolari,
Electron buni allaqachon hal qilgan.

## Komponentlar

- `apps/desktop/src/single-instance.ts` — DI factory (repo konvensiyasi:
  `settings-ipc.ts`/`auto-updater.ts` kabi, electron to'g'ridan import
  qilinmaydi): `setupSingleInstance(deps)` → `boolean` (qulf olindimi).
  Deps: `requestSingleInstanceLock()`, `quit()`, `onSecondInstance(handler)`,
  `getWindow()` (restore/show/focus qilinadigan oyna yoki null),
  `reopen()` (oyna yo'q holat uchun).
- `main.ts` wiring: modul yuqorisida chaqiriladi; qulf olinmagan bo'lsa
  `whenReady` ishi bajarilmaydi. `openBrowser` oxirgi URL'ni saqlaydi —
  `reopen` shu URL bilan `openBrowser`ni chaqiradi.

## Test

`single-instance.test.ts` (bun:test, fake deps):
1. qulf yo'q → `quit()` chaqiriladi, `false` qaytadi, second-instance handler
   ro'yxatdan o'tkazilmaydi;
2. qulf bor + second-instance + oyna mavjud (minimallashtirilgan) →
   restore+show+focus;
3. oyna yo'q → `reopen()` chaqiriladi;
4. oyna ham, URL ham yo'q (reopen berilmagan/no-op) — xato tashlamaydi.

Runtime tekshiruv: birinchi instans ishlab turganda ikkinchisi ishga
tushiriladi — ikkinchisi tez chiqishi, birinchi oyna ko'rinishi kerak.
