-- ===== PAYROLL_ADJUSTMENTS =====
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_adjustments_tenant_isolation ON payroll_adjustments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
