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
--> statement-breakpoint
-- FT-04.2 (D-1): kassa chegirmasi snapshot'i — foiz (serverda hisoblanadi), sabab, kim berdi.
-- Faqat `discount > 0` tranzaksiyalarda to'ldiriladi; eski qatorlar NULL. Idempotent
-- (IF NOT EXISTS / duplicate_object) — 0070 testlari bayonotlarni qayta yurgizadi.
ALTER TABLE "cashier_transactions" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "cashier_transactions" ADD COLUMN IF NOT EXISTS "discount_reason" text;--> statement-breakpoint
ALTER TABLE "cashier_transactions" ADD COLUMN IF NOT EXISTS "discount_granted_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cashier_transactions" ADD CONSTRAINT "cashier_transactions_discount_granted_by_users_id_fk" FOREIGN KEY ("discount_granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- FT-04.3 (D-2): bemorning doimiy chegirmasi (foiz). POS'da va YANGI yaratiladigan reja
-- bosqichlarida qo'llanadi; mavjud bosqichlarga retroaktiv tegmaydi. Tahrir: patient.edit +
-- discount.give. NULL = chegirma yo'q.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "default_discount_percent" numeric(5, 2);
