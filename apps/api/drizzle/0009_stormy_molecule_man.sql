CREATE TABLE "treatment_stage_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cashier_transactions" ADD COLUMN "treatment_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "treatment_stage_payments" ADD CONSTRAINT "treatment_stage_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_stage_payments" ADD CONSTRAINT "treatment_stage_payments_transaction_id_cashier_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."cashier_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_stage_payments" ADD CONSTRAINT "treatment_stage_payments_stage_id_treatment_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stage_payments_tenant_stage_idx" ON "treatment_stage_payments" USING btree ("tenant_id","stage_id");--> statement-breakpoint
CREATE INDEX "stage_payments_transaction_idx" ON "treatment_stage_payments" USING btree ("transaction_id");--> statement-breakpoint
ALTER TABLE "cashier_transactions" ADD CONSTRAINT "cashier_transactions_treatment_plan_id_treatment_plans_id_fk" FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashier_tx_treatment_plan_idx" ON "cashier_transactions" USING btree ("treatment_plan_id");