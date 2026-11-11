# Laboratoriya portali (Lab Hub) — dizayn (2026-11-12)

> Holat: **qoralama, foydalanuvchi ko'rib chiqishi kerak.** Asos: `docs/LAB-TECHNICIAN-ACCESS-2026-11-11.md` (C + D1 variantlari), kanvas `docs/design/ui-redesign-2026-11/canvas/LabPortal.dc.html`, roadmap §3 «Lab portali».

## 1. Qarorlar (foydalanuvchi, 2026-11-11/12)

| # | Savol | Qaror |
|---|---|---|
| L1 | Lab kim? | Ko'p texnikli laboratoriya-biznes, bir nechta klinika bilan ishlaydi (C varianti) |
| L2 | Ma'lumot qayerda? | VPS'da, **qattiq shifrlangan**: TLS + saqlashda shifrlash (fayllar ham). Joylashuv muhim emas |
| L3 | Texnik bemorning nimasini ko'radi? | **To'liq ism** + klinika kodi, jins, yosh, tishlar, rang, fayllar, shifokor izohi. Telefon, manzil, karta — **hech qachon** |
| L4 | Narx | **Lab taklif qiladi, klinika tasdiqlaydi**; tasdiqlangan narx klinika `expenses`ga avtomatik tushadi |
| L5 | Ulanish | **Ochiq lablar katalogi**: klinika katalogdan lab tanlab so'rov yuboradi, lab tasdiqlaydi |
| L6 | Lab hisobi | **Vendor yaratadi** (Supervisor), **pullik obuna**; katalogda faqat vendor yaratgan lablar |
| L7 | MVP | Texnikka taqsimlash, ish ichida yozishma (fayl bilan), klinikalar bo'yicha hisob-kitob (akt-sverka), prays-list |

## 2. Arxitektura (tavsiya)

**Lab Hub — alohida markaziy xizmat**, Supervisor bilan bitta VPS'da, lekin alohida ilova va alohida baza:
- `apps/lab-hub-api` (Bun + Hono + Drizzle + Postgres, monorepo ichida — Supervisor naqshi, Qaror #36);
- `apps/lab-hub-web` (Vite + React + Mantine, `@dental/ui` tokenlari) — lab xodimlari uchun portal (kanvas `LabPortal`);
- `infra/lab-hub/` — compose + Caddy (TLS), Supervisor'ning `infra/supervisor/` naqshi.

**Nega klinika ilovasi (`apps/api`) ichida «lab vertikali» emas:** desktop klinikalari o'z serverida ishlaydi va tashqaridan ochilmaydi; SaaS klinikalari esa boshqa deploy'da. Ikkala rejim uchun **bitta yo'l** — klinika serveri Hub'ga **chiquvchi** (outbound) so'rovlar bilan ishlaydi (D1 relay = Hub'ning o'zi). Lab hech qachon klinika bazasiga ulanmaydi; klinika faqat o'zi yuborgan «ish» nusxasini Hub'ga beradi → CLAUDE.md §3.2 buzilmaydi.

```
Klinika API (SaaS yoki desktop) ──push ish/izoh/tasdiq──▶ Lab Hub API ◀── lab-hub-web (texniklar)
              ◀──poll holat/narx/izoh (1–2 daq)───────────┘
Supervisor ── lab yaratish/obuna (admin API) ──▶ Lab Hub
```

### 2.1 Klinika identifikatsiyasi Hub'da
- **Desktop klinika:** litsenziya kaliti + fingerprint bilan Hub'ga birinchi marta ulanadi → Hub Supervisor'dan litsenziyani tekshiradi (ichki admin API) → klinikaga **Hub kaliti** (tasodifiy 256-bit, Hub'da SHA-256 saqlanadi) beradi; klinika uni `tenant_settings`da AES-256-GCM bilan saqlaydi (Qaror #38 naqshi). Litsenziya muddati tugasa (P18) Hub ham rad etadi.
- **SaaS klinika:** SaaS deploy'ga bitta **xizmat kaliti** (env, Hub'da ro'yxatdan o'tgan) + har so'rovda `tenantId`; Hub klinikani `(saas_deployment, tenant_id)` juftligi bilan taniydi.
- ❓ Ochiq: SaaS klinikasi Supervisor'da yo'q — SaaS obunasi qayerda boshqariladi? (Hozircha Hub SaaS tenantni xizmat kaliti bilan ishonadi.)

### 2.2 Ma'lumot modeli (Hub)
`labs` (vendor yaratadi: nom, shahar, tavsif, katalogda ko'rinish, obuna `expires_at`), `lab_users` (lab rahbari / texnik; login telefon+parol, Hub'ga xos), `clinics` (desktop|saas identifikatori, nom), `lab_clinic_links` (`pending|active|rejected|revoked`), `price_list_items` (ish turi, material, narx), `cases` (klinika ish nusxasi: `clinic_case_ref`, bemor to'liq ismi*, jins, yosh, klinika kodi, shifokor ismi, tishlar, ish turi, material, rang*, muddat, izoh*, `status`, `assigned_technician_id`, `proposed_price`, `approved_price`, `approved_at`), `case_files`* (STL/surat), `case_messages`*, `case_events` (audit), `settlements` (klinika bo'yicha oylik akt: jami tasdiqlangan narx, to'langan — lab qo'lda belgilaydi).
`*` — **ilova darajasida shifrlangan** maydonlar/fayllar (§3).

### 2.3 Holat oqimi
Klinika: `draft → sent` (Hub'ga push) · Lab: `sent → accepted → in_progress → ready` yoki `rejected` (sabab) · Klinika: `ready → delivered` · Har ikki tomon: `remake` (klinika so'raydi, lab qabul qiladi). Narx: lab `proposed_price` → klinika «Tasdiqlash» → `approved_price` + klinika `expenses`ga yozuv (`lab_order_id` bilan, qayta tasdiqda dublikat emas). Klinika tomonida mavjud `lab_orders` jadvali saqlanadi; `lab_hub_case_id`, `lab_hub_lab_id`, `hub_sync_status` qo'shiladi; erkin `labName` katalogdan tanlangan lab bilan almashadi (eski qatorlar saqlanadi).

### 2.4 Sinxronlash (D1)
- Klinika → Hub: tranzaksiya ichida `lab_hub_outbox` qatori; commit'dan keyin worker push qiladi (`onAfterCommit` naqshi, P4); internet yo'q bo'lsa navbatda qoladi, qayta urinish backoff bilan; idempotent `clinic_case_ref`.
- Hub → klinika: klinika worker har **60 s** `GET /v1/clinic/changes?since=<cursor>` (holat, narx taklifi, xabar, fayl) — kiruvchi port ochilmaydi. Kursor klinikada saqlanadi.
- Bildirishnoma: klinika ichida mavjud `notifications`; lab tomonida — portalda + (ixtiyoriy) lab Telegram boti keyin.

## 3. Shifrlash (L2)
- **Transport:** faqat HTTPS (Caddy, TLS 1.2+), HSTS; klinika serveri Hub sertifikatini tekshiradi (public CA).
- **Saqlashda:** konvert shifrlash — har lab uchun alohida ma'lumot kaliti (DEK, AES-256-GCM), DEK'lar master kalit (KEK, VPS'da env/fayl, bazada emas) bilan o'ralgan. Shifrlanadi: bemor ismi, izohlar, xabarlar, rang tavsifi, **fayllar** (diskda faqat shifrlangan blob). Qidiruv uchun kerakli maydonlar (status, muddat, klinika) ochiq.
- **Zaxira:** `pg_dump` + fayllar — allaqachon shifrlangan holda; KEK zaxiraga qo'shilmaydi (alohida saqlanadi, README).
- **Saqlash muddati:** `delivered`dan 12 oy keyin bemor ismi va fayllar o'chiriladi (narx/akt qoladi). ❓ muddatni tasdiqlash.
- E2E (server o'qiy olmaydigan) shifrlash **tanlanmadi** — lab portali server tomonida render qilinadi.

## 4. Ekranlar
- **Lab portali** (`lab-hub-web`, kanvas `LabPortal`): ishlar ro'yxati (Yangi/Ishda/Tayyor/Jo'natilgan tablari, muddat, texnik filtri), ish detali (bemor, tishlar, fayllar, shifokor izohi, yozishma, texnik tanlash, narx taklifi, «Tayyor — jo'natishga», «Rad etish…»), klinikalar (ulanish so'rovlari, akt-sverka), prays-list, xodimlar (texniklar).
- **Klinika** (`apps/web`): Sozlamalar → «Laboratoriyalar» (katalog, ulanish so'rovi, holat); Lab buyurtma sahifasi (2026-11-12 lane labui qurgan) — lab katalogdan, «Yuborish», narx taklifini tasdiqlash, yozishma, Hub holati.
- **Supervisor admin:** «Laboratoriyalar» — yaratish, obuna muddati, uzaytirish, lab rahbari vaqtinchalik paroli (provisioning naqshi).

## 5. Bosqichlar (reja yozilganda)
1. Hub skeleti + shifrlash qatlami + Supervisor'dan lab yaratish + lab login.
2. Katalog + klinika ulanishi (desktop va SaaS identifikatsiyasi).
3. Ish yuborish/sinxronlash (outbox + poll) + holat oqimi.
4. Lab portali UI (ro'yxat, detal, taqsimlash, yozishma, fayllar).
5. Narx taklifi/tasdiq → klinika `expenses`; prays-list; akt-sverka.
6. Deploy (infra bosqichi bilan, VPS/domen kerak).

## 6. Ochiq savollar
1. SaaS klinikalar obunasi va Hub identifikatsiyasi (§2.1).
2. Bemor ismi va fayllarni saqlash muddati (§3, tavsiya 12 oy).
3. Lab obunasi narxi/tariflari — Supervisor'da faqat muddat (P18 naqshi) yetarlimi?
