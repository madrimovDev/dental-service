-- Epic B (Recall / Revisit) — RLS policies (RFC-0011 §3).
-- Tenant-scoped: faqat tenant context'da access. Ikkala jadval ham
-- to'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy (0012 pattern).
--
-- ⚠️ Worker cross-tenant scan'i `DATABASE_ADMIN_URL` (RLS bypass) ishlatadi
-- (Qaror #23) — keyin `withTenant(tenantId)` per-row orqali RLS context'da yozadi.

-- ===== RECALLS =====
ALTER TABLE recalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE recalls FORCE ROW LEVEL SECURITY;
CREATE POLICY recalls_tenant_isolation ON recalls
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ===== RECALL_LOGS =====
ALTER TABLE recall_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY recall_logs_tenant_isolation ON recall_logs
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
