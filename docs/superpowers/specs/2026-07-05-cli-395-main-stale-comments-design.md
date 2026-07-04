# CLI-395 — `apps/desktop/src/main.ts` eskirgan izohlarini tuzatish (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-395 (Low)
> **Scope:** `apps/desktop/src/main.ts` — faqat 30-38 qatorlardagi `⚠️ TASHQI BOG'LIQLIK (jonli, TODO):` izoh bloki. Kod (runtime xatti-harakat) o'zgarmaydi — faqat izoh matni.

---

## 1. Muammo

`main.ts`ning bosh docblock'ida (1-39 qatorlar) `⚠️ TASHQI BOG'LIQLIK (jonli, TODO):` sarlavhali 3 bandli ro'yxat bor (30-38 qatorlar). Ikkita band eskirgan/noto'g'ri:

1. **`assets/tray-icon.png` band (31-32 qator):** "hali repo'da yo'q" deydi. **Noto'g'ri** — CLI-367 placeholder ikonka qo'shgan (commit `9819593`, `chore(desktop): add placeholder tray/build icon assets pending real brand artwork (CLI-367)`). Fayl mavjudligi tasdiqlandi: `apps/desktop/assets/tray-icon.png` (3.7K, mavjud).
2. **Web `/settings` band (37-38 qator):** "`window.dentalDesktop?.setServerUrl(url)`ni hali chaqirmaydi" deydi. **Noto'g'ri** — CLI-360 `DesktopServerConnectionCard.tsx` qurgan va ulagan (commit `c4387b7`, `feat(web): DesktopServerConnectionCard skeleton (CLI-360 Task 1)`). Tasdiqlandi:
   - `apps/web/src/features/settings/components/DesktopServerConnectionCard.tsx:33` — `await window.dentalDesktop?.setServerUrl(serverUrl.trim())` chaqiradi.
   - Komponent `IntegrationsSettingsScreen.tsx:70`da render qilinadi, bu screen `settings.routes.tsx:59`da `lazy()` route sifatida ro'yxatdan o'tgan — ya'ni haqiqatan foydalanuvchiga yetib boradigan, ulangan UI (o'lik kod emas).

Bu — CLI-382 patternining takrorlanishi: o'sha ticket ham xuddi shu blokdagi eskirgan bandlarni tuzatgan edi (commit `bf16faa`, `/activate` sahifasi bandi + `preload.cjs` bandi), lekin ikkita band (tray-icon, settings) o'zgarishsiz qoldirilgan edi — ular endi CLI-360/CLI-367dan keyin o'zi eskirdi.

### Qo'shimcha topilma (ticket'da nomlanmagan, lekin muhim)

Ticket faqat 2 ta faktik da'voni noto'g'ri deb ataydi. Blokni to'liq o'qiganda **uchinchi masala — kontent emas, balki sarlavha** topildi:

- **`preload.cjs` bandi (33-36 qator) o'zi FAKTIK jihatdan stale EMAS** — u CLI-382 tomonidan allaqachon to'g'irlangan va commit `165ddc5`ga rostdan ham to'g'ri havola qiladi (`git log --oneline -1 165ddc5` → `fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)`, mavjud).
- Ammo bu band **"tekshirilgan va tuzatilgan" (o'tmishda hal qilingan) voqeani** tasvirlaydi, sarlavha esa `TASHQI BOG'LIQLIK (jonli, TODO)` — ya'ni "jonli, hali qilinishi kerak". Ikkala qolgan band ham (tray-icon, settings) shu ticket bilan hal qilingansiz, **sarlavha ostida "jonli TODO" deb qoladigan hech narsa qolmaydi** — lekin sarlavhaning o'zi o'zgarmasa, u ham xuddi shu "stale claim" muammosini takrorlaydi (endi "jonli TODO" deb nomi qolgan blokda birorta ham jonli TODO yo'q).
- Bu — aynan CLI-382 → CLI-395 takrorlanishining ildizi: band-kontentni yangilash yetarli emas, chunki sarlavha o'zi keyingi safar yana "stale" bo'lib qoladi.

## 2. Yondashuv

**Faqat band matnini "hal qilindi" deb belgilash (CLI-382'dagi kabi) YETARLI EMAS** — chunki shu bilan sarlavha ("jonli, TODO") noaniq/noto'g'ri holda qoladi va muammo faqat kechiktiriladi (uchinchi marta takrorlanish xavfi). Shuning uchun qat'iyroq restructure:

1. **Tray-icon band (31-32 qator) va Web `/settings` band (37-38 qator) — butunlay olib tashlanadi.** Ular endi hal qilingan, orqaga qaytish (forward) qiymati yo'q (hech qanday kodga bog'liq eslatma emas, faqat status haqida edi) — DoD "mark resolved OR remove" ikkalasini ham ruxsat beradi, bu holatda **remove** to'g'ri tanlov, chunki qoldirish faqat yana bir "eskirganda tozalash kerak bo'ladigan status yozuvi" qo'shadi.
2. **`preload.cjs` bandi (33-36 qator) — SAQLANADI, lekin sarlavha o'zgaradi.** Sababi: bu band shunchaki "eski TODO" emas — u **doimiy texnik cheklovni** hujjatlashtiradi (`preload.cjs` CommonJS/`sandbox:true` bo'lishi SHART, aks holda blank-screen bug qaytadi). Bundan tashqari, shu faylning pastida (65-qator) `PRELOAD_PATH` konstantasi ustidagi izoh **aynan shu bandga orqaga havola qiladi**: `// `.cjs` — `preload.cts` (CommonJS, sandbox:true talabi; ESM emas, izohiga qarang).` — agar bandni olib tashlasak, bu "izohiga qarang" havolasi osilib qoladi (dangling reference). Shuning uchun band matni deyarli o'zgarmaydi, faqat sarlavha "jonli, TODO" dan **doimiy cheklov/eslatma** ma'nosiga o'tadi — "hal qilingan tarixiy voqea" emas, balki "hozir ham amal qiladigan qoida" sifatida.
3. Natijada: 9 qatorlik 3-bandli TODO ro'yxati → 5 qatorlik bitta band, yangi sarlavha bilan, faqat haqiqatan hali ham dolzarb (evergreen) ma'lumotni saqlaydi.

## 3. DoD

- [ ] `main.ts:30-38`dagi `assets/tray-icon.png` bandi olib tashlangan (endi mavjud, CLI-367/`9819593`).
- [ ] `main.ts:30-38`dagi Web `/settings` bandi olib tashlangan (endi ulangan, CLI-360/`c4387b7`).
- [ ] `preload.cjs` bandi saqlanadi (matn deyarli o'zgarmaydi) — 65-qatordagi `izohiga qarang` havolasi dangling bo'lib qolmasligi uchun.
- [ ] Sarlavha `⚠️ TASHQI BOG'LIQLIK (jonli, TODO):` dan "doimiy cheklov" ma'nosiga o'zgartiriladi — endi hech qanday "jonli TODO" tasvirlamaydi.
- [ ] Kod (runtime xatti-harakat, import'lar, funksiyalar) o'zgarmaydi — faqat izoh matni.
- [ ] `bun run typecheck` (yoki `apps/desktop`ning typecheck skripti) toza qoladi (izoh-only o'zgarish, lekin tekshirib chiqish kerak).
