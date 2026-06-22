-- V2-2 (Ombor chuqurligi, CLI-242) — stock_batches RLS policy.
-- Tenant-scoped: faqat tenant context'da access (0014 pattern). Stock branch-scoped
-- bo'lsa-da, batch tenant-darajasida (item orqali branchga bog'lanadi).

-- ===== STOCK_BATCHES =====
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_batches_tenant_isolation ON stock_batches
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
