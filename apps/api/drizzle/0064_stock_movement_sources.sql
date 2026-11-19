ALTER TABLE "stock_movements" ADD COLUMN "source_service_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "source_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_service_id_services_id_fk" FOREIGN KEY ("source_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_stage_id_treatment_stages_id_fk" FOREIGN KEY ("source_stage_id") REFERENCES "public"."treatment_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "params" jsonb;