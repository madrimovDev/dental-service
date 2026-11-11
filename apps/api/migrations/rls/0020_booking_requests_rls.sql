-- UI-T2 — booking_requests tenant izolyatsiyasi (yangi jadval, migratsiya 0053).
-- ===== BOOKING_REQUESTS =====
ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_requests_tenant_isolation ON booking_requests
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
