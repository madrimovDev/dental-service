-- M6: Fix /auth/me — getMemberships RLS bilan ishlashi uchun.
--
-- Muammo: getMemberships('app.current_user_id') o'rnatadi (tenant emas).
-- userAssignments → user_assignments_self_view orqali ishlaydi.
-- LEKIN innerJoin(roles) va leftJoin(branches) — roles/branches RLS tenant_id talab qiladi.
-- Tenant_id null bo'lganda — join 0 row qaytaradi, natijada empty list.
--
-- Yechim: roles va branches'ga "self-view" policy qo'shamiz —
-- user_assignments orqali shu role/branch'da xodim bo'lsa, ko'rishi mumkin.
-- Foydalanuvchi-mehnatchining xavfsizlik chegarasi: user_id = current_user_id.
-- Boshqa userlarning role/branch'larini ko'ra olmaydi (subquery user_assignments RLS bilan filterlangan).

-- ===== ROLES =====
-- User'ga biriktirilgan rollarni ko'rsata olishi
CREATE POLICY roles_self_view ON roles
  FOR SELECT
  USING (
    id IN (
      SELECT role_id FROM user_assignments
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

-- ===== BRANCHES =====
-- User'ga biriktirilgan filiallarni ko'rsata olishi (tenant-wide bo'lmasa)
CREATE POLICY branches_self_view ON branches
  FOR SELECT
  USING (
    id IN (
      SELECT branch_id FROM user_assignments
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND branch_id IS NOT NULL
    )
  );
