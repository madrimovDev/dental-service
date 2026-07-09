CREATE TABLE "patient_no_show_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"waived" boolean DEFAULT false NOT NULL,
	"waived_reason" text,
	"waived_by" uuid,
	"waived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_no_show_strikes" ADD CONSTRAINT "patient_no_show_strikes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_no_show_strikes" ADD CONSTRAINT "patient_no_show_strikes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_no_show_strikes" ADD CONSTRAINT "patient_no_show_strikes_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_no_show_strikes" ADD CONSTRAINT "patient_no_show_strikes_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_no_show_strikes_appointment_unique" ON "patient_no_show_strikes" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "patient_no_show_strikes_patient_idx" ON "patient_no_show_strikes" USING btree ("tenant_id","patient_id");