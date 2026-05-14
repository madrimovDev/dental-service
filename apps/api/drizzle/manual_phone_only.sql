-- Manual SQL (drizzle generate'dan oldin yoki keyin majburlash uchun)
-- Boshqalardan farqi: 1-bosqich BACKFILL (data loss yo'q), keyin constraint o'zgartirish.

BEGIN;

-- 1. Placeholder telefon raqamlar — har bir user uchun unique
-- Format: +99890XXXXXXX (8 digit, ID'ning birinchi 7 belgisidan generate)
-- Bu telefon ishlamaydi — production'da real ish bermaydi, faqat schema constraint uchun.
UPDATE users
SET phone = '+99890' || substring(replace(id::text, '-', ''), 1, 7)
WHERE phone IS NULL;

-- 2. Phone'ni NOT NULL qilish
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- 3. Email'ni nullable qilish — endi majburiy emas
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 4. Email index'ni saqlash (legacy lookup uchun, lekin endi unique constraint kerakmas
--    chunki kelajakda foydalanuvchilar email yozmaydi)
-- email UNIQUE constraint qoladi — bo'sh email duplicate'lariga PostgreSQL ruxsat beradi
-- (NULL != NULL chunki). Faqat real email'larda unique.

COMMIT;
