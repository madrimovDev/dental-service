-- FX-155: yangi permission'lar `medical_record.on_behalf` va `prescription.on_behalf`
-- (boshqa shifokor nomidan vizit yozuvi / retsept). Katalog har boot'da ham seed qilinadi,
-- lekin backfill permission qatori mavjud bo'lishini talab qiladi (migratsiya boot-seeddan
-- oldin yuradi) — 0057 precedenti.
INSERT INTO "permissions" ("code", "category", "description_uz", "description_ru")
VALUES
  ('medical_record.on_behalf', 'clinical', 'Boshqa shifokor nomidan vizit yozuvi yaratish', 'Создавать записи визита от имени другого врача'),
  ('prescription.on_behalf', 'clinical', 'Boshqa shifokor nomidan retsept yozish', 'Выписывать рецепты от имени другого врача')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Mavjud tenantlardagi tizim Tenant Admin rollari uchun idempotent backfill.
-- Branch Manager'ga QO'SHILMAYDI (konservativ; shablon bilan mos).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."template_key" = 'tenant_admin'
  AND p."code" IN ('medical_record.on_behalf', 'prescription.on_behalf')
ON CONFLICT DO NOTHING;
