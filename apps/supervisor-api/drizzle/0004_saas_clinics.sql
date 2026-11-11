ALTER TABLE "clinics" ADD COLUMN "mode" text DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "saas_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "subscription_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_saas_tenant_id_unique" UNIQUE("saas_tenant_id");