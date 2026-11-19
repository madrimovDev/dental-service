-- FX-137 (LC-15): service_prices WITH CHECK endi branch_id ham shu tenantga tegishli
-- bo'lishini talab qiladi. Avval faqat service_id tekshirilardi — FK RLS'ni chetlab
-- o'tgani uchun begona tenant filiali bilan narx yozish mumkin edi.
-- USING o'zgarmaydi (service orqali tenant izolyatsiyasi); faqat yozish tekshiruvi qattiqlashadi.
DROP POLICY IF EXISTS service_prices_tenant_isolation ON service_prices;
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
    AND branch_id IN (
      SELECT id FROM branches
      WHERE tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
  );
