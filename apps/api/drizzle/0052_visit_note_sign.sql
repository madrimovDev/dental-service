ALTER TABLE "visit_notes" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD COLUMN "signed_by" uuid;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;