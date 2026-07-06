# CLI-427 — Deaktivlangan xodimni qayta-taklif `alreadyExists` qaytaradi, lekin qayta faollashtirmaydi

> Audit: `AUDIT-2026-07-06.md` §M14. READ-ONLY spec — kod o'zgarmaydi, faqat reja.

## 1. Muammo va ildiz sabab (file:line)

`apps/api/src/modules/users/users.service.ts:107-129` — `invite` ichидаgi dublikat
assignment qidiruvi:

```ts
const [existing] = await tx.select().from(userAssignments).where(
  and(
    eq(userAssignments.userId, user.id),
    eq(userAssignments.tenantId, tenantId),
    eq(userAssignments.roleId, input.roleId),
    input.branchId ? eq(...branchId) : sql`branchId IS NULL`,
  ),
);
if (existing) {
  return { ok: true, ..., alreadyExists: true };  // ← isActive tekshirilmaydi
}
```

Qidiruvда `isActive` filtri **yo'q**. Deaktivlangan (`isActive = false`) assignment ham
`existing` sifatida topiladi → `alreadyExists: true` qaytadi, **hech narsa o'zgartirmaydi**.
Assignment `isActive = false` qoladi.

**Oqibat zanjiri:**
- `getWorkspaces` (`auth.service.ts:350`) `eq(userAssignments.isActive, true)` filtrlaydi →
  xodim workspace ro'yxatida ko'rinmaydi.
- `switchWorkspace` (`auth.service.ts:469`) `isActive = true` majburlaydi → login/switch RAD.
- Admin `alreadyExists`ni ko'radi (`UsersSettingsScreen`
  `s('users.already_exists_message')`), "hammasi joyida" deb o'ylaydi — lekin xodim hali
  kira olmaydi. **Jim nosozlik.**

**Qo'shimcha risk (advisor):** `switchWorkspace` (`auth.service.ts:470`) `validTo <= now`
bo'lsa ham RAD qiladi (`or(isNull(validTo), gt(validTo, now))`). Agar deaktivlanган
assignment `validTo` o'tган bo'lsa, faqat `isActive=true` qilish YETMAYDI — `getWorkspaces`
(faqat isActive tekshiradi) uni ko'rsatadi, lekin `switchWorkspace` hali RAD qiladi →
"login works" qabul mezoni buziladi.

## 2. Dizayn qarori

**Tanlangan: dublikat qidiruvда `isActive`ни hisobga olib, mos INAKTIV assignment topilса
uni QAYTA FAOLLASHTIRISH (`isActive = true` + `validTo = null`), va buni alohida
`reactivated: true` bilan xabar qilish. `alreadyExists` faqat assignment HAQIQATAN
aktiv bo'lganда qaytariladi.**

Reaktivatsiya `validTo = null` qiladi — aks holда o'tган `validTo` login'ni bloklashда
davom etadi (advisor topgan qirra). Bu "qayta-taklif = qayta ishга olish" mazmuniga to'g'ri:
yangi muddat cheklovsiz.

Reaktivatsiya faqat AYNAN mos (tenant + role + branch) inaktiv assignment uchun. Boshqa
rol/branch bilan qayta-taklif — bu **yangi** assignment (joriy `else` yo'li, o'zgarmaydi).

Yangi audit action: `user.reactivated`.

**Rad etilган muqobil A — yangi assignment yaratish (inaktivini qoldirib):** har qayta-takliд
yangi qator. Rad etildi: dublikat inaktiv+aktiv qatorlar to'planadi (integrity iflosligi),
`(userId, tenantId, roleId, branchId)` bo'yicha unikallik buziladi.

**Rad etilған muqobil B — inaktivini o'chirib qayta yaratish (delete+recreate):** audit
uzilishi (yangi `id`, tarix yo'qoladi), foydasiz. Rad etildi.

## 3. Spec — xulq + edge case'lar + test case'lar

### Xulq
Dublikat qidiruvida topilgan `existing` uchun:
- `existing.isActive === true` → `{ ok:true, alreadyExists:true, reactivated:false, tempPassword:null }`
  (joriy xulq — o'zgarmaydi).
- `existing.isActive === false` → UPDATE `isActive=true, validTo=null, updatedAt=now` →
  `{ ok:true, alreadyExists:false, reactivated:true, tempPassword:null }` + audit
  `user.reactivated`.
- Topilmasa → yangi assignment INSERT (joriy `else`, o'zgarmaydi;
  `alreadyExists:false, reactivated:false`).

### Edge case'lar
- **Inaktiv + o'tган `validTo`:** reaktivatsiya `validTo=null` qiladi → `switchWorkspace`
  o'tadi (ASOSIY qabul testi). `getWorkspaces` va `switchWorkspace` ikkalasi ham ko'radi.
- **Boshqa rol bilan qayta-taklif:** mos qator topilmaydi (roleId har xil) → yangi
  assignment (to'g'ri; qonuniy ko'p-rol holati).
- **Yangi user (invite ichida yaratilган):** yangi user hech qanday assignment yo'q →
  `existing` topilmaydi → yangi INSERT. Reaktivatsiya yo'lига kirmaydi.
- **User `users` jadvalida bor, lekin bu tenantда umuman assignment yo'q:** yangi INSERT.

### Test case'lar (integration — `ctx()` pattern)
1. **Reaktivatsiya + login:** aktiv assignment yaratib deaktivlaymiz
   (`isActive=false`, `validTo` o'tмишда) → `invite(same phone, same role, same branch)`
   → javob `reactivated:true, alreadyExists:false` → DB'da `isActive=true, validTo=null`.
2. **`switchWorkspace` o'tadi:** #1'dan keyin shu user `switchWorkspace(tenant, branch)`
   → `ok:true` (validTo tozalanган uchun login ishlaydi) — ASOSIY qabul testi.
3. **Haqiqatan aktiv → alreadyExists:** aktiv assignment mavjud → `invite(same)` →
   `alreadyExists:true, reactivated:false`, `isActive` hali true, o'zgarish yo'q.
4. **Boshqa rol → yangi assignment:** inaktiv assignment role A, `invite(role B)` →
   `reactivated:false, alreadyExists:false`, yangi qator (role A inaktiv qoladi).
5. **Audit:** reaktivatsiyada `user.reactivated` yoziladi.

### Response DTO (`users.schema.ts:102-110`)
`inviteUserResponseDtoSchema`ga `reactivated: z.boolean()` qo'shiladi. Service qaytar
turlari (`invite` ning uch `return` shohobchasi) `reactivated` maydonini oladi.

### i18n (`UsersSettingsScreen`)
Yangi kalit `users.reactivated_title` / `users.reactivated_message` (uz+ru).
`UsersSettingsScreen` invite `onSuccess`da: `data.reactivated` → yashil "xodim qayta
faollashtirildi, u endi kira oladi" notifikatsiyasi (mavjud `alreadyExists` ko'k-info'дан
farqli). Mavjud `already_exists_message` faqat haqiqatan aktiv holат uchun qoladi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `apps/api/tests/integration/cli-427-reinvite-reactivate.test.ts` —
   test #1-5. `cd apps/api && bun test --env-file=../../.env cli-427` → RED
   (#1 hozir `alreadyExists:true`, `isActive` hali false).
2. **Impl service (`users.service.ts:107-129`):**
   - `existing` topilганда: `if (existing.isActive) return {...alreadyExists:true, reactivated:false}`.
   - `else` (inaktiv): `tx.update(userAssignments).set({isActive:true, validTo:null, updatedAt:now}).where(id=existing.id)`
     → audit `user.reactivated` → `return {...alreadyExists:false, reactivated:true}`.
   - Yangi INSERT yo'li: `reactivated:false` qo'shiladi.
   → GREEN.
3. **Schema:** `inviteUserResponseDtoSchema` + `reactivated`. api-client regen
   (`generate:openapi` + `generate:api-client`).
4. **i18n:** `users.reactivated_title`/`reactivated_message` (uz+ru).
5. **Web:** `UsersSettingsScreen` invite `onSuccess` — `reactivated` shohobchasi.
6. **Verify:** `bun test` yashil; typecheck; web build.

## 5. Migratsiya / rollout / xavflar
- DB migratsiya **kerak emas** (mavjud ustunlar: `isActive`, `validTo`).
- **Xavf: past.** Reaktivatsiya faqat aynan mos inaktiv assignment uchun — kutilmagan
  eskalatsiya yo'q (rol o'zgarmaydi). `validTo=null` — atayin (cheklovsiz muddat qayta
  ishга olishда normal).
- api-client generated `InviteUserResponse`ga yangi `reactivated` maydoni qo'shiladi
  (qo'shimcha, breaking emas).
- Eski inaktiv assignmentlar (tarixiy) o'z-o'zidan o'zgarmaydi — faqat qayta-taklif
  qilinganда reaktivlashadi.

## 6. Qabul mezonlari
- [ ] Deaktivlanган (o'tган `validTo` bilan ham) xodimni qayta-taklif → `isActive=true`,
      `validTo=null`, javob `reactivated:true`.
- [ ] Reaktivatsiyadan keyin `switchWorkspace` `ok:true` — login ishlaydi.
- [ ] Haqiqatan aktiv assignment → `alreadyExists:true, reactivated:false`, o'zgarishsiz.
- [ ] Boshqa rol bilan qayta-taklif → yangi assignment (reaktivatsiya EMAS).
- [ ] `user.reactivated` audit yoziladi.
- [ ] UI reaktivatsiyada aniq (alreadyExists'дан farqli) xabar ko'rsatadi.
- [ ] `bun test` + typecheck + web build yashil.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/users/users.service.ts` — `invite` reaktivatsiya shohobchasi.
- `apps/api/src/modules/users/users.schema.ts` — `inviteUserResponseDtoSchema` + `reactivated`.
- `apps/api/tests/integration/cli-427-reinvite-reactivate.test.ts` — YANGI.
- `packages/api-client/*` — regen (avtomatik).
- `apps/web/src/features/settings/components/UsersSettingsScreen.tsx` — `reactivated` shohobchasi.
- `packages/i18n/src/locales/uz.json` + `ru.json` — `users.reactivated_*`.
