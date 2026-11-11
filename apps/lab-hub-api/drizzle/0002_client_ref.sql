ALTER TABLE "case_files" ADD COLUMN "client_ref" text;--> statement-breakpoint
ALTER TABLE "case_messages" ADD COLUMN "client_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "case_files_client_ref_unique" ON "case_files" USING btree ("case_id","client_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "case_messages_client_ref_unique" ON "case_messages" USING btree ("case_id","client_ref");