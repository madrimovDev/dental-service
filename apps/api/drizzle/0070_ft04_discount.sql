-- FT-04.1 (D-1): yangi permission `discount.give` («Chegirma bera oladi») — chegirma
-- (POS'da yoki reja bosqichi narxida) faqat shu ruxsat bilan. Katalog har boot'da ham seed
-- qilinadi, lekin backfill permission qatori mavjud bo'lishini talab qiladi (migratsiya
-- boot-seeddan oldin yuradi) — 0057/0067 precedenti.
INSERT INTO "permissions" ("code", "category", "description_uz", "description_ru")
VALUES ('discount.give', 'cashier', 'Chegirma bera oladi', 'Может предоставлять скидку')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Mavjud tenantlardagi tizim rollari (Tenant Admin, Branch Manager, Receptionist) uchun
-- idempotent backfill (shablon bilan mos). Maxsus (custom) rollar tegilmaydi — Doctor va
-- boshqalarga rol muharririda qo'lda yoqiladi.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."template_key" IN ('tenant_admin', 'branch_manager', 'receptionist')
  AND p."code" = 'discount.give'
ON CONFLICT DO NOTHING;
