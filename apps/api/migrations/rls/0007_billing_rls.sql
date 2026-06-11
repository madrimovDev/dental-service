-- R2 — Billing: treatment_stage_payments RLS policy.
-- Tenant-scoped (tenant_id to'g'ridan-to'g'ri). cashier_transactions allaqachon RLS
-- (0003), yangi treatment_plan_id ustuni policy'ga ta'sir qilmaydi.

-- ===== TREATMENT_STAGE_PAYMENTS =====
ALTER TABLE treatment_stage_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_stage_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY treatment_stage_payments_tenant_isolation ON treatment_stage_payments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
