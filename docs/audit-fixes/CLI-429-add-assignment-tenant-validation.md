# CLI-429 — `addAssignment` roleId/branchId tenant'ga tegishliligini tekshirmaydi

> Audit: M16 (MEDIUM, 2 agent tasdiqladi). **Integrity** defekti (escalation downstream neytrallangan).

## 1. Muammo va ildiz sabab

`apps/api/src/modules/users/users.service.ts:161-192` — `addAssignment`:

```ts
async function addAssignment(c, userId, input) {
  const db = getDb(c);
  const tenantId = c.get('activeTenantId');
  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  const [assignment] = await db.insert(userAssignments).values({
    userId, tenantId,
    branchId: input.branchId ?? null,
    roleId: input.roleId,          // ← tekshirilmagan
    ...
  }).returning();
  ...
}
```

`input.roleId` va `input.branchId` **hech qanday tenant-scoped mavjudlik tekshiruvidan o'tmaydi**. Taqqoslash uchun `invite` (users.service.ts:63-72) buni to'g'ri qiladi:

```ts
const [role] = await dbContext.select().from(roles).where(eq(roles.id, input.roleId));
if (!role) return { ok: false, code: 'role.not_found' };
if (input.branchId) {
  const [branch] = await dbContext.select().from(branches).where(eq(branches.id, input.branchId));
  if (!branch) return { ok: false, code: 'branch.not_found' };
}
```

Bu tekshiruvlar `getDb(c)` (RLS-bound) orqali — RLS `roles`/`branches`ni joriy tenant bilan filtrlaydi, shuning uchun boshqa tenant / mavjud bo'lmagan ID `undefined` qaytaradi.

**Oqibat (integrity):** cross-tenant yoki tasodifiy leaked `roleId` bilan `userAssignments` qatori yaratiladi. `listAssignments` (users.service.ts:44-48) `innerJoin(roles, ...)` ostida ishlaydi — joriy tenantда bunday `roleId` yo'q → **assignment UI'dan ko'rinmay ketadi** ("ghost assignment"). Bir xil holat `branchId` uchun `leftJoin(branches)`. Ikkinchidan, `addAssignment` **dublikat-guard** yo'q (invite'da bor, 106-119) — bir xil (user, role, branch) juftligi qayta-qayta qo'shilishi mumkin.

> Escalation xavfi downstream **neytrallangan**: `buildPermissionsForContext` joriy tenant RLS ostida ishlaydi, cross-tenant `roleId` `role_permissions`ни bermaydi → foydalanuvchi qo'shimcha ruxsat olmaydi. Shu sababli bu **integrity** (ghost yozuv + dublikat), privilege-escalation emas.

**RLS mexanizmi (tasdiqlangan):** `users.routes.ts:47` `app.use('*', rlsMiddleware(deps.db))` — request-darajali RLS o'rnatilgan, shuning uchun `getDb(c)` `addAssignment` ichида to'g'ri tenant kontekstiga bog'langan (invite'dagi qo'lda `transaction()`+`set_config` shart emas).

## 2. Dizayn qarori

`invite`ning tenant-scoped RLS validatsiyasini `addAssignment`da **ayni takrorlash** — insertga qadar `roleId` (majburiy) va `branchId` (agar berilgan bo'lsa) `getDb(c)` orqali mavjudligini tekshirish. Qo'shimcha: `invite`dagi kabi **dublikat-assignment guard**.

Return-shakli: `addAssignment` hozir `assignment | null` qaytaradi (route `!row → 404 user.not_found`). Uni **diskriminatsiyalangan natijaga** kengaytiramiz, `invite` pattern'iga mos: `{ ok: false, code: 'role.not_found' | 'branch.not_found' } | { assignment } | null`. Route handler bu kodlarni HTTP statusga map qiladi.

Dublikat-guard shartnomasi: bir xil (userId, tenantId, roleId, branchId) mavjud bo'lsa — `invite` singari **mavjudni idempotent qaytarish** (`alreadyExists` semantikasi), yangi qator qo'shmaslik. (409 emas — invite bilan izchillik uchun; ammo bu qaror implementatsiyada ochiq, quyida 4-qadam ikki variantni ko'rsatadi.)

**Rad etilgan alternativalar:**
- *Faqat DB FK'ga tayanish* — audit ta'kidlaydi: FK RLS'ni chetlab o'tadi (cross-tenant UUID FK-valid bo'lishi mumkin, chunki `roles`/`branches` FK tenant'ni tekshirmaydi). Rad.
- *`deps.db` bilan tekshirish* — RLS-bypass admin conn; tenant izolyatsiyasini yo'qotadi. Tekshiruv **`getDb(c)`** bilan bo'lishi shart. Rad.

## 3. Spec — tuzatilgandan keyingi xulq

Xulq-shartnoma `POST /users/{userId}/assignments`:
- `roleId` joriy tenantда mavjud emas (RLS-filtered) → **400/404** `role.not_found`, insert yo'q.
- `branchId` berilgan va joriy tenantда mavjud emas → **400/404** `branch.not_found`, insert yo'q.
- `userId` mavjud emas → **404** `user.not_found` (mavjud xulq saqlanadi).
- Bir xil (user, role, branch) assignment allaqachon bor → **dublikat yaratilmaydi**; mavjud qator qaytariladi (idempotent, 201/200).
- Barchasi valid + yangi → **201**, assignment yaratiladi + audit `created`.

Edge cases:
- `branchId` `undefined` (tenant-level assignment) → branch tekshiruvi o'tkazib yuboriladi, roleId hali tekshiriladi.
- Cross-tenant `roleId` (boshqa tenant'da real) → RLS `undefined` → `role.not_found`.
- Valid roleId lekin dublikat → yangi qator yo'q.

Test holatlari (`bun test`, integratsiya — real DB, `cli-153`/`cli-157` idiomasi):
1. **Valid roleId+branchId** → 201, qator yaratiladi.
2. **Mavjud bo'lmagan/cross-tenant roleId** → `role.not_found` (400/404), `userAssignments`da yangi qator YO'Q.
3. **Mavjud bo'lmagan/cross-tenant branchId** (valid roleId bilan) → `branch.not_found`, qator yo'q.
4. **Dublikat (userId, roleId, branchId)** → ikkinchi chaqiruv yangi qator yaratmaydi (count o'zgarmaydi).
5. **Mavjud bo'lmagan userId** → 404 `user.not_found` (regresssiya yo'q).

## 4. Implementatsiya rejasi (TDD)

**1-qadam — failing test:** `apps/api/tests/integration/cli-429-add-assignment-validation.test.ts`. `cli-153-rbac-endpoints.test.ts` seed-idiomasini ishlat (tenant + role + branch + user yaratish). 2, 3, 4-holatlarni yoz — hozir 2/3 assignment yaratadi (ghost), 4 dublikat yaratadi → **FAIL**.
Verify: `cd apps/api && bun test --env-file=../../.env cli-429-add-assignment-validation` → RED.

**2-qadam — service impl:** `apps/api/src/modules/users/users.service.ts:161-192` `addAssignment`ni qayta yoz (`invite` pattern):
```ts
async function addAssignment(c, userId, input) {
  const db = getDb(c);
  const tenantId = c.get('activeTenantId');
  if (!tenantId) throw new Error('No tenant context');

  const [user] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  // Tenant-scoped mavjudlik (RLS filtrlaydi) — invite bilan bir xil
  const [role] = await db.select().from(roles).where(eq(roles.id, input.roleId));
  if (!role) return { ok: false as const, code: 'role.not_found' };
  if (input.branchId) {
    const [branch] = await db.select().from(branches).where(eq(branches.id, input.branchId));
    if (!branch) return { ok: false as const, code: 'branch.not_found' };
  }

  // Dublikat-guard (invite bilan bir xil)
  const [existing] = await db.select().from(userAssignments).where(
    and(
      eq(userAssignments.userId, userId),
      eq(userAssignments.tenantId, tenantId),
      eq(userAssignments.roleId, input.roleId),
      input.branchId
        ? eq(userAssignments.branchId, input.branchId)
        : sql`${userAssignments.branchId} IS NULL`,
    ),
  );
  if (existing) return { ok: true as const, assignment: existing, alreadyExists: true };

  const [assignment] = await db.insert(userAssignments).values({ ... }).returning();
  if (!assignment) return { ok: false as const, code: 'assignment.create_failed' };
  await deps.audit.record(c, { action: 'created', ... });
  return { ok: true as const, assignment, alreadyExists: false };
}
```
(Return-tipni diskriminatsiyalangan qil; `null`ни faqat `user.not_found` uchun qoldirish yoki uni ham `{ok:false, code:'user.not_found'}`ga o'tkazish — route bilan mos qil.)
Verify: `bun run --filter @dental/api typecheck`.

**3-qadam — route handler map:** `apps/api/src/modules/users/users.routes.ts:152-158` `addAssignmentRoute` handler:
```ts
const result = await service.addAssignment(c, userId, body);
if (result === null) return c.json(fail('user.not_found', 'User not found'), 404);
if (!result.ok) {
  if (result.code === 'role.not_found') return c.json(fail('role.not_found', 'Role not found'), 404);
  if (result.code === 'branch.not_found') return c.json(fail('branch.not_found', 'Branch not found'), 404);
  return c.json(fail(result.code, 'Assignment failed'), 400);
}
return c.json(ok(toUserAssignmentRowDto(result.assignment)), 201);
```
`createRoute` responses'ga 404 `role`/`branch` allaqachon `userNotFoundResponse` + 400/404 declared (mavjud 400/404 responses yetadi; kerak bo'lsa description yangila).
Verify: `bun test --env-file=../../.env cli-429-add-assignment-validation` → GREEN.

**4-qadam — verify:** `cd apps/api && bun test --env-file=../../.env cli-429-add-assignment-validation` + `bun run --filter @dental/api typecheck`. Mavjud users route/regresssiya testlarini ham yugurt.

> DB/schema/migratsiya yo'q — faqat runtime validatsiya.

## 5. Migratsiya / rollout / xavflar

- **DB migratsiya:** yo'q. (Mavjud ghost assignment'lar backfill/tozalash — ixtiyoriy alohida ticket; ular RLS ostида ko'rinmaydi va zararsiz, escalation bermaydi.)
- **Backwards-compat:** valid chaqiruvlar 201'da davom etadi. Endi faqat invalid (cross-tenant/ghost) chaqiruvlar 400/404. Dublikat chaqiruv endi idempotent (avval jim qo'shar edi) — API iste'molchisi (settings UI) uchun yaxshi.
- **RLS:** tekshiruvlar `getDb(c)` (RLS-bound) orqali — tenant izolyatsiyasi saqlanadi. `users.routes.ts:47` request-RLS tasdiqlangan.
- **Xavf:** past — qattiqlashtirish. Yagona e'tibor: route handler diskriminatsiyalangan return'ni to'g'ri map qilishi (aks holda 500). Test qamrab oladi.

## 6. Qabul mezonlari

- [ ] Cross-tenant/mavjud bo'lmagan `roleId` → `role.not_found`, `userAssignments`ga insert YO'Q.
- [ ] Cross-tenant/mavjud bo'lmagan `branchId` → `branch.not_found`, insert yo'q.
- [ ] Dublikat (user, role, branch) → yangi qator yaratilmaydi (idempotent).
- [ ] Valid yangi → 201 + audit `created`.
- [ ] Mavjud bo'lmagan userId → 404 `user.not_found` (regresssiya yo'q).
- [ ] Tekshiruvlar `getDb(c)` (RLS) orqali, `deps.db` emas.
- [ ] Route handler `role.not_found`/`branch.not_found`ni HTTP statusga map qiladi.
- [ ] Typecheck + integratsiya testlari toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/users/users.service.ts` — `addAssignment` validatsiya + dublikat-guard + return-shakl.
- `apps/api/src/modules/users/users.routes.ts` — `addAssignmentRoute` handler xato-mapping (152-158).
- `apps/api/tests/integration/cli-429-add-assignment-validation.test.ts` — **yangi**.
