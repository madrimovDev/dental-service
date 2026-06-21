CREATE TYPE "public"."treatment_stage_acceptance" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
ALTER TABLE "treatment_stages" ADD COLUMN "acceptance" "treatment_stage_acceptance" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_stage_id_treatment_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."treatment_stages"("id") ON DELETE set null ON UPDATE no action;