-- FX-02 (LA-46, D-12): appointments EXCLUDE constraint'lari tenant'ga bog'lanadi.
-- 0029 (`appointments_no_doctor_overlap`) va 0035 (`appointments_no_patient_overlap`)
-- `tenant_id`siz GLOBAL edi: ikki klinikada ishlaydigan doktorning bir klinikadagi
-- broni boshqa klinikaning bronini bloklardi (va A klinika B klinikaning band vaqtini
-- bilvosita bilib olardi). Endi `tenant_id WITH =` — tenantlararo bloklash/sizish yo'q.
-- Constraint NOMLARI saqlanadi — `exclusionConflictCode()` 23P01'ni nom bo'yicha
-- doctor_busy/patient_busy'ga map qiladi. Qoida yumshaydi (faqat kamroq qator
-- kesishadi), shuning uchun mavjud ma'lumot yangi constraint'ni buzmaydi.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_doctor_overlap";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_doctor_overlap" EXCLUDE USING gist ("tenant_id" WITH =, "doctor_id" WITH =, tstzrange("start_time", "end_time") WITH &&) WHERE ("status" <> 'cancelled');--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_patient_overlap";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_patient_overlap" EXCLUDE USING gist ("tenant_id" WITH =, "patient_id" WITH =, tstzrange("start_time", "end_time") WITH &&) WHERE ("status" <> 'cancelled');
