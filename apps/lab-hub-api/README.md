# Lab Hub API (`apps/lab-hub-api`)

Markaziy laboratoriya portali backend'i (spec: `docs/superpowers/specs/2026-11-12-lab-portal-design.md`,
reja: `docs/superpowers/plans/2026-11-12-lab-hub.md`). Bun + Hono + Drizzle, Postgres RLS
(runtime rol `lab_hub_app` — NOSUPERUSER NOBYPASSRLS).

```bash
bun run db:migrate    # admin ulanish: drizzle + RLS + app rol grant'lari
bun run dev           # :8171
bun run test          # real Postgres (.env dagi lane bazasi)
```

## Master kalit (KEK) va boot tekshiruvi

- `LAB_HUB_KEK` — base64, 32 bayt; faqat env'da (bazada ham, zaxirada ham yo'q).
  Har lab DEK'i shu KEK bilan o'raladi (`labs.dek_wrapped`).
- Format xato bo'lsa `loadConfig` yiqiladi. **To'g'ri formatdagi, lekin BOSHQA KEK** ham
  boot'ni yiqitadi (`src/lib/kek-check.ts`, `Bun.serve`dan oldin): mavjud lab DEK'i
  ochib ko'riladi va `kek_check` kanareykasi (birinchi boot'da KEK bilan shifrlangan
  tasodifiy qiymat) tekshiriladi. Aks holda yangi lablar DEK'i noto'g'ri kalit bilan
  o'ralib, operator KEK'ni tuzatgach ochib bo'lmay qolardi.
- Xato matni: `LAB_HUB_KEK does not match the key this database was encrypted with`.
  Yechim — asl KEK'ni tiklash (KEK yo'qolsa ma'lumotni ochib bo'lmaydi).

## Ulanish bekor qilinsa (qaror)

Lab klinika bilan ulanishni bekor qilsa (`POST /v1/lab/links/:id/decision {decision:'revoke'}`)
yoki rad etsa:

- **faqat YANGI ishlar bloklanadi** — yangi `clinicCaseRef` bilan `PUT /v1/clinic/cases/:ref`
  → `403 link.not_active`;
- **mavjud ishlar yakunigacha davom etadi, ikkala tomonda**: klinika mavjud ishni qayta
  yuborishi (`sent` holatda yangilash), xabar/fayl qo'shishi, narxni tasdiqlashi,
  `delivered`/`remake` qilishi; lab holatni surishi, narx taklif qilishi, yozishmasi mumkin.

Obuna (`expiresAt` + 7 kun imtiyoz) bundan alohida: muddati tugagan lab yoki klinika
butunlay bloklanadi (mavjud ishlar ham).

## `/v1/clinic/changes` kursori (commit-xavfsiz)

`GET /v1/clinic/changes?since=<cursor>&limit=` — kursor shaffof satr `"<tx_id>.<seq>"`
(boshlang'ich `0.0`), javobdagi `nextCursor`ni keyingi so'rovga bering.

- `case_events.seq` (bigserial) **commit tartibida emas**: kichik seq olgan tranzaksiya
  kattasidan keyin commit bo'lishi mumkin, oddiy `seq > since` kursori uni abadiy
  o'tkazib yuborardi.
- Shuning uchun har hodisa yozgan tranzaksiya xid'ini saqlaydi (`tx_id`,
  `pg_current_xact_id()`), endpoint esa faqat `tx_id < pg_snapshot_xmin(pg_current_snapshot())`
  — ya'ni yozuvchisi allaqachon yakunlangan — hodisalarni `(tx_id, seq)` tartibida
  qaytaradi. Bu chegaradan pastda yangi hodisa hech qachon paydo bo'lmaydi, shuning
  uchun kursorni overlap'siz oldinga surish xavfsiz.
- Narxi: uzoq davom etayotgan yozuvchi tranzaksiya (shu Postgres klasterida) tugagunicha
  yangi hodisalar biroz kechikadi — yo'qolmaydi.
- Iste'molchi (klinika sinxroni, wave 2) baribir hodisalarni **idempotent** qo'llashi
  kerak (`seq` bo'yicha dedup): tarmoq uzilib javob yo'qolsa, xuddi shu sahifa qayta keladi.

## Supervisor bilan aloqa

- Hub → Supervisor: `GET /internal/clinics/:id/verify` (connect va davriy qayta tekshiruv) —
  `{clinicId, name, mode: 'desktop'|'saas', active, expiresAt, licenseMatches}`. Desktop —
  litsenziyalar bo'yicha, SaaS — `clinics.subscription_expires_at` (connect `serviceProof`
  bilan). Shartnoma `apps/supervisor-api/src/modules/hub/hub-internal.test.ts` seam testida
  shu ilovaning `createSupervisorClient`i bilan qulflangan.
- Supervisor → Hub: vendor renew / deactivate / reactivate'dan keyin best-effort
  `POST /internal/clinics` upsert (faol emas → `expiresAt: null` = darhol blok).
  `LAB_HUB_URL` sozlanmagan bo'lsa push o'tkazib yuboriladi; Hub baribir bloklangan klinikani
  har 10 daqiqada, faolini har 24 soatda qayta tekshiradi.
