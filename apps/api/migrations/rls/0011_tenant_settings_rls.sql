-- M2 Backend Foundation — Tenant settings (tenant_settings) RLS policy.
-- Tenant-scoped: faqat tenant context'da access.
-- To'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy.

-- ===== TENANT_SETTINGS =====
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
