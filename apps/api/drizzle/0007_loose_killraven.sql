ALTER TABLE "patients" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "insurance" jsonb;