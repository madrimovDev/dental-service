-- M5 — Reseptlar + Konsent + Lab orders + Patient images RLS.
-- Hammasi tenant-scoped, har row tenant_id ga ega.

-- ===== PRESCRIPTIONS =====
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY prescriptions_tenant_isolation ON prescriptions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== CONSENT_TEMPLATES =====
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_templates_tenant_isolation ON consent_templates
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== CONSENT_FORMS =====
ALTER TABLE consent_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_forms FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_forms_tenant_isolation ON consent_forms
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== LAB_ORDERS =====
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_orders_tenant_isolation ON lab_orders
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== PATIENT_IMAGES =====
ALTER TABLE patient_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_images FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_images_tenant_isolation ON patient_images
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
