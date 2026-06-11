-- R4 Guruh A — Xarajatlar, qarindoshlar, ombor RLS policies.
-- Tenant-scoped: faqat tenant context'da access.
-- Barcha 6 jadval to'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy.

-- ===== EXPENSE_CATEGORIES =====
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_categories_tenant_isolation ON expense_categories
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== EXPENSES =====
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY expenses_tenant_isolation ON expenses
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== PATIENT_RELATIVES =====
ALTER TABLE patient_relatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_relatives FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_relatives_tenant_isolation ON patient_relatives
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== STOCK_ITEMS =====
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_items_tenant_isolation ON stock_items
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== STOCK_MOVEMENTS =====
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_tenant_isolation ON stock_movements
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== SERVICE_MATERIALS =====
ALTER TABLE service_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_materials FORCE ROW LEVEL SECURITY;
CREATE POLICY service_materials_tenant_isolation ON service_materials
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
