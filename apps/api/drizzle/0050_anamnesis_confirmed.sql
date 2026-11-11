ALTER TABLE "medical_records" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;