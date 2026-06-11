-- R4 Guruh C — Bildirishnomalar (notifications) RLS policy.
-- Tenant-scoped + user-scoped: faqat tenant context'da access.
-- To'g'ridan-to'g'ri `tenant_id` ustuniga ega → standart policy.

-- ===== NOTIFICATIONS =====
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
