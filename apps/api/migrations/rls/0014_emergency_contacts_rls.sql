-- V2-5 (Erkin emergency contact, CLI-245) — RLS policy.
-- Tenant-scoped: faqat tenant context'da access (0013 pattern).

-- ===== PATIENT_EMERGENCY_CONTACTS =====
ALTER TABLE patient_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_emergency_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_emergency_contacts_tenant_isolation ON patient_emergency_contacts
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
