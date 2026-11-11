-- FU-24: yangi permission `patient.import` (Excel/CSV bemor importi).
-- Katalog har boot'da ham seed qilinadi, lekin backfill shu migratsiyada permission
-- qatori mavjud bo'lishini talab qiladi (migratsiya boot-seeddan oldin yuradi).
INSERT INTO "permissions" ("code", "category", "description_uz", "description_ru")
VALUES ('patient.import', 'patient', 'Bemorlarni Excel/CSV fayldan import qilish', 'Импорт пациентов из Excel/CSV')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Mavjud tenantlardagi tizim rollari (Tenant Admin, Branch Manager) uchun backfill.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."template_key" IN ('tenant_admin', 'branch_manager')
  AND p."code" = 'patient.import'
ON CONFLICT DO NOTHING;
