-- Multi-tenant Row-Level Security policies.
-- Drizzle generate qilmaydi — bu hand-written DDL.
-- Hono `rlsMiddleware` har auth'lanagan request da transaction ochib
-- `SET LOCAL app.current_tenant_id = '<uuid>'` chaqiradi.
-- Cross-tenant query urinishi 0 row qaytaradi.
--
-- Apply qilish: `psql $DATABASE_URL -f apps/api/migrations/rls/0001_enable_rls.sql`
-- (Drizzle migrate'dan KEYIN ishga tushiriladi)

-- ===== BRANCHES =====
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

CREATE POLICY branches_tenant_isolation ON branches
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ===== ROLES =====
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY roles_tenant_isolation ON roles
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ===== ROLE_PERMISSIONS (via parent role) =====
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_tenant_isolation ON role_permissions
  USING (
    role_id IN (
      SELECT id FROM roles
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id FROM roles
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ===== USER_ASSIGNMENTS =====
ALTER TABLE user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY user_assignments_tenant_isolation ON user_assignments
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ===== AUDIT_LOG =====
-- SELECT: faqat tenant'ning o'z eventlari (platform events tenant_id=NULL ko'rinmaydi)
-- INSERT: tenant_id NULL ham mumkin (platform events — login va h.k.)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_tenant_isolation_select ON audit_log
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY audit_log_tenant_isolation_insert ON audit_log
  FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- ===== ESLATMA =====
-- Platform-level jadvallar (RLS YO'Q):
--   users, tenants, permissions, refresh_tokens, password_reset_tokens
--
-- Bu jadvallar barcha tenantlar uchun umumiy yoki tenant-context'siz access kerak
-- (login, registration, password reset). Tenant_id ustuni yo'q, RLS yoqilmaydi.
