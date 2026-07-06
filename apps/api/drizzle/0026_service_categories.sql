CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_ru" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_tenant_name_unique" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "service_categories_tenant_idx" ON "service_categories" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category_id" uuid;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Backfill: mavjud erkin-matn kategoriyalardan service_categories yaratish + bog'lash
INSERT INTO service_categories (tenant_id, name)
SELECT DISTINCT tenant_id, category
FROM services
WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (tenant_id, name) DO NOTHING;
--> statement-breakpoint
UPDATE services s
SET category_id = sc.id
FROM service_categories sc
WHERE sc.tenant_id = s.tenant_id AND sc.name = s.category;
--> statement-breakpoint
DROP INDEX "services_tenant_category_idx";
--> statement-breakpoint
ALTER TABLE "services" DROP COLUMN "category";
--> statement-breakpoint
CREATE INDEX "services_tenant_category_id_idx" ON "services" USING btree ("tenant_id","category_id");
