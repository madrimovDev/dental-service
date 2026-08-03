-- Qo'lda tahrirlangan (drizzle-kit generatsiyasidan keyin).
-- Generatsiya qilingan variant `ADD COLUMN ... NOT NULL` ni default'siz qo'shardi
-- va MAVJUD qatorlarda yiqilardi (Supervisor prod VM'da haqiqiy klinika va
-- litsenziya qatorlari bor). Shuning uchun tartib: nullable qo'shish →
-- placeholder bilan to'ldirish → NOT NULL qo'yish. Bo'sh yangi bazada ham
-- xuddi shu tartib to'g'ri ishlaydi.
ALTER TABLE "clinics" ADD COLUMN "owner_full_name" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "owner_phone" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "owner_temp_password" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "default_language" text DEFAULT 'uz' NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "provisioned_at" timestamp;--> statement-breakpoint

-- Mavjud (provisioning'gacha yaratilgan) klinikalar uchun placeholder — ular
-- allaqachon qo'lda ro'yxatdan o'tgan, provisioning ularga qo'llanmaydi.
UPDATE "clinics" SET "owner_full_name" = 'Noma''lum' WHERE "owner_full_name" IS NULL;--> statement-breakpoint
UPDATE "clinics" SET "owner_phone" = '' WHERE "owner_phone" IS NULL;--> statement-breakpoint

ALTER TABLE "clinics" ALTER COLUMN "owner_full_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ALTER COLUMN "owner_phone" SET NOT NULL;
