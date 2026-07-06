-- CLI-417: payroll_runs bir tenant uchun ustma-ust / takroriy davrni DB darajasida
-- to'sadi (double-pay backstop). Service-qatlam guard (createRun ichida daterange
-- kesishuv SELECT) TOCTOU poygasiga ochiq (READ COMMITTED'da ikki parallel createRun
-- ikkalasi ham kesishuvni topmay insert qilishi mumkin) — bu EXCLUDE constraint
-- determenistik kafolat beradi. 23P01 (exclusion_violation) → service `overlap`ga map.
--
-- `[]` inklyuziv daterange: tutashuvchi davrlar (Iyun 01–30 + Iyul 01–31) KESISHMAYDI
-- (chegara turli kun), bir kunlik ustma-ustlik (…06-30 + 06-30…) KESISHADI.
-- btree_gist Postgres 16 core'da; `CREATE EXTENSION` migratsiya roli (desktop `dental`
-- superuser / cloud migrate roli) tomonidan bajarilishi kerak.
--
-- ⚠️ Mavjud ustma-ust run bo'lgan bazada `ALTER TABLE` FAIL bo'ladi. Migratsiyadan
-- oldin tekshiruv:
--   SELECT a.tenant_id, a.id, b.id FROM payroll_runs a JOIN payroll_runs b
--     ON a.tenant_id = b.tenant_id AND a.id < b.id
--     AND daterange(a.period_from, a.period_to, '[]') && daterange(b.period_from, b.period_to, '[]');
-- topilgan juftlar qo'lda ko'rib chiqiladi (draft'ni o'chirish / davrni tuzatish).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE payroll_runs
  ADD CONSTRAINT payroll_runs_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    daterange(period_from, period_to, '[]') WITH &&
  );
