-- CLI-471: bemor darajasidagi double-booking. 0029 `appointments_no_doctor_overlap`
-- EXCLUDE constraint faqat doctor_id bo'yicha kesishuvni bloklaydi — bir bemor bir
-- vaqtda ikki xil doktorga yozilishi mumkin edi (jismonan imkonsiz). Bu constraint
-- doctor precedentini aynan mirror qiladi (bir xil status predikati va tstzrange
-- chegaralari), lekin patient_id bo'yicha kesishuvni DB darajasida atomik rad etadi.
--
-- Xato: SQLSTATE 23P01, constraint_name = 'appointments_no_patient_overlap' →
-- appointments.service.ts `exclusionConflictCode()` uni 409 `conflict.patient_busy`ga
-- map qiladi (doctor constraint'i `conflict.doctor_busy`dan ajratib).
--
-- ⚠️ Mavjud ma'lumot: agar joriy jadvalda bemor-overlap qatorlar bo'lsa (ilgari
-- ruxsat etilgan edi), bu ALTER TABLE fail bo'ladi — bu signal, avval overlaplarni
-- qo'lda tozalash kerak. EXCLUDE constraint `NOT VALID`ni qo'llab-quvvatlamaydi.
--
-- ⚠️ db-schema egasi uchun: 0029 EXCLUDE bilan bir xil pretsedent — schema DSL'da
-- deklaratsiya qilinmagan (Drizzle EXCLUDE'ni to'liq ifodalay olmaydi).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_patient_overlap" EXCLUDE USING gist ("patient_id" WITH =, tstzrange("start_time", "end_time") WITH &&) WHERE ("status" <> 'cancelled');
