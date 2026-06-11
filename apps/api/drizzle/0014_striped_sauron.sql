CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('active', 'on_leave', 'inactive');--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid,
	"base_salary" numeric(14, 2) NOT NULL,
	"attributed_revenue" numeric(14, 2) NOT NULL,
	"commission_percent" numeric(5, 2) NOT NULL,
	"commission_amount" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"specialty" text,
	"employment_status" "employment_status" DEFAULT 'active' NOT NULL,
	"started_at" date,
	"base_salary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"commission_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_tenant_user_unique" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_lines_tenant_run_idx" ON "payroll_lines" USING btree ("tenant_id","run_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_tenant_idx" ON "payroll_runs" USING btree ("tenant_id","created_at");