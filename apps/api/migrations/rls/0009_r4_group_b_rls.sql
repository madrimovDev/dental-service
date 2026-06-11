-- R4 Guruh B — Xodim profili (staff_profiles) + Payroll (payroll_runs, payroll_lines) RLS policies.
-- Tenant-scoped: faqat tenant context'da access.
-- Barcha 3 jadval to'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy.

-- ===== STAFF_PROFILES =====
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_profiles_tenant_isolation ON staff_profiles
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== PAYROLL_RUNS =====
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== PAYROLL_LINES =====
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_lines_tenant_isolation ON payroll_lines
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
