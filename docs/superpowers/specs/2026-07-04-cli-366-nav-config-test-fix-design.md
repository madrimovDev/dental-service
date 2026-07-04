# CLI-366 — `nav-config.test.ts` eskirgan (stale) assertion tuzatish (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-366 (High)
> **Scope:** `apps/web/src/shell/nav-config.test.ts` — bitta test bloki (53-63 qatorlar).

---

## 1. Maqsad

`apps/web/src/shell/nav-config.test.ts` hozir haqiqatda qizil (failing). Sabab: commit `4ce4b078` ("feat(nav): unlock plans/lab/rx/kpi/transactions nav items", 2026-06-27) `apps/web/src/shell/nav-config.ts`dagi `transactions` (va `plans`/`lab`/`rx`/`kpi`) NavItem'laridan `disabled: true`ni olib tashladi — bular endi haqiqiy ishlaydigan LIVE nav element (masalan `cashier.routes.tsx:13` `transactions`ni haqiqiy `TransactionsScreen` bilan ro'yxatdan o'tkazadi). Test hali ham `transactions`ni eski "FUTURE (disabled), faqat owner ko'radi" xatti-harakati bo'yicha tekshiradi — bu endi haqiqatga to'g'ri kelmaydi.

**DoD (ticket'dan):** test'ning kutilgan natijasi yangilanadi (transactions endi disabled emasligini aks ettiradi), `disabled: true` QAYTARILMAYDI, `vitest run` to'liq yashil ekani tasdiqlanadi.

---

## 2. Haqiqiy joriy holat (tasdiqlangan, real ishga tushirish orqali)

### 2.1 `bunx vitest run apps/web/src/shell/nav-config.test.ts` — real natija

```
 ❯ apps/web/src/shell/nav-config.test.ts (13 tests | 1 failed) 31ms
   × nav-config > FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161) 13ms
     → expected undefined to be true // Object.is equality

 FAIL  apps/web/src/shell/nav-config.test.ts > nav-config > FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)
AssertionError: expected undefined to be true // Object.is equality

- Expected:
true

+ Received:
undefined

 ❯ apps/web/src/shell/nav-config.test.ts:58:36
     56|     const transactions = asOwner.find((i) => i.key === 'transactions');
     57|     expect(transactions).toBeDefined();
     58|     expect(transactions?.disabled).toBe(true);
       |                                    ^

 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

**Faqat 1 ta test fail beradi** ("FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)", qator 53-63). Qolgan 12 ta test (`plans`/`lab` uchun LIVE-permission testlari, `kpi` alohida assertion yo'q) allaqachon to'g'ri — ular avvalroq boshqa ticketda (yoki shu commit'dan keyin) yangilangan bo'lishi kerak.

### 2.2 Ildiz sabab — nafaqat qator 58, balki butun test bloki (53-63) eskirgan

`nav-config.ts`ni to'liq o'qib chiqilganda tasdiqlandi: **hech qanday NavItem'da endi `disabled: true` yo'q** (`grep disabled nav-config.ts` faqat tip e'loni (39-qator) va funksiya kommentariyalari/mantiqini qaytaradi, 224-qator `if (item.disabled) return isOwner;` — mantiq saqlanadi, lekin uni ishlatadigan real element yo'q).

`transactions` joriy holati (`nav-config.ts:194-200`):
```ts
{
  key: 'transactions',
  labelKey: 'nav.transactions',
  icon: ArrowLeftRight,
  path: '/transactions',
  permission: 'cashier.view',
},
```
— `disabled` maydoni yo'q, `permission: 'cashier.view'` bor. Ya'ni `transactions` endi **LIVE, permission-gated** element (xuddi `patients`/`cashier` kabi), owner-only FUTURE emas.

**Test bloki (53-63) ikkita assertion qiladi, ikkalasi ham noto'g'ri taxminga asoslangan:**

1. Qator 58: `expect(transactions?.disabled).toBe(true)` — endi `disabled` har doim `undefined` (chunki maydon olib tashlangan). **Bu — vitest'ning haqiqiy topgan yagona xatosi** (birinchi fail qatorida throw qilgani uchun qator 60-62 hech qachon bajarilmaydi va tashqi ko'rinishda "faqat 1 xato" bo'lib ko'rinadi).
2. Qator 60-62: `visibleGroups(() => true, 'dental', false)` (owner emas, lekin `has()` har doim `true`) → **eski taxmin:** FUTURE element owner bo'lmasa yashirin bo'lishi kerak edi. **Yangi haqiqat (`nav-config.ts:217-228` `isVisible` funksiyasi orqali tasdiqlangan):** `disabled` bo'lmagan itemlar uchun `isOwner` parametri MUTLAQO tekshirilmaydi — faqat `item.permission` bilan `has(p)` solishtiriladi. Shuning uchun `has() => true` bilan `transactions` **owner bo'lmasa ham ko'rinadi**. Bu qator 62'dagi `toBeUndefined()` assertion'i ham — qator 58 tuzatilgach — FAIL berardi (agar shunchaki qator 58'ni tuzatib qo'ysa edik).

**Real skript bilan tasdiqlangan (`bunx tsx`, `visibleGroups` to'g'ridan chaqirilgan):**

| Chaqiruv | Natija (`transactions`) |
|---|---|
| `visibleGroups(() => true, 'dental', true)` (owner, hamma ruxsat) | `{ key: 'transactions', ..., permission: 'cashier.view' }` — **`disabled` maydoni yo'q** |
| `visibleGroups(() => true, 'dental', false)` (owner EMAS, hamma ruxsat) | xuddi shu obyekt — **ko'rinadi** (eski test buni `undefined` deb kutgan edi) |
| `visibleGroups(() => false, 'dental', false)` (owner emas, ruxsat yo'q) | `undefined` — **yashirin** |
| `visibleGroups((p) => p === 'cashier.view', 'dental', false)` (owner emas, faqat `cashier.view` bor) | topilgan obyekt — **ko'rinadi** |

→ Xulosa: `transactions` endi **sof permission-gated LIVE element** — `isOwner`ning bu itemga hech qanday aloqasi yo'q.

---

## 3. Yondashuv

### 3.1 Nima o'zgaradi

Faqat **bitta `it()` bloki** (53-63 qator) qayta yoziladi — testning nomi ham (`"FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)"`) endi noto'g'ri tavsiflaydi, chunki `transactions` FUTURE-disabled emas. Yangi test `transactions`ni **LIVE, `cashier.view`-gated** element sifatida tekshiradi — xuddi faylda allaqachon mavjud "R4 LIVE modullar" (65-84 qator) va "LIVE element ruxsat bilan ko'rinadi" (47-51 qator) testlari bilan bir xil uslubda.

Yangi assertion to'plami (barchasi yuqoridagi real skript natijalari bilan tasdiqlangan):
1. `disabled` maydoni yo'qligini tasdiqlash (`toBeUndefined()`) — DoD talabi: "transactions endi disabled emasligini aks ettiradi".
2. To'g'ri ruxsat (`cashier.view`) bilan, owner bo'lmasa ham, element ko'rinishini tasdiqlash — bu `isOwner`ning endi bu itemga ta'sir qilmasligini isbotlaydi (eski, noto'g'ri taxminni almashtiradi).
3. Ruxsatsiz (owner emas, `cashier.view` yo'q) holatda yashirin bo'lishini tasdiqlash — permission-gate ishlayotganini tekshiradi.

### 3.2 Nima o'zgarmaydi

- `nav-config.ts` — **o'zgartirilmaydi** (allaqachon to'g'ri, DoD "disabled: true qaytarilmaydi" talabini himoya qiladi).
- Qolgan 12 ta test — o'zgarishsiz qoladi (allaqachon yashil).
- `isVisible`/`visibleGroups` funksiya imzosi — o'zgarmaydi.

### 3.3 Doirasidan tashqari (ataylab)

- `nav-config.ts`da hozir **hech qanday item `disabled: true`ga ega emas** — ya'ni `isVisible`ning `if (item.disabled) return isOwner;` tarmog'i hozir birorta ham real item bilan sinovdan o'tmaydi (dead-in-practice, lekin kelajakda yangi FUTURE element qo'shilganda kerak bo'ladi). Bu ticket **yangi disabled-item test qo'shishni talab qilmaydi** — faqat mavjud stale assertion'ni tuzatadi. (Agar kelajakda haqiqiy FUTURE element qo'shilsa — alohida ticket sifatida `disabled`-mantiqni maxsus sinov bilan qoplash mumkin.)
- `plans`/`lab`/`rx`/`kpi` uchun **alohida stale assertion topilmadi** — fayl to'liq o'qib chiqildi (116 qator): `plans` (qator 34) va `lab` (qator 100-109, 101-114) allaqachon LIVE/feature-gated sifatida to'g'ri sinovdan o'tkazilgan; `rx` va `kpi` uchun umuman alohida assertion yo'q (faqat `keys.toContain(...)` umumiy ro'yxatlarda ham yo'q). Demak — real vitest ishga tushirish (§2.1) tasdiqlagani kabi, **faqat 1 ta test bloki** tuzatishga muhtoj.

---

## 4. DoD

- [ ] `nav-config.test.ts:53-63` dagi `it()` bloki `transactions`ni LIVE/`cashier.view`-gated sifatida (disabled emas) tekshiradigan assertion'larga yangilanadi.
- [ ] `disabled: true` `nav-config.ts`ga qaytarilmaydi (fayl o'zgarmaydi).
- [ ] `bunx vitest run apps/web/src/shell/nav-config.test.ts` — 13/13 test yashil.
