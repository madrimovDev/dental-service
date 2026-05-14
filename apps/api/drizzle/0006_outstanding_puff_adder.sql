-- M-phone: email → optional, phone → majburiy + UNIQUE
-- Backfill: hozir NULL phone'ga ega userlarga placeholder beriladi (+99890XXXXXXX format)
-- Bu placeholder real telefon emas — eski test userlar uchun schema constraint'ni qondiradi.
-- Kelajakda foydalanuvchilar haqiqiy telefon bilan qayta ro'yxatdan o'tishadi.

UPDATE "users"
SET "phone" = '+99890' || substring(replace("id"::text, '-', ''), 1, 7)
WHERE "phone" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
