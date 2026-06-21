-- Epic A (Doctor Schedule / Availability) — RLS policies.
-- Tenant-scoped: faqat tenant context'da access.
-- Ikkala jadval ham to'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy.

-- ===== DOCTOR_SCHEDULES =====
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY doctor_schedules_tenant_isolation ON doctor_schedules
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== DOCTOR_TIME_OFF =====
ALTER TABLE doctor_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_time_off FORCE ROW LEVEL SECURITY;
CREATE POLICY doctor_time_off_tenant_isolation ON doctor_time_off
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
