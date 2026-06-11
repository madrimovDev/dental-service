CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vertical" text DEFAULT 'dental' NOT NULL,
	"reminder_lead_hours" integer DEFAULT 24 NOT NULL,
	"currency" text DEFAULT 'UZS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_transactions" ADD CONSTRAINT "cashier_transactions_parent_transaction_id_cashier_transactions_id_fk" FOREIGN KEY ("parent_transaction_id") REFERENCES "public"."cashier_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashier_tx_items_service_idx" ON "cashier_transaction_items" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_replaced_by_idx" ON "refresh_tokens" USING btree ("replaced_by_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "tooth_states_diagnosis_idx" ON "tooth_states" USING btree ("diagnosis_id");