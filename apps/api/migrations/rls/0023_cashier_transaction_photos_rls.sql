-- FT-06.3 — cashier_transaction_photos tenant izolyatsiyasi (yangi jadval, migratsiya 0071).
-- ===== CASHIER_TRANSACTION_PHOTOS =====
ALTER TABLE cashier_transaction_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_transaction_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY cashier_transaction_photos_tenant_isolation ON cashier_transaction_photos
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
