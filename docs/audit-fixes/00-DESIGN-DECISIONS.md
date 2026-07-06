# Audit-fix dizayn qarorlari (2026-07-06)

Foydalanuvchi bilan kelishилган fork-qarorlar (spec agentlariга embed qilingan):

| Issue | Fork | QAROR |
|---|---|---|
| **CLI-405** uploads IDOR | `..` rad etish vs resolved-path tenant vs normalize+split | **Resolved/normalized absolute path'дан tenant qayta olib solishtirish + `..`/encoded traversal rad etish** (tekshiruv va o'qish bir xil canonical string ustида) |
| **CLI-406** refund double-subtract | void olib tashlash vs agregat tuzatish | **Void'ни olib tashlash** — to'liq refundда ham asl tx `completed` qoladi, faqat manfiy refund qatoriga tayaniladi (qisman bilan bir xil model). `voided` status consumerлари tekshirilsin |
| **CLI-408** double-booking race | EXCLUDE constraint vs advisory lock | **Postgres EXCLUDE (btree_gist)** — `EXCLUDE (doctor_id =, tstzrange(start,end) &&) WHERE status≠cancelled`; btree_gist extension + raw SQL migration + 23P01→409 |
| **CLI-410/411** litsenziya bind | payload'га fingerprint vs alohida token | **Aktivatsияда fingerprint imzolangan payload'га kiritiladi**; klient `payload.fingerprint===local` solishtiradi; heartbeat qayta-imzolaydi; NULL-fingerprint heartbeat rad etiladi |
| **CLI-412** technician template | template+migratsiya vs faqat template vs endpoint | **Faqat template (yangi tenantlar)** — mavjud tenantlar qo'lda tahrirlaydi (migratsiyasiz); spec bu cheklovни hujjatlashtiradi |
| **CLI-409** appointment status | to'liq state machine vs minimal guard | **To'liq state machine + qayta-validatsiya** — aniq transition matritsasi; bekorдан qayta-faollashtirish conflict/schedule qayta tekshiradi; completed terminal |

Qolgan issue'lar: mexanik fix (agentlar aniq yo'nalishни o'zi tanladi, standart konvensiya bo'yicha).

**Chiqar joyi:** `docs/audit-fixes/CLI-XXX-<slug>.md` (har issue) + LOW guruhlar bittalik doc.
**Format:** Muammo/ildiz → Dizayn qarori → Spec+test → TDD reja → Migratsiya/xavf → Qabul mezonlari → Ta'sirlangan fayllar.
