ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_token_hash_unique";--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");