CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_doctor_overlap" EXCLUDE USING gist ("doctor_id" WITH =, tstzrange("start_time", "end_time") WITH &&) WHERE ("status" <> 'cancelled');
