-- M4 — Klinik core: treatment plans + visit notes + tooth charts RLS.
-- diagnoses YO'Q (platform-level read-only catalog).

-- ===== TREATMENT_PLANS =====
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY treatment_plans_tenant_isolation ON treatment_plans
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== TREATMENT_STAGES =====
-- Via parent plan
ALTER TABLE treatment_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_stages FORCE ROW LEVEL SECURITY;
CREATE POLICY treatment_stages_tenant_isolation ON treatment_stages
  USING (
    treatment_plan_id IN (
      SELECT id FROM treatment_plans
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    treatment_plan_id IN (
      SELECT id FROM treatment_plans
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

-- ===== VISIT_NOTES =====
ALTER TABLE visit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY visit_notes_tenant_isolation ON visit_notes
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== VISIT_NOTE_TEMPLATES =====
ALTER TABLE visit_note_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_note_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY visit_note_templates_tenant_isolation ON visit_note_templates
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== TOOTH_CHARTS =====
ALTER TABLE tooth_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tooth_charts FORCE ROW LEVEL SECURITY;
CREATE POLICY tooth_charts_tenant_isolation ON tooth_charts
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== TOOTH_STATES =====
-- Via parent chart
ALTER TABLE tooth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tooth_states FORCE ROW LEVEL SECURITY;
CREATE POLICY tooth_states_tenant_isolation ON tooth_states
  USING (
    tooth_chart_id IN (
      SELECT id FROM tooth_charts
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    tooth_chart_id IN (
      SELECT id FROM tooth_charts
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

-- ===== DIAGNOSES — RLS YO'Q =====
-- Platform-level read-only katalog (ICD-10).
-- Hech qaysi tenant insert qila olmaydi (faqat boot seed).
