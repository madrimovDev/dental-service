# CLI-399 — RFC-0011 statusi eskirgan + README indeksida yo'q (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-399 (Medium)
> **Scope:** `docs/rfcs/0011-recall-revisit-subsystem.md` (header status qatori), `docs/rfcs/README.md` (Holat jadvali). Boshqa fayl o'zgarmaydi — sof hujjat tuzatish, kod o'zgarmaydi.

## 1. Topilgan holat (tekshiruv natijasi)

`docs/rfcs/0011-recall-revisit-subsystem.md:3` header: `- **Status:** Proposed`. RFC 2026-06-21 sanasida yozilgan, recall/revisit subsystem dizaynini belgilagan. CLAUDE.md progress yozuviga ko'ra (M10 Epic B) bu subsystem allaqachon qurilgan va shipping qilingan.

Amalga oshirilganligi to'g'ridan-to'g'ri tekshirildi (fayl mavjudligi):

- `apps/api/src/modules/recalls/` — 6 fayl (routes/service/repository/schema/mapper/index) + mapper test, RFC §3-6 taxminiga mos (RFC-0009 6-fayl qatlamli naqsh).
- `apps/api/src/lib/recall-scheduler.ts` — repeatable BullMQ job, `RECALL_SCAN_CRON = '0 6 * * *'` (RFC §2.1 taxminiga aynan mos — "kunlik cross-tenant scan, delay EMAS").
- `apps/api/src/lib/recall-worker.ts` — mavjud (RFC §2.2 admin-connection scan pattern).
- `apps/api/migrations/rls/0013_recall_rls.sql` — mavjud (RFC §3 "RLS" bo'limi taxminiga mos; `apps/desktop/resources/migrations/rls/0013_recall_rls.sql` nusxasi ham bor — desktop bundling uchun).
- `apps/web/src/features/recalls/` — `RecallDashboard.tsx` (+ test), `RecallNavBadge.tsx`, `recalls.routes.tsx`, `recalls.api.ts`, `recalls.keys.ts`, `recalls.mappers.ts` (+ test) — RFC §7 taxminiga mos.
- `apps/web/src/features/patients/components/tabs/RecallTab.tsx` — RFC §7 "bemor kartasi RecallTab" taxminiga mos.
- `packages/core/src/permissions.ts:415,421` — `recall.view`, `recall.manage` — RFC §6 taxminiga mos.

**Xulosa:** RFC-0011 dizaynining barcha asosiy qismlari (data model, scheduler, RLS, API, frontend) haqiqatda qurilgan va ishlayapti. Status "Proposed" endi noto'g'ri — bu hujjat allaqachon amalga oshirilgan qarorni tasvirlaydi, hali taklif emas.

**RFC tanasidagi boshqa eskirgan claim'lar:** faqat header status qatori eskirgan. RFC tanasi (§1-9) declarative/qaror shaklida yozilgan ("Qaror:", "amalga oshiriladi" emas) — bu boshqa qabul qilingan RFC'lar (0001-0010) bilan bir xil uslub, ular ham status "Accepted"ga o'tgandan keyin tana matni o'zgarmagan (tarixiy qaror hujjati sifatida saqlanadi). §1 "Kontekst va muammo" bo'limi ("Hozir loyihada bu UMUMAN yo'q") — bu RFC yozilgan paytdagi muammoni tasvirlaydi (nega RFC kerak bo'lgan), boshqa qabul qilingan RFC'larda ham shu naqsh (masalan 0005, 0006 "ochiq tanlov" tarixiy kontekstni saqlaydi) — o'zgartirilmaydi. §8 "Ochiq savollar" (SMS opt-out, rate-limit, retry siyosati) — tekshirildi, bular haqiqatda hali ham kod bazasida yo'q (`optOut`/`opt-out` uchun grep — 0 natija) — hali ham haqiqatda ochiq, o'zgartirilmaydi.

Kichik (DoD doirasidan tashqari) kuzatuv: RFC §6 API jadvalida 5 endpoint sanalgan, amalda `recalls.routes.ts`da 6-chisi bor (`GET /summary` qo'shilgan) — bu eskirgan/noto'g'ri claim emas, informatsiya kamchiligi (RFC dizayndan keyin qo'shilgan kichik qo'shimcha endpoint); ticket DoD buni so'ramaydi, shuning uchun bu tuzatishga kiritilmaydi.

## 2. README.md jadval formati (mirror uchun o'qildi)

`docs/rfcs/README.md:9-20` — 5 ustunli jadval: `RFC | Mavzu | Epik | Chuqurlik | Status`. Har qator: `[NNNN](./NNNN-slug.md) | <qisqa mavzu tavsifi> | <epik kod: cross/R0/R1/R3/R4> | <chuqurlik: to'liq/qaror+oqibat/real (ochiq tanlov)/stub> | <status emoji+matn>`. Status ustuni doim `✅` bilan boshlanadi ("✅ Accepted" yoki "✅ Accepted (yo'nalish)").

Cross-cutting RFC'lar (0001, 0009, 0010) — Epik ustuni `cross`, Chuqurlik `to'liq`. RFC-0011 ham cross-cutting emas (aniq epikka — M10 Epic B / Recall — bog'liq), lekin CLAUDE.md'da "M10 epik B" deb ataladi. Boshqa satrlarda epik nomlanishi qisqa kod (R0/R1/R3/R4) — RFC-0011 uchun mos qisqa kod yo'q (redesign R0-R5 dan keyingi V1 fazasi, "M10" nomlangan). Eng yaqin konsistent yechim: Epik ustuniga `M10` yozish (loyihada boshqa joyda ishlatilgan nomlanish, masalan CLAUDE.md "M10 epik A/B/C — schedule/recall/treatment-plan").

## 3. Yechim

### 3.1 RFC-0011 header status

`docs/rfcs/0011-recall-revisit-subsystem.md:3`:
```diff
-- **Status:** Proposed
+- **Status:** Implemented
```

("Implemented" — boshqa RFC'lar "Accepted" ishlatadi, lekin "Accepted" — taklif qabul qilinganini bildiradi, "Implemented" esa amalga oshirilganini aniqroq bildiradi; ticket DoD "Implemented/Shipped" deb aniq so'ragan, shu bilan mos. README jadvalidagi Status ustunida boshqa RFC'lar "Accepted"/"Accepted (yo'nalish)" ishlatgani uchun README qatorida "✅ Accepted" + qo'shimcha izoh emas — bu yerda ham izchillik uchun quyida ko'rib chiqiladi.)

### 3.2 README.md yangi qator

`docs/rfcs/README.md:20` dan keyin (0010 qatoridan keyin), 21-qatordan oldin (bo'sh qator va izohdan oldin):

```
| [0011](./0011-recall-revisit-subsystem.md) | Recall / revisit subsystem (davriy qayta chaqirish) | M10 | to'liq | ✅ Accepted |
```

**Status ustuni izchilligi:** README jadvalidagi barcha qatorlar "✅ Accepted" yoki "✅ Accepted (yo'nalish)" ishlatadi — bironta ham "Implemented" so'zini ishlatmaydi (chunki README — qabul qilingan RFC'lar indeksi, "amalga oshirilgan/oshirilmagan" holatni kuzatmaydi, faqat RFC qabul qilinganini). Shuning uchun README qatorida `✅ Accepted` ishlatiladi (jadval konvensiyasiga mos), RFC faylining o'z ichidagi header esa `Implemented` bo'ladi (bu — ticket DoD talab qilgan aniq status, RFC darajasida amalga oshirilganini bildiradi). Ikkalasi ziddiyatli emas: README "bu RFC qabul qilingan" deydi, RFC header "bu RFC amalga oshirilgan" deydi — ikkalasi ham to'g'ri va bir-birini to'ldiradi.

## 4. Global constraint

1. Faqat 2 ta qator o'zgaradi (RFC-0011:3 va README.md yangi qator) — RFC tanasi (§1-9) o'zgarmaydi (yuqoridagi §1'da asoslangan: tarixiy qaror hujjati, boshqa RFC'lar ham shu naqsh).
2. Kod o'zgarmaydi — bu sof hujjat-tuzatish ticket.
3. RFC §6 API jadvalidagi kichik nomuvofiqlik (`GET /summary` yo'q) tuzatilmaydi — DoD doirasidan tashqari, alohida ticket kerak bo'lsa.

## 5. DoD (ticket'dan)

- [ ] `docs/rfcs/0011-recall-revisit-subsystem.md:3` — `Status: Proposed` → `Status: Implemented`.
- [ ] `docs/rfcs/README.md` — Holat jadvaliga RFC-0011 uchun yangi qator qo'shildi (0010'dan keyin), mavjud ustun formatiga mos.
