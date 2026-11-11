CREATE TABLE "kek_check" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"canary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD COLUMN "tx_id" bigint DEFAULT (pg_current_xact_id()::text)::bigint NOT NULL;--> statement-breakpoint
CREATE INDEX "case_events_clinic_tx_seq_idx" ON "case_events" USING btree ("clinic_id","tx_id","seq");