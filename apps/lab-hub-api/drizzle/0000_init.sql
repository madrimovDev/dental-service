CREATE TABLE "case_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"uploaded_by" text NOT NULL,
	"file_name_enc" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_name" text,
	"body_enc" text,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"clinic_case_ref" text NOT NULL,
	"patient_name_enc" text,
	"patient_sex" text,
	"patient_age" integer,
	"clinic_code" text,
	"doctor_name" text,
	"teeth" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_type" text NOT NULL,
	"material" text,
	"shade_enc" text,
	"due_date" date,
	"note_enc" text,
	"status" text NOT NULL,
	"reject_reason" text,
	"assigned_technician_id" uuid,
	"proposed_price" numeric(14, 2),
	"approved_price" numeric(14, 2),
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supervisor_clinic_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"name" text NOT NULL,
	"hub_key_hash" text,
	"expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinics_supervisor_clinic_id_unique" UNIQUE("supervisor_clinic_id"),
	CONSTRAINT "clinics_hub_key_hash_unique" UNIQUE("hub_key_hash")
);
--> statement-breakpoint
CREATE TABLE "lab_clinic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lab_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"description" text,
	"catalog_visible" boolean DEFAULT true NOT NULL,
	"dek_wrapped" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"work_type" text NOT NULL,
	"material" text,
	"price" numeric(14, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lab_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"period" text NOT NULL,
	"total_approved" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_file_id_case_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."case_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_assigned_technician_id_lab_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."lab_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_clinic_links" ADD CONSTRAINT "lab_clinic_links_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_clinic_links" ADD CONSTRAINT "lab_clinic_links_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_users" ADD CONSTRAINT "lab_users_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_lab_id_labs_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."labs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_clinic_seq_idx" ON "case_events" USING btree ("clinic_id","seq");--> statement-breakpoint
CREATE INDEX "case_files_case_idx" ON "case_files" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_messages_case_idx" ON "case_messages" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_clinic_ref_uq" ON "cases" USING btree ("clinic_id","clinic_case_ref");--> statement-breakpoint
CREATE INDEX "cases_lab_status_idx" ON "cases" USING btree ("lab_id","status");--> statement-breakpoint
CREATE INDEX "cases_delivered_idx" ON "cases" USING btree ("delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_clinic_links_uq" ON "lab_clinic_links" USING btree ("lab_id","clinic_id");--> statement-breakpoint
CREATE INDEX "lab_clinic_links_clinic_idx" ON "lab_clinic_links" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_users_phone_uq" ON "lab_users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "lab_users_lab_idx" ON "lab_users" USING btree ("lab_id");--> statement-breakpoint
CREATE INDEX "price_list_items_lab_idx" ON "price_list_items" USING btree ("lab_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_uq" ON "settlements" USING btree ("lab_id","clinic_id","period");