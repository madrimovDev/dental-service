ALTER TABLE "services" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "services_tenant_deleted_idx" ON "services" USING btree ("tenant_id","deleted_at");