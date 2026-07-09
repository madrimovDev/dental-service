-- CLI-474 (L7) — patient_no_show_strikes tenant izolyatsiyasi (yangi jadval).
-- ===== PATIENT_NO_SHOW_STRIKES =====
ALTER TABLE patient_no_show_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_no_show_strikes FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_no_show_strikes_tenant_isolation ON patient_no_show_strikes
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
