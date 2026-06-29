ALTER TABLE "recalls" ADD COLUMN "sms_status" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "stock_items" ADD COLUMN "price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "notification_settings" jsonb;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD COLUMN "integration_settings" jsonb;