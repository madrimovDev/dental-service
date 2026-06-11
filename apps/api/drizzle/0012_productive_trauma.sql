ALTER TABLE "roles" ADD COLUMN "template_key" text;
--> statement-breakpoint
-- Dev backfill: mavjud system role template'larini nom bo'yicha key'lash (pre-launch dev data).
-- Custom rollar (is_template=false) → template_key NULL qoladi.
UPDATE "roles" SET "template_key" = 'tenant_admin' WHERE "name" = 'Tenant Admin' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'branch_manager' WHERE "name" = 'Branch Manager' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'doctor' WHERE "name" = 'Doctor' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'doctor_assistant' WHERE "name" = 'Doctor + Assistant' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'nurse' WHERE "name" = 'Nurse' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'receptionist' WHERE "name" = 'Receptionist' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'accountant' WHERE "name" = 'Accountant' AND "is_template" = true;--> statement-breakpoint
UPDATE "roles" SET "template_key" = 'technician' WHERE "name" = 'Technician' AND "is_template" = true;
