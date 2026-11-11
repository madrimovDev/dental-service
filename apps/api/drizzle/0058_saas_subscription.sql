ALTER TABLE "tenant_settings" ADD COLUMN "supervisor_clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "subscription_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "subscription_synced_at" timestamp with time zone;