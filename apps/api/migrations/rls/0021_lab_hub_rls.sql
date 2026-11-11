-- Lab Hub (W2 clinic-sync) — klinika tomonidagi sinxron jadvallari tenant izolyatsiyasi (migratsiya 0059).
-- ===== LAB_HUB_STATE =====
ALTER TABLE lab_hub_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_hub_state FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_hub_state_tenant_isolation ON lab_hub_state
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
-- ===== LAB_HUB_OUTBOX =====
ALTER TABLE lab_hub_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_hub_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_hub_outbox_tenant_isolation ON lab_hub_outbox
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
-- ===== LAB_ORDER_MESSAGES =====
ALTER TABLE lab_order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_order_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_order_messages_tenant_isolation ON lab_order_messages
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
-- ===== LAB_HUB_APPLIED_EVENTS =====
ALTER TABLE lab_hub_applied_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_hub_applied_events FORCE ROW LEVEL SECURITY;
CREATE POLICY lab_hub_applied_events_tenant_isolation ON lab_hub_applied_events
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
