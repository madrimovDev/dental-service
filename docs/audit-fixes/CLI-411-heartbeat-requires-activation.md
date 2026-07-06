# CLI-411 — Supervisor heartbeat aktivlanmagan litsenziyani qabul qiladi va fingerprint bog'lamaydi

> Audit: AUDIT-2026-07-06.md · H7. Desktop-only. CLI-410 bilan bir modelda (aktivatsiya fingerprint'ni bog'laydi).

## 1. Muammo va ildiz sabab

`heartbeat` — `apps/supervisor-api/src/modules/licenses/licenses.service.ts:49-66`:

```ts
if (lic.fingerprint && lic.fingerprint !== fingerprint) {   // 56
  throw ...FINGERPRINT_MISMATCH;
}
await db.update(licenses).set({ lastHeartbeatAt: new Date() })...  // 59
```

Tekshiruv `lic.fingerprint && ...` — ya'ni **`fingerprint` NULL (aktivlanmagan) bo'lsa shart butunlay o'tkazib yuboriladi**. Natijada:

- Hech qачон `activate` qilinmagan litsenziya (`fingerprint IS NULL`) uchun **istalgan fingerprint bilan heartbeat muvaffaqiyatli bo'ladi**.
- Heartbeat fingerprint'ni **saqlamaydi** (faqat `lastHeartbeatAt`) — shu sabab keyingi heartbeat'lar ham cheklanmaydi.
- Aktivatsiya bosqichini butunlay o'tkazib yuborib (faqat heartbeat chaqirib) cheksiz mashinadan ishlash mumkin. CLI-410 aktivatsiyada fingerprint'ni imzoga kiritsa ham, `heartbeat` yo'li NULL fingerprint uchun bo'sh string'siz imzolangan (yoki NULL) payload chiqarib bu himoyani teshadi.

## 2. Dizayn qarori

**DECISION (brief, tavsiya = reject):** `fingerprint IS NULL` bo'lsa heartbeat'ni **rad etish** — oldindan `activate` talab qilinadi. CLI-410'ning "aktivatsiya fingerprint'ni bog'laydi" modeli bilan tekislanadi: fingerprint faqat `activate` (yoki admin `reactivate`) orqali bog'lanadi, heartbeat esa bog'langanini tasdiqlaydi.

**Rad etilgan alternativa — "birinchi heartbeat'da bog'lash":** aktivatsiya rate-limit (activate.ts:25-29) va aniq audit event (`event:'activated'`) ni chetlab o'tadi; heartbeat'ni yashirin aktivatsiya yo'liga aylantiradi. Kamroq aниq, bir xil xavfsizlikni bermaydi.

## 3. Spec — xulq + qirra holatlar + test holatlari

### Yangi `heartbeat` xulqi
1. `lic` topilmadi yoki `!lic.isActive` → `INVALID_KEY` (403) — mavjud (53-55).
2. **YANGI:** `!lic.fingerprint` (NULL) → `NOT_ACTIVATED` (403) throw. Klient buni transient bo'lmagan xato sifatida ko'radi — heartbeat-scheduler §6 (heartbeat-scheduler.ts:56-58) `INVALID_KEY`'dan boshqa xatolarни log qilib cache'ni saqlaydi, shuning uchun bu holatda `.lic` hech qачон yozilmagan bo'ladi (aktivlanmagan mashinada `.lic` yo'q → `readLicense` null → `runLicenseHeartbeatCheck` no-op, license-heartbeat-scheduler.ts:39-40). Amalda: heartbeat'ни faqat aktivlangan mashina yuboradi.
3. `lic.fingerprint !== fingerprint` → `FINGERPRINT_MISMATCH` (403) — mavjud, endi NULL guard'siz.
4. Aks holda `lastHeartbeatAt` yangilanadi + `buildResponse` (CLI-410: fingerprint bilan imzolangan).

### Qirra holatlar
- **Aktivlangan, to'g'ri fingerprint** → 200, qayta imzolangan payload.
- **Aktivlangan, boshqa fingerprint** → `FINGERPRINT_MISMATCH`.
- **Hech qачон aktivlanmagan (NULL)** → `NOT_ACTIVATED`.
- **`isActive:false` (revoke)** → `INVALID_KEY` (birinchi guard, fingerprint tekshiruvidan oldin) — deaktivatsiya klientda `.lic` invalidatsiyasini keltiradi (heartbeat-scheduler.ts:48-49).

### Test holatlari (`apps/supervisor-api/src/modules/licenses/licenses.test.ts`)
1. Aktivlanmagan litsenziya (fingerprint NULL) uchun `heartbeat(key, anyFp)` → throw `NOT_ACTIVATED`, `status:403`.
2. `activate` qilingan mashina uchun `heartbeat` bir xil fingerprint → muvaffaqiyat, javob `fingerprint` bilan imzolangan.
3. `activate` qilingan, boshqa fingerprint → `FINGERPRINT_MISMATCH`.
4. Aktivlanmagan litsenziyada heartbeat urinishidan keyin DB'da `fingerprint` hali ham NULL (heartbeat bog'lamaydi).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — yuqoridagi #1: hozirgi kod `NULL && ...` → shart o'tib ketadi → 200 qaytaradi → test kutgan 403 emas → qizil.
2. **Impl** — licenses.service.ts:56 dan oldin guard:
   ```ts
   if (!lic.fingerprint) {
     throw Object.assign(new Error('NOT_ACTIVATED'), { status: 403 });
   }
   ```
   `heartbeat` ichida, `db.update(...lastHeartbeatAt)` dan oldin.
3. **Verify** — `bun test apps/supervisor-api/src/modules/licenses/licenses.test.ts` yashil; `turbo typecheck`.

> To'liq runtime-verifiable (Supervisor Bun/Hono + test DB) — Linux'da test qilinadi.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya:** old-shart (CLI-410 §0) — dala'da litsenziya yo'q. Mavjud aktivlangan litsenziyalar (fingerprint bog'langan) ta'sirlanmaydi.
- **Xavf:** klient `NOT_ACTIVATED`'ни `INVALID_KEY` deb ko'rib `.lic`'ni o'chirmasin — u boshqa string, heartbeat-scheduler faqat `=== 'INVALID_KEY'`'da o'chiradi (heartbeat-scheduler.ts:48). Boshqa kod → log + cache saqlanadi. To'g'ri.
- **Rollback:** guard'ni olib tashlash nuqsonni qaytaradi.

## 6. Qabul mezonlari

- [ ] `fingerprint IS NULL` litsenziyada `heartbeat` → 403 `NOT_ACTIVATED`.
- [ ] Heartbeat aktivlanmagan litsenziyaga fingerprint yozmaydi.
- [ ] Aktivlangan + to'g'ri fingerprint → 200, imzolangan (CLI-410) javob.
- [ ] Aktivlangan + noto'g'ri fingerprint → `FINGERPRINT_MISMATCH`.
- [ ] licenses.test.ts yashil; typecheck toza.

## 7. Ta'sirlangan fayllar

- `apps/supervisor-api/src/modules/licenses/licenses.service.ts` — `heartbeat` NULL-fingerprint guard.
- `apps/supervisor-api/src/modules/licenses/licenses.test.ts` — yangi test holatlari.
