# CLI-428 — Branch soft-delete referensial guard yo'q; `switchWorkspace` o'chirilgan branchга kiradi

> Audit: `AUDIT-2026-07-06.md` §M15. READ-ONLY spec — kod o'zgarmaydi, faqat reja.

## 1. Muammo va ildiz sabab (file:line)

**(a) Guard yo'q — `branches.service.ts:74-95` (`remove`):**

```ts
async function remove(c, id) {
  const before = await findById(c, id);
  if (!before) return null;
  const [updated] = await db.update(branches).set({ deletedAt: new Date() })...
}
```

Soft-delete hech qanday referensial tekshiruvsiz. O'chirilgan branchda faol xodim
assignmentlari (`user_assignments.branchId = id, isActive = true`) va kelajakdagi
appointmentlar (`appointments.branchId = id, startTime > now`, aktiv status) osilgan qoladi.

**(b) `switchWorkspace` `deletedAt` tekshirmaydi — `auth.service.ts:478-487`:**

```ts
if (input.branchId) {
  const [branch] = await tx.select({ tenantId: branches.tenantId }).from(branches)
    .where(eq(branches.id, input.branchId));      // ← isNull(deletedAt) YO'Q
  if (!branch || branch.tenantId !== input.tenantId) {
    return { code: 'auth.invalid_branch' };
  }
}
```

Bu blok owner VA non-owner uchun ham ishlaydi (defense-in-depth chokepoint). O'chirilган
branch hali `tenantId` mos → o'tadi. Natijada stale UI yoki saqlangan workspace o'chirilган
branch uchun to'liq JWT (active_branch_id) oladi.

**Nega aynan 479-blok fix nuqtasi (advisor):** non-owner assignment yo'li (456-476)
`user_assignments`ни `isActive`/`validTo` bo'yicha tekshiradi, lekin assignment'ning O'ZI
o'chirilган branchга ishora qilishi mumkin (assignment aktiv, branch o'chirilган). Owner yo'li
esa assignment umuman tekshirmaydi. Ikkала holатда ham 479-483 dagi branch SELECT — yagona
umumiy nuqta. Shu SELECTга `isNull(branches.deletedAt)` qo'shish ikkала yo'lni ham yopadi.
(`workspaceBranches` — dropdown manbai — allaqachon `isNull(deletedAt)` filtrlaydi,
`auth.service.ts:386,412`, shuning uchun UI odatда ko'rsatmaydi; lekin stale/saqlangan
`branchId` bilan to'g'ridan-to'g'ri chaqiruv chetlab o'tadi.)

Tasdiqlangan ustunlar: `appointments.branch_id` + `appointments.start_time` +
`appointment_status` enum (`scheduled|confirmed|in_progress|completed|no_show|cancelled`)
mavjud (`packages/db-schema/src/tables/appointments.ts:29,40,8-15`);
`user_assignments.branchId`/`isActive` mavjud; `branches.deletedAt` mavjud
(`packages/db-schema/src/tables/branches.ts:22`).

## 2. Dizayn qarori

**(a) Branch delete — BLOK (cascade emas):** faol qaramliklar bo'lsa o'chirishни RAD
etib, aniq kod qaytarish (`branch.has_dependencies`, HTTP 409). Qaramliklar:
1. Faol xodim assignmentlari: `user_assignments` `branchId=id, isActive=true`.
2. Kelajakdagi appointmentlar: `appointments` `branchId=id, startTime > now`,
   status ∈ `{scheduled, confirmed, in_progress}` (cancelled/completed/no_show — o'tган ish,
   bloklamaydi).

**Nega blok, cascade emas:** cascade (assignmentlarni deaktivlash + appointmentlarni bekor
qilish) qaytarib bo'lmaydigan yon ta'sirlar — xodimlar jim ishsiz qoladi, bemorlar bekor
qilinган yozilishдан bexabar. Blok qaytariladigan va aniq: admin avval xodimlarни ko'chiradi
/ yozilishlarни boshqa branchga o'tkazadi, keyin o'chiradi. Xavfsizroq va odam nazoratига mos.

**(b) `switchWorkspace` — 479-483 branch SELECTга `isNull(branches.deletedAt)` qo'shish.**
O'chirilган branch → `branch` topilmaydi → `auth.invalid_branch` (mavjud kod, yangi kod
kerak emas).

**Rad etilган muqobil (a) — cascade-deactivate:** o'chirishда assignmentlar `isActive=false`,
appointmentlar `cancelled`. Rad etildi: jim ma'lumot yo'qolishi, bekor qilinган yozilishlar
haqида bemor bexabar, qaytarib bo'lmaydi. Blok — least-surprise.

**Rad etilган muqobil (b) — assignment yo'liда (456-476) branch join qilish:** faqat
non-owner yo'lini yopadi, owner yo'li ochiq qoladi. 479-blok umumiy — to'g'ri chokepoint.

## 3. Spec — xulq + edge case'lar + test case'lar

### Xulq
- `remove(c, id)`:
  - `findById` null (yo'q yoki allaqachon o'chirilган) → `null` (mavjud, 404).
  - Faol assignment YOKI kelajak-aktiv appointment mavjud → `{ ok:false, code:'branch.has_dependencies' }`,
    route 409 qaytaradi.
  - Aks holда → soft-delete (mavjud xulq) + audit.
- `switchWorkspace`: `input.branchId` o'chirilган branch → `auth.invalid_branch` (RAD).

### Edge case'lar
- `input.branchId` yo'q ("Barcha filiallar", branchId=null): branch tekshiruvi o'tkazilmaydi
  (mavjud `if (input.branchId)`), o'zgarmaydi.
- Deaktivlanган assignmentli branch (isActive=false) — bloklamaydi (faqat faol).
- O'tган / bekor qilinган appointmentlar — bloklamaydi.
- `remove` idempotent: allaqачон o'chirilган branch → `findById` null → 404 (o'zgarmaydi).
- Owner o'chirilган branchга switch — endi 479-filtr RAD qiladi (avval o'tardi).

### Test case'lar (integration — `ctx()` pattern)
1. **Faol xodimли branch o'chirilmaydi:** branch + `user_assignments(branchId, isActive=true)`
   → `remove` → `{ok:false, code:'branch.has_dependencies'}`, branch `deletedAt` null.
2. **Kelajak appointmentли branch o'chirilmaydi:** branch + `appointments(startTime=+1kun, status='scheduled')`
   → `remove` → `has_dependencies`.
3. **Toza branch o'chiriladi:** qaramliksiz branch → `remove` → `deletedAt` set + audit.
4. **O'tган appointment bloklamaydi:** `appointments(startTime=-1kun, status='completed')` →
   `remove` muvaffaqiyat.
5. **`switchWorkspace` o'chirilган branchни RAD qiladi:** branch soft-deleted →
   `switchWorkspace({tenant, branchId: deleted})` → `{ok:false, code:'auth.invalid_branch'}`
   (owner va non-owner ikkала yo'l uchun) — ASOSIY qabul testi.
6. **`switchWorkspace` tirik branchга o'tadi:** regress — deletedAt=null → `ok:true`.

### Repository / service
Yangi repository/service helper (yoki `remove` ichида inline count):
- `countActiveAssignments(c, branchId)`: `user_assignments` `branchId=id AND isActive=true`.
- `countFutureAppointments(c, branchId)`: `appointments` `branchId=id AND startTime > now
  AND status IN ('scheduled','confirmed','in_progress')`.
RLS tenant'ni filtrlaydi (ikkала jadval tenant-scoped) — explicit `tenantId` WHERE yozilmaydi.

### Route (`branches.routes.ts:149-153`)
`remove` endi `{ok:false, code}` qaytarishi mumkin → deleteRoute handler:
`code === 'branch.has_dependencies'` → 409 `fail(code, code)`; `null` → 404; aks holда 200.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `apps/api/tests/integration/cli-428-branch-delete-switch.test.ts` —
   test #1-6. `cd apps/api && bun test --env-file=../../.env cli-428` → RED.
2. **Impl `branches.service.ts` `remove`:** `findById` dan keyin count'lar; qaramlik bo'lsa
   `{ok:false, code:'branch.has_dependencies'}`; aks holда mavjud soft-delete'ни
   `{ok:true, branch:updated}` shakliga o'rash (yoki route mos qaytarma turini kutadi).
   Return turini `union` qilib route'ni moslash. → #1-4 GREEN.
3. **Impl `auth.service.ts:479-483`:** branch SELECT `.where(and(eq(branches.id, input.branchId),
   isNull(branches.deletedAt)))`. → #5-6 GREEN.
4. **Route (`branches.routes.ts`):** deleteRoute 409 shohobchasi + `errorResponseSchema`
   409 response deklaratsiyasi.
5. **i18n (agar UI kod ko'rsatsa):** `branches.has_dependencies` xato xabari (uz+ru) —
   global MutationCache toast'да ko'rinadi; yoki `BranchesSettingsScreen`да aniq matn.
6. **Verify:** `bun test` yashil; typecheck; web build; RLS lint (`check:rls`) 35 toza.

## 5. Migratsiya / rollout / xavflar
- DB migratsiya **kerak emas** (barcha ustunlar mavjud).
- **Xavf: past-o'rta.** `remove` qaytarma turi `Branch | null` dan `{ok, ...}`ga o'zgaradi →
  route + har qanday chaqiruvchini moslash kerak (typecheck kafolat beradi). api-client
  `deleteBranch` response o'zgarmaydi (muvaffaqiyat 200 `{deleted:true, id}`), lekin yangi
  409 status qo'shiladi — frontend uni MutationCache orqali toast qiladi.
- **Rollout eslatma:** avvaldan qaramlikли branchlar mavjud bo'lsa endi o'chirilmaydi —
  bu atayin (integrity). Admin avval xodim/appointmentlarни ko'chiradi.
- **Deferred (out-of-scope):** branch-scoped **stock** (`stock_items.branchId`) qaramlik
  sifatida bloklovga KIRITILMAYDI (ombor tenant/branch aralash, #29/#31 — item branch=null
  bo'lishi mumkin). Kelajakda ko'rib chiqilsin; hozir faqat staff + future appointments.

## 6. Qabul mezonlari
- [ ] Faol xodimли yoki kelajak-aktiv appointmentли branch → `branch.has_dependencies` (409),
      `deletedAt` null qoladi.
- [ ] Qaramliksiz branch → soft-delete + audit (mavjud xulq).
- [ ] O'tган / bekor appointmentlar va inaktiv assignmentlar bloklamaydi.
- [ ] `switchWorkspace` o'chirilган branchга (owner va non-owner) → `auth.invalid_branch`.
- [ ] Tirik branchга switch — regress yashil.
- [ ] `bun test` + typecheck + `check:rls` + web build yashil.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/branches/branches.service.ts` — `remove` guard + count helper'lar.
- `apps/api/src/modules/branches/branches.routes.ts` — deleteRoute 409 shohobchasi.
- `apps/api/src/modules/auth/auth.service.ts` — `switchWorkspace` branch SELECTга `isNull(deletedAt)`.
- `apps/api/tests/integration/cli-428-branch-delete-switch.test.ts` — YANGI.
- `packages/i18n/src/locales/uz.json` + `ru.json` — `branches.has_dependencies` (agar UI matn kerak).
- Frontend: `BranchesSettingsScreen` — 409 xato UX (ixtiyoriy; global toast default).
