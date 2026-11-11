ALTER TABLE "lab_orders" ADD COLUMN "price_approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "price_approval_requested_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "price_approval_requested_by" uuid;--> statement-breakpoint
-- Lab Hub L4: yangi permission `lab_order.approve_price` (narx tasdig'i xarajatga yoziladi).
-- Katalog boot'da ham seed qilinadi, lekin backfill permission qatorini talab qiladi.
INSERT INTO "permissions" ("code", "category", "description_uz", "description_ru")
VALUES ('lab_order.approve_price', 'clinical', 'Laboratoriya taklif qilgan narxni tasdiqlash (xarajatga yoziladi)', 'Подтверждение цены лаборатории (записывается в расходы)')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Mavjud tenantlardagi tizim rollari uchun backfill (Technician/Nurse/Receptionist — YO'Q).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system" = true
  AND r."template_key" IN ('tenant_admin', 'branch_manager', 'doctor', 'doctor_assistant', 'accountant')
  AND p."code" = 'lab_order.approve_price'
ON CONFLICT DO NOTHING;
