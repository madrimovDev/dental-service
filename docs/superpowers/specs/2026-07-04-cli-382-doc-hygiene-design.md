# CLI-382 — apps/desktop/src/main.ts va CLAUDE.md'dagi eskirgan izohlar (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-382 (Low)
> **Scope:** `apps/desktop/src/main.ts:23-38` (doc-comment) + `CLAUDE.md:6` (bitta ibora)

---

## 1. Goal

`apps/desktop/src/main.ts` faylining yuqori doc-comment bloki ikkita da'voni eskirgan holda saqlab kelmoqda:

1. **Qator 25-27:** `/activate` sahifasi haqida — *"web `/activate` sahifasining o'zi hali qurilmagan — follow-up, apps/web doirasi tashqarisida"*.
2. **Qator 32-35:** preload haqida — *"`preload.ts` ESM ... sifatida kompilyatsiya qilinadi — `sandbox`/Electron versiyasiga bog'liq yuklash xatti-harakati real BrowserWindow'da hali tekshirilmagan"*.

Ikkalasi ham **noto'g'ri** — ikkalasi ham keyingi commit'larda hal qilingan (pastga qarang, §2). Auditda ikkita mustaqil agent bu izohlarga deyarli ishonib, allaqachon tugallangan ishni hali ochiq deb hisoblashiga sal qoldi. Maqsad — izohlarni haqiqiy holatga moslash, shu bilan birga hali chindan ham ochiq bo'lgan bandni (`/settings` → `setServerUrl`) o'zgartirmasdan qoldirish.

## 2. Tekshirilgan faktlar (kod o'qish + git log natijasi)

**Fakt 1 — `/activate` sahifasi mavjud va ro'yxatdan o'tgan:**
- `apps/web/src/features/auth/pages/activate.page.tsx` — fayl mavjud (`ls` bilan tasdiqlangan).
- `apps/web/src/features/auth/auth.routes.tsx:5` — lazy import: `import('./pages/activate.page').then((m) => ({ default: m.ActivatePage }))`.
- `apps/web/src/features/auth/auth.routes.tsx:24` — route ro'yxatga olingan: `{ path: '/activate', element: <ActivatePage /> }`.
- Manba commit: `7670124` — `feat: end-to-end desktop license activation flow (CLI-348 qaror 1)`, `git log` bo'yicha **2026-07-03 03:06:09 +0500**. Commit mesajida aniq yozilgan: *"Local Desktop was missing the piece its own spec called for: an actual /activate page... so the redirect went to a 404. Closes that gap end-to-end"* — ya'ni aynan main.ts'dagi eskirgan izohda tasvirlangan bo'shliqni yopadi.

**Fakt 2 — preload real BrowserWindow'da tekshirilgan (va CJS'ga o'tgan):**
- `apps/desktop/src/preload.cts` — fayl mavjud (`.ts` EMAS, `.cts` — CommonJS TypeScript kengaytmasi).
- `apps/desktop/src/main.ts:64` allaqachon yangilangan: `// `.cjs` — `preload.cts` (CommonJS, sandbox:true talabi; ESM emas, izohiga qarang).` — bu qator "izohiga qarang" deb yuqoridagi (23-38) blokka ishora qiladi, lekin o'sha blok hali ham "ESM" deb yozilgan — **ikki qator bir-biriga zid** (aynan shu ziddiyat CLI-382'ning sabab-oqibati).
- Manba commit: `165ddc5` — `fix(desktop): blank screen in real BrowserWindow (CSP + preload ESM)`, git log bo'yicha **2026-07-03 04:33:05 +0500** (ticket matnida "2026-07-04" deyilgan, lekin `git log --format=%ad` aniq 07-03 04:33 +0500 ko'rsatadi — commit mazmuni ticket tavsifiga mos, faqat sana bir kun oldinroq; bu farq faktlarni o'zgartirmaydi). Commit mesaji: *"Screenshot from the actual Electron window (real server mode, not dev wrap) showed a black screen with two console errors... Preload script failed with 'Cannot use import statement outside a [module]'"* — ya'ni aynan "real BrowserWindow'da tekshirilmagan" deb yozilgan holat shu commit'da **tekshirilgan va tuzatilgan**.

**Fakt 3.5 — nazorat: qator 19 ham stale, lekin ticket qamrovidan tashqarida:**
- `main.ts:19` — `` `preload.ts` → `settings-ipc.ts` `` deb yozadi, lekin fayl endi `preload.cts` (Fakt 2, `ls` bilan tasdiqlangan). Bu — xuddi shu turdagi staleness, lekin ticket DoD'i aniq 23-38 qatorlarni ko'rsatadi va bu qator o'sha diapazon tashqarisida. **Qasddan tegilmaydi** — plan doirasini kengaytirmaslik uchun; alohida kichik follow-up sifatida qayd etiladi (pastga qarang, §5).

**Fakt 3 — nazorat: `/settings` bandi hali ham to'g'ri (tegilmaydi):**
- `grep -rn "setServerUrl" apps/web/src/` — **hech qanday natija yo'q**. Web tomonida `window.dentalDesktop?.setServerUrl(...)` hali chaqirilmaydi.
- Demak, main.ts qator 36-37 (`Web `/settings` sahifasi ... hali chaqirmaydi`) va CLAUDE.md'dagi tegishli follow-up moddasi (`/settings yangi IPC bridge'ni chaqirmaydi`) — **hali ham to'g'ri**, ticket qamrovidan tashqarida, o'zgartirilmaydi.

**Fakt 4 — CLAUDE.md'da bitta stale joy topildi, boshqa yo'q:**
- `grep -n "activate\|preload\|sandbox\|qurilmagan\|tekshirilmagan"` CLAUDE.md bo'yicha faqat bitta qatorda (6-qator, "ENG SO'NGGI (2026-07-02)") ikkita `/activate`ga oid ibora chiqdi:
  - `"/activate" sahifasi "apps/web"da yo'q + activation flow ulanmagan` — **stale**, Fakt 1 bilan zid.
- CLAUDE.md'da preload/ESM/CJS/CSP/sandbox haqida **boshqa hech qanday** eslatma yo'q (`grep -n "ESM\|CJS\|blank screen\|CSP\|preload" CLAUDE.md` — 0 natija) — demak preload haqida CLAUDE.md'da tuzatiladigan alohida joy yo'q, faqat main.ts'dagi izoh muammoli.
- CLAUDE.md — append-only xronologik jurnal (eng yangi yozuv tepada). 6-qator (2026-07-02) hozircha eng so'nggi "ENG SO'NGGI" yozuvi — undan keyin 7670124/165ddc5 commit'lari (2026-07-03) uchun **hech qanday yangi yozuv qo'shilmagan**. Ya'ni bu stale ibora keyingi (yangiroq) yozuv bilan allaqachon almashtirilmagan — buni chindan tuzatish kerak, "eskirgan-lekin-keyin-tuzatilgan-yozuv-bor" holati emas.

## 3. Approach

**`main.ts:23-38`** — doc-comment blokini qayta yozish:
- `/activate` bandini (25-27 qator) — sahifa qurilgan/ro'yxatdan o'tgan holatga, aniq fayl yo'li + commit havolasi bilan almashtirish.
- Preload bandini (32-35 qator) — `.ts`/ESM eskirgan tavsifni `.cjs`/`.cts`/CommonJS + real-BrowserWindow'da tekshirilgan holatga almashtirish, tuzatilgan bug (CSP+ESM/CJS blank-screen) haqida qisqa eslatma bilan; shu bilan qator 64dagi izoh bilan endi mos keladi.
- Qolgan ikki band (`TASHQI BOG'LIQLIK` sarlavhasi, `tray-icon.png`, `/settings` setServerUrl) — **tegilmaydi** (hali ham to'g'ri/ochiq).

**`CLAUDE.md:6`** — follow-up ro'yxatidan `/activate`ga oid iborani olib tashlab, o'rniga hal qilingani haqida qisqa parentetik izoh qo'shish (append-only konvensiyaga mos — tarix o'chirilmaydi, faqat noto'g'ri da'vo tuzatiladi va tasdiqlovchi commit'larga ishora qilinadi).

## 4. DoD (ticketdan)

- [ ] `apps/desktop/src/main.ts:23-38` — `/activate` bandi "hali qurilmagan" demaydi; preload bandi "hali tekshirilmagan" demaydi. Ikkalasi ham yo hal qilingan deb belgilangan, yo olib tashlangan.
- [ ] `CLAUDE.md` — mos qatorlar (6-qator follow-up ro'yxati) yangilangan: `/activate`ga oid stale da'vo olib tashlangan/tuzatilgan.
- [ ] Boshqa fayl o'zgartirilmagan (bu — pure doc-fix, kod/test o'zgarishi yo'q).
- [ ] Test yo'q (doc-only o'zgarish, mavjud test suite'ga ta'sir qilmaydi) — shunga qaramay `git diff` orqali faqat 2 faylda, faqat rejalashtirilgan qatorlarda o'zgarish borligini tasdiqlash kifoya.

## 5. Ko'lamdan tashqari (ushbu ticket tuzatmaydi, lekin qayd etiladi)

- `main.ts:19`'dagi `preload.ts` fayl nomi eslatmasi ham stale (haqiqiy fayl `preload.cts`) — DoD 23-38 diapazonidan tashqarida, shuning uchun bu spec/plan uni o'zgartirmaydi. Kelajakda alohida kichik doc-fix sifatida ko'rib chiqilishi mumkin.
