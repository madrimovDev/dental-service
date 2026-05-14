-- M3 — Services, appointments, queue, cashier RLS policies.
-- Tenant-scoped: faqat tenant context'da access.

-- ===== SERVICES =====
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
CREATE POLICY services_tenant_isolation ON services
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== SERVICE_PRICES =====
-- Service orqali tenant_id qaytariladi (subquery)
ALTER TABLE service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY service_prices_tenant_isolation ON service_prices
  USING (
    service_id IN (
      SELECT id FROM services
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    service_id IN (
      SELECT id FROM services
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );

-- ===== APPOINTMENTS =====
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_tenant_isolation ON appointments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== QUEUE_TICKETS =====
ALTER TABLE queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY queue_tickets_tenant_isolation ON queue_tickets
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== CASHIER_TRANSACTIONS =====
ALTER TABLE cashier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY cashier_tx_tenant_isolation ON cashier_transactions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== CASHIER_TRANSACTION_ITEMS =====
-- Via parent transaction
ALTER TABLE cashier_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_transaction_items FORCE ROW LEVEL SECURITY;
CREATE POLICY cashier_items_tenant_isolation ON cashier_transaction_items
  USING (
    transaction_id IN (
      SELECT id FROM cashier_transactions
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    transaction_id IN (
      SELECT id FROM cashier_transactions
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );
