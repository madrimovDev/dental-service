ALTER TABLE "roles" ADD COLUMN "is_practitioner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- FU-41 backfill 1: shifokor belgisi. Doctor / Doctor+Assistant shablonlari + (oldingi xulq saqlansin
-- deb) `medical_record.edit` ga ega maxsus (shablonsiz) rollar. Branch Manager / Tenant Admin — YO'Q.
UPDATE "roles" SET "is_practitioner" = true
WHERE "template_key" IN ('doctor', 'doctor_assistant')
   OR ("template_key" IS NULL AND EXISTS (
        SELECT 1 FROM "role_permissions" rp
        JOIN "permissions" p ON p."id" = rp."permission_id"
        WHERE rp."role_id" = "roles"."id" AND p."code" = 'medical_record.edit'
      ));
--> statement-breakpoint
-- FU-41 backfill 2: mavjud tenantlardagi tizim Branch Manager rollariga yetishmayotgan
-- filial-darajali permission'lar (Receptionist ∪ Doctor ∪ Doctor+Assistant ∪ Nurse ∪ Accountant ∪ Technician).
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."template_key" = 'branch_manager' AND r."is_system" = true
  AND p."code" IN (
    'medical_record.view', 'medical_record.edit', 'queue.create',
    'cashier.create_transaction', 'cashier.refund', 'cashier.void', 'salary.view',
    'prescription.manage', 'consent.manage', 'lab_order.manage', 'patient_image.upload'
  )
ON CONFLICT DO NOTHING;
