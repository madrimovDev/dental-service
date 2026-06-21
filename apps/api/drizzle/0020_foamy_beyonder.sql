CREATE TYPE "public"."recall_log_channel" AS ENUM('sms', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recall_log_outcome" AS ENUM('sent', 'failed', 'no_phone');--> statement-breakpoint
CREATE TYPE "public"."recall_reason" AS ENUM('preventive', 'treatment_followup', 'post_op_check', 'manual');--> statement-breakpoint
CREATE TYPE "public"."recall_source" AS ENUM('treatment_stage', 'appointment', 'manual', 'scheduler');--> statement-breakpoint
CREATE TYPE "public"."recall_status" AS ENUM('pending', 'contacted', 'scheduled', 'completed', 'dismissed');--> statement-breakpoint
CREATE TABLE "recall_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recall_id" uuid NOT NULL,
	"channel" "recall_log_channel" DEFAULT 'sms' NOT NULL,
	"outcome" "recall_log_outcome" NOT NULL,
	"detail" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recalls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"patient_id" uuid NOT NULL,
	"reason" "recall_reason" NOT NULL,
	"status" "recall_status" DEFAULT 'pending' NOT NULL,
	"source" "recall_source" NOT NULL,
	"due_date" date NOT NULL,
	"interval_months" integer,
	"source_stage_id" uuid,
	"treatment_plan_id" uuid,
	"scheduled_appointment_id" uuid,
	"assigned_doctor_id" uuid,
	"last_contacted_at" timestamp with time zone,
	"contact_attempts" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" uuid,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "default_recall_interval_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "timezone" text DEFAULT 'Asia/Tashkent' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "recall_send_hour_local" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "recall_logs" ADD CONSTRAINT "recall_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_logs" ADD CONSTRAINT "recall_logs_recall_id_recalls_id_fk" FOREIGN KEY ("recall_id") REFERENCES "public"."recalls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_treatment_plan_id_treatment_plans_id_fk" FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_assigned_doctor_id_users_id_fk" FOREIGN KEY ("assigned_doctor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recall_logs_recall_idx" ON "recall_logs" USING btree ("recall_id");--> statement-breakpoint
CREATE INDEX "recalls_tenant_due_status_idx" ON "recalls" USING btree ("tenant_id","due_date","status");--> statement-breakpoint
CREATE INDEX "recalls_due_status_idx" ON "recalls" USING btree ("due_date","status");--> statement-breakpoint
CREATE INDEX "recalls_patient_idx" ON "recalls" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recalls_patient_stage_open_unique" ON "recalls" USING btree ("patient_id","source_stage_id") WHERE status in ('pending', 'contacted');