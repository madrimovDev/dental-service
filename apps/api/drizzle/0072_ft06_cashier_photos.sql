CREATE TABLE "cashier_transaction_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"object_key" text,
	"captured_by" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"skipped_reason" text,
	CONSTRAINT "cashier_tx_photos_key_or_reason_chk" CHECK ("cashier_transaction_photos"."object_key" IS NOT NULL OR "cashier_transaction_photos"."skipped_reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "cashier_photo_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cashier_transaction_photos" ADD CONSTRAINT "cashier_transaction_photos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_transaction_photos" ADD CONSTRAINT "cashier_transaction_photos_transaction_id_cashier_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."cashier_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_transaction_photos" ADD CONSTRAINT "cashier_transaction_photos_captured_by_users_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_tx_photos_tx_uq" ON "cashier_transaction_photos" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "cashier_tx_photos_tenant_captured_idx" ON "cashier_transaction_photos" USING btree ("tenant_id","captured_at");--> statement-breakpoint
-- FT-06.3: yangi permission `cashier.photo.view` (kassa rasmini ko'rish). Katalog boot'da ham
-- seed qilinadi, lekin backfill permission qatori mavjudligini talab qiladi (0067 precedenti).
INSERT INTO "permissions" ("code", "category", "description_uz", "description_ru")
VALUES
  ('cashier.photo.view', 'cashier', 'Kassada olingan to''lov rasmlarini ko''rish', 'Просмотр фото платежей, сделанных на кассе')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Faqat mavjud tenantlardagi tizim Tenant Admin rollari (owner — implicit superuser).
-- Boshqa rollarga QO'SHILMAYDI (shablon bilan mos: kassir/registrator rasmni ko'ra olmaydi).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."template_key" = 'tenant_admin'
  AND p."code" = 'cashier.photo.view'
ON CONFLICT DO NOTHING;
