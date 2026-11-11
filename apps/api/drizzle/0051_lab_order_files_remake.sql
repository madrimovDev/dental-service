CREATE TABLE "lab_order_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lab_order_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"label" text,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "shade" text;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "remake_of_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "remake_reason" text;--> statement-breakpoint
ALTER TABLE "lab_order_files" ADD CONSTRAINT "lab_order_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order_files" ADD CONSTRAINT "lab_order_files_lab_order_id_lab_orders_id_fk" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_order_files" ADD CONSTRAINT "lab_order_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_order_files_order_idx" ON "lab_order_files" USING btree ("lab_order_id");--> statement-breakpoint
CREATE INDEX "lab_order_files_tenant_idx" ON "lab_order_files" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_remake_of_id_lab_orders_id_fk" FOREIGN KEY ("remake_of_id") REFERENCES "public"."lab_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_orders_remake_of_idx" ON "lab_orders" USING btree ("remake_of_id");--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_remake_reason_chk" CHECK ("lab_orders"."remake_reason" IS NULL OR "lab_orders"."remake_reason" IN ('margin', 'contact', 'occlusion', 'shade', 'esthetics', 'other'));