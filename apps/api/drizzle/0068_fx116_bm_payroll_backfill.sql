-- FX-116 (LB-25) backfill: payroll klinika bo'yicha (tenant-wide) — mavjud tenantlardagi tizim
-- Branch Manager rollaridan payroll.view / payroll.manage olib tashlanadi (shablon allaqachon
-- tuzatilgan; bu faqat oldin provisioning qilingan tenantlar uchun). Maxsus (custom) rollar tegilmaydi.
DELETE FROM "role_permissions"
WHERE "role_id" IN (
    SELECT "id" FROM "roles" WHERE "template_key" = 'branch_manager' AND "is_system" = true
  )
  AND "permission_id" IN (
    SELECT "id" FROM "permissions" WHERE "code" IN ('payroll.view', 'payroll.manage')
  );
