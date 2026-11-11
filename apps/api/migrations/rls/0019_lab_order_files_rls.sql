-- UI-D5 — lab_order_files tenant izolyatsiyasi (yangi jadval).
-- ===== LAB_ORDER_FILES =====
ALTER TABLE lab_order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_order_files FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_order_files_tenant_isolation ON lab_order_files
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
