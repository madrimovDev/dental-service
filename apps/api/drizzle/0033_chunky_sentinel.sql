ALTER TABLE "consent_forms" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consent_forms" ADD COLUMN "is_perpetual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD COLUMN "consent_form_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_consent_form_id_consent_forms_id_fk" FOREIGN KEY ("consent_form_id") REFERENCES "public"."consent_forms"("id") ON DELETE set null ON UPDATE no action;