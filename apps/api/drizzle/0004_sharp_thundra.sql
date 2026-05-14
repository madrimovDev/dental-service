CREATE TYPE "public"."consent_type" AS ENUM('treatment', 'anesthesia', 'photo', 'data_processing', 'other');--> statement-breakpoint
CREATE TYPE "public"."lab_order_status" AS ENUM('draft', 'sent', 'in_progress', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lab_order_type" AS ENUM('crown', 'bridge', 'prosthetic', 'aligners', 'denture', 'inlay_onlay', 'other');--> statement-breakpoint
CREATE TYPE "public"."patient_image_type" AS ENUM('xray_panoramic', 'xray_periapical', 'xray_bitewing', 'xray_cbct', 'intraoral_photo', 'face_photo', 'before_after', 'other');--> statement-breakpoint
CREATE TABLE "consent_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"template_id" uuid,
	"type" "consent_type" NOT NULL,
	"title" text NOT NULL,
	"body_text" text NOT NULL,
	"language" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signed_by_user_id" uuid NOT NULL,
	"patient_signature_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"title" text NOT NULL,
	"body_uz" text NOT NULL,
	"body_ru" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"order_number" integer,
	"lab_name" text NOT NULL,
	"order_type" "lab_order_type" NOT NULL,
	"status" "lab_order_status" DEFAULT 'draft' NOT NULL,
	"items" jsonb NOT NULL,
	"sent_date" timestamp with time zone,
	"expected_date" timestamp with time zone,
	"delivered_date" timestamp with time zone,
	"cost" numeric(14, 2),
	"currency" text DEFAULT 'UZS' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"type" "patient_image_type" NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"title" text,
	"description" text,
	"tooth_numbers" integer[],
	"taken_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"visit_note_id" uuid,
	"issued_date" timestamp with time zone DEFAULT now() NOT NULL,
	"items" jsonb NOT NULL,
	"diagnosis" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_template_id_consent_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."consent_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_templates" ADD CONSTRAINT "consent_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_images" ADD CONSTRAINT "patient_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_images" ADD CONSTRAINT "patient_images_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_images" ADD CONSTRAINT "patient_images_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_visit_note_id_visit_notes_id_fk" FOREIGN KEY ("visit_note_id") REFERENCES "public"."visit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_forms_patient_idx" ON "consent_forms" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "consent_forms_tenant_signed_idx" ON "consent_forms" USING btree ("tenant_id","signed_at");--> statement-breakpoint
CREATE INDEX "consent_templates_tenant_type_idx" ON "consent_templates" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE INDEX "lab_orders_patient_idx" ON "lab_orders" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "lab_orders_tenant_status_idx" ON "lab_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "patient_images_patient_idx" ON "patient_images" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patient_images_tenant_created_idx" ON "patient_images" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_idx" ON "prescriptions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "prescriptions_tenant_issued_idx" ON "prescriptions" USING btree ("tenant_id","issued_date");