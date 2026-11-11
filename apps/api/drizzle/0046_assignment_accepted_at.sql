ALTER TABLE "user_assignments" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- P6 (FU-08): mavjud a'zoliklar qabul qilingan deb hisoblanadi (backfill). Faqat shu
-- migratsiyadan KEYIN mavjud foydalanuvchiga yuborilgan takliflar «kutilmoqda» (NULL) bo'ladi.
UPDATE "user_assignments" SET "accepted_at" = "created_at" WHERE "accepted_at" IS NULL;
