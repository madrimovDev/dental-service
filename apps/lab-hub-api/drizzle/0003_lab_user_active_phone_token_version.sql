DROP INDEX "lab_users_phone_uq";--> statement-breakpoint
ALTER TABLE "lab_users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_users_phone_uq" ON "lab_users" USING btree ("phone") WHERE "lab_users"."is_active";