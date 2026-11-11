CREATE TABLE "lab_hub_applied_events" (
	"tenant_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_hub_applied_events_tenant_id_seq_pk" PRIMARY KEY("tenant_id","seq")
);
--> statement-breakpoint
CREATE TABLE "lab_hub_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint DEFAULT (extract(epoch from clock_timestamp()) * 1000000)::bigint NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"op" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lab_hub_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hub_clinic_id" uuid,
	"hub_key_enc" text,
	"cursor" text DEFAULT '0.0' NOT NULL,
	"labs_cache" jsonb,
	"connected_at" timestamp with time zone,
	"last_poll_at" timestamp with time zone,
	"last_push_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_hub_state_tenant_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "lab_order_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_name" text,
	"kind" text DEFAULT 'message' NOT NULL,
	"body" text,
	"hub_file" jsonb,
	"hub_ref" text,
	"created_by_user_id" uuid,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_order_messages_hub_ref_unique" UNIQUE("tenant_id","hub_ref")
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "lab_order_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "lab_hub_lab_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "lab_hub_case_ref" text;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "hub_sync_status" text;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "hub_status" text;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "hub_reject_reason" text;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "proposed_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "approved_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_hub_applied_events" ADD CONSTRAINT "lab_hub_applied_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_hub_outbox" ADD CONSTRAINT "lab_hub_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_hub_outbox" ADD CONSTRAINT "lab_hub_outbox_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_hub_state" ADD CONSTRAINT "lab_hub_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order_messages" ADD CONSTRAINT "lab_order_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order_messages" ADD CONSTRAINT "lab_order_messages_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order_messages" ADD CONSTRAINT "lab_order_messages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_hub_outbox_pending_idx" ON "lab_hub_outbox" USING btree ("tenant_id","status","seq");--> statement-breakpoint
CREATE INDEX "lab_hub_outbox_order_idx" ON "lab_hub_outbox" USING btree ("lab_order_id","seq");--> statement-breakpoint
CREATE INDEX "lab_order_messages_order_idx" ON "lab_order_messages" USING btree ("lab_order_id","created_at");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_lab_order_unique" ON "expenses" USING btree ("lab_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_orders_hub_case_ref_unique" ON "lab_orders" USING btree ("lab_hub_case_ref");