-- Task 8 — bemor telefonlarini yagona kanonik shaklga (`+<raqamlar>`) keltiradi.
-- Qoida `packages/core/src/phone.ts` `normalizePhone` bilan AYNAN bir xil: barcha
-- raqamsiz belgilar olib tashlanadi; 9 xonali kiritma mahalliy O'zbekiston
-- formati deb hisoblanib `998` prefiksi qo'shiladi; natija `+` bilan boshlanadi.
--
-- 0043 (`users.phone`) DAN FARQI: `patients.phone` UNIQUE EMAS (oila a'zolari
-- bitta raqamni ulashishi mumkin, `patients_tenant_phone_idx` — oddiy indeks),
-- shuning uchun to'qnashuv guard'i KERAK EMAS va bu migratsiya hech qachon
-- to'xtamaydi.
--
-- Bo'sh/raqamsiz qiymatlar NULL ga aylantiriladi — `'+'` yozib qo'yilmaydi
-- (kod tomonidagi `normalizeOptionalPhone` bilan bir xil xulq).
--
-- `patient_relatives` — bemor↔bemor link jadvali, telefon ustuni YO'Q
-- (`packages/db-schema/src/tables/patient-relatives.ts`), shuning uchun bu yerda
-- yo'q. Telefon saqlaydigan jadvallar: `patients` (phone, phone_secondary) va
-- `patient_emergency_contacts` (phone, NOT NULL).

UPDATE patients
SET phone = CASE
  WHEN regexp_replace(phone, '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL;
--> statement-breakpoint
UPDATE patients
SET phone_secondary = CASE
  WHEN regexp_replace(phone_secondary, '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone_secondary, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone_secondary, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone_secondary, '\D', '', 'g')
END
WHERE phone_secondary IS NOT NULL;
--> statement-breakpoint
-- `phone` NOT NULL — raqamsiz qiymatni NULL qilib bo'lmaydi, shuning uchun
-- bunday qatorlar (agar bo'lsa) TEGILMAY qoladi (WHERE ... <> '').
UPDATE patient_emergency_contacts
SET phone = CASE
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone, '\D', '', 'g')
END
WHERE regexp_replace(phone, '\D', '', 'g') <> '';
