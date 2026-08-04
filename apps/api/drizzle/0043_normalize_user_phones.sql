-- Task 9 — `users.phone` mavjud qatorlarini yagona kanonik shaklga (`+<raqamlar>`)
-- keltiradi. Qoida `packages/core/src/phone.ts` `normalizePhone` bilan AYNAN bir xil:
-- barcha raqamsiz belgilar olib tashlanadi; 9 xonali kiritma mahalliy O'zbekiston
-- formati deb hisoblanib `998` prefiksi qo'shiladi; natija `+` bilan boshlanadi.
--
-- `users_phone_unique` — TO'LIQ (partial EMAS) unique indeks, ya'ni soft-deleted
-- qator ham tirik qator bilan to'qnashadi. Shuning uchun quyidagi ikkala predikat
-- (aniqlash va UPDATE) BAYT-MA-BAYT bir xil qator to'plamini qamraydi va
-- `deleted_at` bo'yicha filtrlamaydi — aks holda guard "toza" deb hisoblab,
-- UPDATE aynan o'zi va'da qilgan unique-buzilishga uchrardi.
--
-- To'qnashuv bo'lsa — JIM BIRLASHTIRISH YO'Q: qaysi hisob haqiqiy ekanini faqat
-- inson hal qila oladi, migratsiya konfliktli id/telefon ro'yxati bilan to'xtaydi.
DO $$
DECLARE
  conflict_rows text;
BEGIN
  SELECT string_agg(format('%s -> %s', ids, norm), '; ')
    INTO conflict_rows
  FROM (
    SELECT
      CASE
        WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
          THEN '+998' || regexp_replace(phone, '\D', '', 'g')
        ELSE '+' || regexp_replace(phone, '\D', '', 'g')
      END AS norm,
      string_agg(id::text, ',' ORDER BY id) AS ids
    FROM users
    WHERE regexp_replace(phone, '\D', '', 'g') <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) c;

  IF conflict_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Telefon normalizatsiyasi to''xtatildi — to''qnashuvlar: %', conflict_rows;
  END IF;

  UPDATE users
  SET phone = CASE
    WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
      THEN '+998' || regexp_replace(phone, '\D', '', 'g')
    ELSE '+' || regexp_replace(phone, '\D', '', 'g')
  END
  WHERE regexp_replace(phone, '\D', '', 'g') <> '';
END $$;
