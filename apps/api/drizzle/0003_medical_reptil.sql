CREATE TYPE "public"."tooth_state" AS ENUM('healthy', 'caries', 'filling', 'crown', 'implant', 'missing', 'root_canal', 'to_extract', 'temporary', 'veneer');--> statement-breakpoint
CREATE TYPE "public"."tooth_surface" AS ENUM('whole', 'M', 'D', 'B', 'L', 'O', 'I');--> statement-breakpoint
CREATE TYPE "public"."treatment_plan_status" AS ENUM('draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."treatment_stage_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_uz" text NOT NULL,
	"name_ru" text NOT NULL,
	"category" text NOT NULL,
	"description_uz" text,
	"description_ru" text,
	CONSTRAINT "diagnoses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tooth_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"visit_note_id" uuid,
	"is_primary_dentition" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tooth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tooth_chart_id" uuid NOT NULL,
	"tooth_number" integer NOT NULL,
	"surface" "tooth_surface" DEFAULT 'whole' NOT NULL,
	"state" "tooth_state" NOT NULL,
	"diagnosis_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "treatment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"title" text NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"status" "treatment_plan_status" DEFAULT 'draft' NOT NULL,
	"consent_signed_at" timestamp with time zone,
	"consent_signature_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"treatment_plan_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"tooth_numbers" integer[],
	"estimated_visits" integer DEFAULT 1 NOT NULL,
	"estimated_duration_minutes" integer,
	"cost" numeric(14, 2) NOT NULL,
	"status" "treatment_stage_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "visit_note_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"template" jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"visit_date" timestamp with time zone DEFAULT now() NOT NULL,
	"subjective" text,
	"objective" text,
	"assessment_diagnoses" uuid[],
	"plan" text,
	"performed_services" uuid[],
	"free_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tooth_charts" ADD CONSTRAINT "tooth_charts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_charts" ADD CONSTRAINT "tooth_charts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_charts" ADD CONSTRAINT "tooth_charts_visit_note_id_visit_notes_id_fk" FOREIGN KEY ("visit_note_id") REFERENCES "public"."visit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_charts" ADD CONSTRAINT "tooth_charts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_states" ADD CONSTRAINT "tooth_states_tooth_chart_id_tooth_charts_id_fk" FOREIGN KEY ("tooth_chart_id") REFERENCES "public"."tooth_charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_states" ADD CONSTRAINT "tooth_states_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_stages" ADD CONSTRAINT "treatment_stages_treatment_plan_id_treatment_plans_id_fk" FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_stages" ADD CONSTRAINT "treatment_stages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_note_templates" ADD CONSTRAINT "visit_note_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_note_templates" ADD CONSTRAINT "visit_note_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diagnoses_category_idx" ON "diagnoses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tooth_charts_patient_idx" ON "tooth_charts" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "tooth_charts_tenant_idx" ON "tooth_charts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tooth_states_chart_idx" ON "tooth_states" USING btree ("tooth_chart_id","tooth_number");--> statement-breakpoint
CREATE INDEX "treatment_plans_patient_idx" ON "treatment_plans" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "treatment_plans_status_idx" ON "treatment_plans" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "treatment_stages_plan_idx" ON "treatment_stages" USING btree ("treatment_plan_id","sequence");--> statement-breakpoint
CREATE INDEX "visit_note_templates_tenant_idx" ON "visit_note_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "visit_notes_patient_idx" ON "visit_notes" USING btree ("patient_id","visit_date");--> statement-breakpoint
CREATE INDEX "visit_notes_tenant_idx" ON "visit_notes" USING btree ("tenant_id","visit_date");