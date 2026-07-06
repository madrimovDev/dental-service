# DS12 — Deferred Backend / Scope-Gap Katalog

> **Kelib chiqishi:** Wave 0 gap-brief tahlili (DS1–DS10, 2026-06-22) aniqladi — Dental OS dizayni joriy kod/API'dan ko'proq funksiyani nazarda tutadi. **Scope qarori (foydalanuvchi, 2026-06-22): Defer — front-end-only re-skin.** Redesign to'lqinlari (Wave A–E) faqat front-end qoladi; quyidagi kategoriya-3 (data-bog'liq / #33-buzuvchi) elementlar HOZIR omit/placeholder qilinadi (chrome teriladi, data joyi bo'sh/yashirin), bu yerga katalog qilinadi va alohida **post-redesign backend milestone (DS12)** da bajariladi.

> **Redesign agentlari uchun qoida:** brif data-gap deb belgilagan joyda — chrome'ни ter, omit/placeholder qil. **Hech qachon backend qo'shma, field ixtiro qilma, migration yozma, yangi endpoint yaratma.** Bu element shu katalogga tegishli.

## Kategoriya-3 elementlar (backend/API/migration talab qiladi)

### DS1 — Dashboard
- 7-kunlik **sparkline** (KPI kartalarda) — per-metric time-series hook yo'q.
- **Period-over-period delta** (▲▼ %) — period-comparison aggregate yo'q.
- **Recall list** rail kartasi — recall feed hook yo'q.
- **Activity feed** rail kartasi — activity endpoint yo'q.
- (Queue rail kartasi MUSTAQIL — `useQueueToday` mavjud, redesign'da teriladi.)

### DS4 — Appointments
- Ish soati **18 vs 20** — dizayn 18:00, kod 20:00. **Behavior-preserving:** kod qiymati (20) saqlanadi, dizayn 18 kosmetik deb e'tiborsiz. (Soat oralig'ини kamaytirish post-18:00 yozilishlarни yashiradi — data yo'qolishi.)
- Right-rail "Bo'sh slot" + waiting list — endpoint yo'q.

### DS7 — Klinika ops (eng katta gap)
- **Tenant-wide treatment-plans ekrani** — nav `disabled:true` placeholder; `GET /treatment-plans` patientId talab qiladi, tenant-wide list yo'q. Yangi ekran + API kengaytirish.
- **Tenant-wide lab-orders ekrani** — xuddi shunday.
- **Recall 4 KPI** — aggregate endpoint yo'q.
- **Recall "SMS holati" ustuni** (yuborildi/kutilmoqda/javob-keldi) — `RecallDto`'da SMS-delivery field yo'q (faqat workflow `status`/`contactAttempts`/`lastContactedAt`). Workflow-status ≠ SMS-delivery (semantik farq).

### DS8 — Analitika + Moliya
- **To'lov-usuli donut** — `byPaymentMethod` aggregate yo'q (faqat 1C export'da per-row).
- **Occupancy heatmap** (kun×soat matrix) — matrix aggregate yo'q.
- KPI **delta % / YoY** + ko'p **sparkline** — per-metric/period series yo'q. (Faqat `revenue.byPeriod` revenue line+sparkline'ни boqadi.)

### DS9 — Xodimlar + Ombor
- Inventory **`category`** ustuni — `stock_items` schema'da yo'q (migration kerak).
- Inventory **`price`** ustuni — schema'da yo'q (migration kerak).
- Low-stock **reorder tugmasi** — backend yo'q (no-op/omit).

### DS10 — Sozlamalar
- **Notifications bo'limi** (toggle list) — ekran/route/API/i18n butunlay yangi.
- **Integrations bo'limi** (card grid) — ekran/route/API/i18n butunlay yangi.

## Inline hal qilinadi (kategoriya-3 EMAS, redesign ichida)
- **DS6 percent-discount** — dizayn 0–15% percent, kod absolute so'm. Call-site'da percent→absolute so'm hisoblanadi; `cashier.mappers.ts`/money-math TEGILMAYDI. Migration emas.
