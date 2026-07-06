# CLI-371 — `optionalAuthMiddleware` o'lik kod (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-371 (Low)
> **Scope:** `apps/api/src/middleware/auth.ts:47-69` (JSDoc kommentariya + `optionalAuthMiddleware` funksiyasi)

---

## 1. Maqsad

`apps/api/src/middleware/auth.ts:52-69`da `optionalAuthMiddleware` eksport qilingan — `authMiddleware`ning "yumshoq" varianti: token bo'lsa decode qiladi, bo'lmasa yoki invalid bo'lsa ham 401 qaytarmasdan `next()`ga o'tadi. Funksiya ustidagi JSDoc (48-51 qator) aniq intended use ta'riflaydi: *"Public endpoint'lar uchun (masalan, registratsiya sahifasi user'ni preview qilish uchun)."* Biroq bu intended use hech qachon qurilmagan — funksiya hech qayerda chaqirilmaydi.

**DoD (ticket'dan):** yo (a) real use case topib wire qilish, yo (b) reja yo'q bo'lsa butunlay o'chirish.

---

## 2. Tekshiruv — real ishlatilish bormi?

Butun monorepo bo'yicha grep qilindi (`apps/api`, `apps/web`, `docs/rfcs`, `CLAUDE.md`, va umuman barcha `.ts`/`.tsx`/`.md` fayllar, `node_modules` chetlab o'tilgan):

```bash
grep -rn "optionalAuthMiddleware" --include="*.ts" --include="*.tsx" --include="*.md" .
# → faqat apps/api/src/middleware/auth.ts:52 (o'z e'loni)

grep -rn "registratsiya sahifasi" --include="*.ts" --include="*.tsx" --include="*.md" .
# → faqat apps/api/src/middleware/auth.ts:50 (o'sha JSDoc qatori)

grep -rn "preview qilish|preview user|user preview" --include="*.ts" --include="*.tsx" --include="*.md" .
# → faqat apps/api/src/middleware/auth.ts:50 (xuddi shu qator)
```

**Natija: nol chaqiruv joyi.** Faqat funksiyaning o'zi va o'z JSDoc'i topildi — boshqa hech qanday fayl (route, RFC, Obsidian-eksport, CLAUDE.md) bu funksiyani yoki uning "registratsiya sahifasida user preview" g'oyasini eslatmaydi.

Qo'shimcha tekshirildi:
- `apps/api/src/middleware/auth.ts` uchun mavjud test fayli yo'q (`find ... -iname "auth.test.ts"` faqat `apps/supervisor-api/src/modules/auth/auth.test.ts`ni topdi — aloqasiz, boshqa ilova).
- Registratsiya oqimi (`apps/api` register-tenant route'lari) — bu tekshiruv doirasida alohida route fayllarga qadar borilmadi, chunki grep natijasi allaqachon aniq: hech qanday route `optionalAuthMiddleware`ni import ham qilmaydi, demak "registratsiya sahifasi" bilan bog'lash mumkin bo'lgan hech qanday amaldagi kod yo'q.

---

## 3. Yondashuv — tavsiya: **O'CHIRISH**

**Sabab:**
1. Nol chaqiruv joyi — bu qat'iy o'lik kod (hech qanday route, hech qanday test uni import qilmaydi).
2. Intended use ("registratsiya sahifasida user preview") — hech qanday RFC, Obsidian reja yoki boshqa kod izida tasdiqlanmaydi. Bu — amalga oshirilmagan g'oya, kutilayotgan ish emas.
3. Loyiha hozirda registratsiya oqimi uchun boshqa yechim bilan ishlaydi (auth middleware'siz public route'lar oddiy `Hono` handler sifatida yoziladi — `authMiddleware`ni umuman chaqirmaydi, "optional" variant kerak emas).
4. Ticket matnining o'zi ham "agar reja yo'q bo'lsa — o'chir" variantini birinchi o'ringa qo'ygan — va tekshiruv aynan shuni tasdiqladi.
5. Kod minimal (18 qator, oddiy try/catch) — qayta tiklash narxi past bo'lgani uchun "keyin kerak bo'lib qolsa" argumenti o'chirishga to'siq emas (git tarixida saqlanadi).

**Muqobil (wire-in) rad etildi:** wire-in qilish uchun konkret route topilmadi — hech qanday public endpoint hozircha "user preview" funksionalligini so'ramaydi. Spekulyativ wire-in (mavjud bo'lmagan feature uchun) YAGRI/scope-creep bo'lardi — ticket doirasidan tashqari.

**Nima o'zgaradi:**
- `apps/api/src/middleware/auth.ts:47-69` — JSDoc blok (48-51) + `optionalAuthMiddleware` funksiyasi (52-69) o'chiriladi.
- `authMiddleware` (1-46 qator) — o'zgarmaydi.
- `declare module 'hono'` kengaytmasi (5-9 qator) — o'zgarmaydi (`accessClaims` optional maydon `authMiddleware`ga ham tegishli).

**Nima o'zgarmaydi:**
- Boshqa hech qanday fayl bu funksiyani import qilmagani uchun, o'chirish hech qanday boshqa modulga ta'sir qilmaydi.
- Mavjud test suite yo'q — yangi test yozish yoki mavjudini yangilash shart emas.

---

## 4. DoD

- [ ] Butun monorepo bo'yicha qayta tasdiqlangan: `optionalAuthMiddleware` uchun faqat ta'rif qatori qoladi, boshqa hech qanday chaqiruv yo'q.
- [ ] `apps/api/src/middleware/auth.ts`dan JSDoc + funksiya (47-69 qator) to'liq olib tashlangan.
- [ ] `authMiddleware` va fayl qolgan qismi o'zgarishsiz qoladi.
- [ ] Loyihaning mavjud typecheck/test komandalari (agar ishlatilsa) xatosiz o'tadi (yangi test talab qilinmaydi, chunki mavjud test yo'q edi).
