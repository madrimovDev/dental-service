-- Lab Hub RLS (Review Focus 1): lab konteksti faqat o'z labini, klinika konteksti
-- faqat o'zi yuborgan ishlarni ko'radi. Kontekst `set_config(..., true)` bilan
-- tranzaksiya ichida o'rnatiladi (src/db/scoped.ts). Sozlama yo'q -> NULL -> 0 qator.
-- FORCE: jadval egasi ham bo'ysunadi; runtime rol NOSUPERUSER NOBYPASSRLS.

ALTER TABLE lab_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_users_scope ON lab_users;
CREATE POLICY lab_users_scope ON lab_users FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid);
-- Login: lab hali ma'lum emas — faqat aniq telefon bo'yicha O'QISH.
DROP POLICY IF EXISTS lab_users_login ON lab_users;
CREATE POLICY lab_users_login ON lab_users FOR SELECT
  USING (phone = NULLIF(current_setting('app.login_phone', true), ''));

ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_list_items_scope ON price_list_items;
CREATE POLICY price_list_items_scope ON price_list_items FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid);

ALTER TABLE lab_clinic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_clinic_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_clinic_links_scope ON lab_clinic_links;
CREATE POLICY lab_clinic_links_scope ON lab_clinic_links FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cases_scope ON cases;
CREATE POLICY cases_scope ON cases FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_files_scope ON case_files;
CREATE POLICY case_files_scope ON case_files FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_messages_scope ON case_messages;
CREATE POLICY case_messages_scope ON case_messages FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS case_events_scope ON case_events;
CREATE POLICY case_events_scope ON case_events FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlements_scope ON settlements;
CREATE POLICY settlements_scope ON settlements FOR ALL
  USING (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid)
  WITH CHECK (lab_id = NULLIF(current_setting('app.current_lab_id', true), '')::uuid
      OR clinic_id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid);
