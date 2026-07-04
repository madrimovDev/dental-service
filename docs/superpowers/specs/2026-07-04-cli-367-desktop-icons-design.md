# CLI-367 — Desktop `tray-icon.png` va `build/icon.ico` assetlari yo'q (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-367 (Medium)
> **Scope:** `apps/desktop/src/tray.ts:31` (runtime), `apps/desktop/electron-builder.yml:47` (Windows packaging), `apps/desktop/assets/` (yo'q), `apps/desktop/build/` (faqat `installer.nsh` bor, `.ico` yo'q).

---

## 1. Maqsad

`apps/desktop/src/tray.ts:31` `../assets/tray-icon.png`ga ishora qiladi, lekin `apps/desktop/assets/` papkasi repo'da umuman yo'q. `apps/desktop/electron-builder.yml:47` `build/icon.ico`ga ishora qiladi, lekin `apps/desktop/build/` ichida faqat `installer.nsh` bor — `.ico` fayl yo'q (qatorning o'zida `# TODO(jonli): build/icon.ico hali yaratilmagan — real build oldidan qo'shilishi kerak` izohi bor). Natija: `createTray()` paketlangan build'da runtime'da muammo beradi; Windows NSIS build muvaffaqiyatsiz tugaydi yoki Electron standart ikonkasiga qaytadi.

**DoD (ticket'dan):** `apps/desktop/assets/tray-icon.png` va `apps/desktop/build/icon.ico` haqiqiy (brend/logo asosidagi) ikon fayllar qo'shiladi; NSIS build + tray runtime jismoniy Windows'da tasdiqlanadi (alohida kuzatiladi — CLI-361).

---

## 2. Tasdiqlangan joriy holat

### 2.1 `tray.ts:28-35` — aniq kutilgan format

```ts
let tray: Tray | null = null;

export const createTray = (role: AppRole, info: TrayInfo, callbacks: TrayCallbacks): void => {
  const iconPath = join(import.meta.dirname, '..', 'assets', 'tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Dental Service');
  updateTray(role, info, callbacks);
};
```

- Kutilgan format: **PNG** (`nativeImage.createFromPath` kengaytmadan formatni aniqlaydi; kodda hech qanday `resize()`/`crop()` chaqiruvi yo'q — fayl o'ziga xos o'lchamda ishlatiladi, birorta implicit scaling yo'q).
- Fayl mavjud bo'lmasa xatolik boshqarilmaydi: `nativeImage.createFromPath` Electron hujjatiga ko'ra fayl topilmasa **bo'sh (empty) `NativeImage` qaytaradi, throw qilmaydi** — lekin keyingi qatordagi `new Tray(emptyImage)` konstruktori bo'sh/yaroqsiz image bilan platforma (Windows/macOS/Linux) va Electron versiyasiga qarab **noaniq xatti-harakat** beradi: ko'rinmas/bo'sh tray ikonkasidan tortib native-darajadagi exception'gacha. Aynan shu — ticket'da yozilgan "createTray() will fail at runtime" xavfi.
- **Mavjud testlar bu holatni umuman tekshirmaydi:** `apps/desktop/src/test-electron-mock.ts:61` — `nativeImage: { createFromPath: (_path: string) => ({}) }` — fayl mavjudligidan qat'i nazar HAR DOIM muvaffaqiyatli bo'sh obyekt qaytaradi, `Tray` esa `FakeTray` (hech qachon throw qilmaydi). Ya'ni 8/8 mavjud `tray.test.ts` testi yashil bo'lishi real fayl mavjudligi haqida **hech qanday signal bermaydi** — bu real gap.

### 2.2 `electron-builder.yml:42-48` — Windows icon talabi

```yaml
win:
  target: nsis
  # TODO(jonli): build/icon.ico hali yaratilmagan — real build oldidan qo'shilishi kerak
  icon: build/icon.ico
```

- Path (`build/icon.ico`) allaqachon to'g'ri — o'zgarish shart emas, faqat fayl va TODO izohi masalasi.
- Windows NSIS uchun `.ico` **haqiqiy ICO konteyner formatida, ko'p-o'lchamli (odatda 16/32/48/256px freym)** bo'lishi kerak — oddiy PNG'ni `.ico`ga qayta nomlash ishlamaydi (electron-builder/NSIS buni rad etadi yoki noto'g'ri render qiladi).
- `apps/desktop/build/` `.gitignore`da maxsus un-ignore qilingan (`!apps/desktop/build/`, izoh: "electron-builder buildResources (icons, NSIS scripts) — versioned, not generated") — ya'ni `.ico` fayl **repo'da commit qilinishi kutilgan**, generatsiya-vaqtida yaratiladigan narsa emas.

### 2.3 Mavjud brend manba-art qidiruvi (repo bo'yicha to'liq)

Butun repo `*.png`/`*.svg`/`*.jpg`/`*.jpeg`/`*.ico` bo'yicha qidirildi (`node_modules`/`.git` chetlab) — **NOL natija**. Hech qanday logotip, favicon yoki boshqa brend rasm fayli repo'da mavjud emas.

Qiziq (lekin shu ticket doirasidan tashqari) tasdiqlangan fakt: `apps/web/index.html:5` `<link rel="icon" ... href="/favicon.svg" />` deb ishora qiladi, lekin `apps/web/public/` papkasi ham, `favicon.svg` fayli ham repo'da yo'q — veb-ilovaning o'zida ham hech qanday brend rasm-manba mavjud emas. Bu shuni tasdiqlaydi: **loyihada hozircha HECH QANDAY brend/logo source-art yo'q**, faqat `tray-icon.png`/`icon.ico` uchun emas — umuman.

→ **Xulosa: bu ticket'ning haqiqiy blokeri — DIZAYN aktivi, kod emas.** Coding agent birorta ham haqiqiy brend dizaynini "o'ylab topa" olmaydi va olmasligi kerak — bu inson (dizayner/mahsulot egasi) qarori.

---

## 3. Yondashuv

Reja ikki mustaqil qismga bo'linadi:

### 3.1 REAL KOD — `tray.ts` mudofaviy (defensive) xato boshqaruvi

`createTray()` ikon yuklashda/`Tray` konstruksiyasida xatolikka chidamli bo'lishi kerak: ikon fayli yo'q yoki yaroqsiz bo'lsa, ilova **crash bo'lmasdan**, aniq `console.warn` log qoldirib, tray'siz davom etishi kerak (`tray` `null` qoladi — mavjud kod allaqachon `tray?.setToolTip`/`tray?.setContextMenu` optional-chaining ishlatadi, ya'ni `null` tray bilan qolgan kod xavfsiz). Bu — real, test bilan qoplanadigan kod o'zgarishi (TDD).

### 3.2 PLACEHOLDER ASSET + HUJJATLASHTIRILGAN QO'LDA QADAM

Haqiqiy `.png`/`.ico` fayllarni **brend logotipi asosida** yaratish inson (dizayner) ishi. Bu reja buni soxtalashtirmaydi. Build pipeline'ni sinash imkoniyati uchun — ehtiyoj bo'lsa — aniq "bu PLACEHOLDER, real emas" deb belgilangan vaqtinchalik fayl(lar) qo'yiladi + `apps/desktop/assets/`/`build/` ichida yozma eslatma qoldiriladi. Bu **ODAM tomonidan real artwork tasdiqlanishini almashtirmaydi** — faqat pipeline'ni ishlaydigan holatga keltiradi va keyingi qadamni aniq belgilaydi.

### 3.3 `electron-builder.yml` TODO tozalash

`icon: build/icon.ico` yo'li allaqachon to'g'ri (o'zgarmaydi). Faqat 47-qatordagi `# TODO(jonli): ...` izohi — real (yoki hech bo'lmaganda texnik jihatdan valid placeholder) fayl joyiga qo'yilgach — olib tashlanadi.

---

## 4. Global cheklov

- **Yakuniy brend ikon dizayni inson tasdiqlashini talab qiladi.** Bu reja: (a) kodni xavfsiz/chidamli qiladi, (b) pipeline-sinov uchun aniq belgilangan placeholder + qo'lda-almashtirish hujjatini tayyorlaydi. U hech qanday haqiqiy brend dizaynini "ixtiro" qilmaydi va DoD'dagi "real ikon fayllar (brend/logo asosida)" talabini **placeholder bilan yopiq deb hisoblamaydi**.
- **NSIS + tray runtime real Windows tekshiruvi bu ticket doirasidan tashqarida** — CLI-361 orqali alohida kuzatiladi (jismoniy Windows PC talab qiladi, joriy muhit Linux).

---

## 5. DoD

- [ ] `tray.ts` `createTray()` ikon fayli yo'q/yaroqsiz bo'lganda aniq `console.warn` log qiladi va **crash bo'lmaydi** — real testlar bilan tasdiqlangan (mavjud 8 testga qo'shimcha, regressiyasiz).
- [ ] `apps/desktop/assets/tray-icon.png` mavjud (hech bo'lmaganda pipeline-sinov uchun aniq belgilangan placeholder, "real logo bilan almashtirilishi shart" eslatmasi bilan).
- [ ] `apps/desktop/build/icon.ico` mavjud, valid ko'p-o'lchamli ICO konteyner (hech bo'lmaganda placeholder, xuddi shu eslatma bilan).
- [ ] `electron-builder.yml:47` dagi `# TODO(jonli): ...` izohi fayl joyiga qo'yilgach olib tashlanadi.
- [ ] **Ochiq/insonga qoldirilgan qadam (bu reja bilan YOPILMAYDI):** haqiqiy brend artwork dizayner/mahsulot egasi tomonidan taqdim etilgach, placeholder fayllar shu ikkalasi bilan almashtiriladi.
- [ ] NSIS build + tray runtime jismoniy Windows'da tasdiqlanadi — **CLI-361** orqali kuzatiladi (bu ticket "Done" bo'lishi buni talab qilmaydi).
