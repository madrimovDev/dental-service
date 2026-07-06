# CLI-441 — LOW-D: Ombor / xodim / workspace hardening

> Manba: `AUDIT-2026-07-06.md` §LOW. 5 sub-item. Har biri mustaqil, kichik.
> Tamoyil: RLS `getDb(c)`, audit `deps.audit.record`, worker RLS `withTenant()`.

---

## 1. Recall SMS tenant tx ichida yuboriladi (rollback → dublikat SMS; concurrent double-send)

**Muammo**
- `apps/api/src/lib/recall-worker.ts:106-161`: `deps.withTenant(row.tenantId, async (tx) => { ... })` bloki ichida `deps.sms.send(...)` (137) chaqiriladi, so'ng `recallLogs` insert + `recalls` update (139-156) shu **bir tranzaksiya**da. SMS provayderga real yuboriladi (yon ta'sir, orqaga qaytmaydi). Agar keyingi DB yozuvi/commit fail bo'lsa → tranzaksiya rollback → status `pending` qoladi → keyingi scan **yana SMS yuboradi** (dublikat). Bir vaqtda ikki worker bir recallni olsa — row-lock yo'q (faqat status re-check `select` 107-111, `FOR UPDATE` emas) → double-send.

**Fix yondashuvi**
- SMS yuborishni tranzaksiyadan **tashqariga** chiqarish: (a) tx ichida `recalls`ni `FOR UPDATE` bilan olib, `status`ni darhol `contacted` (yoki oraliq `sending`)ga o'tkazib commit qilish — "claim" bosqichi; (b) commitdan keyin SMS yuborish; (c) natijani alohida yozuv bilan log qilish (fail bo'lsa `failed` outcome). Bu — "commit-then-send" naqshi, dublikatni yo'qotadi.
- 107-111 `select`ni `.for('update')` bilan claim qilish — concurrent double-send guard.

**Qabul**
- DB yozuv fail bo'lsa ham bir recall uchun ko'pi bilan bitta SMS yuboriladi.
- Ikki worker parallel ishlaganda ayni recall bir marta claim qilinadi (row-lock).

---

## 2. Filial xodim soni odam emas, assignment sanaydi

**Muammo**
- `apps/web/src/features/settings/components/BranchesSettingsScreen.tsx:29-38` (`useMemo`): `assignments.data` bo'yicha har aktiv assignment uchun `+1`. Bir odam bitta filialda ikki rol (ikki assignment) bilan bo'lsa — ikki marta sanaladi. `137`-qatorda ustun shu son bilan ko'rsatiladi.
- `listAssignments` (`users.service.ts:27-48`) har `userId`ni qaytaradi (32-qator) — dedupe uchun ma'lumot bor.

**Fix yondashuvi**
- Sanashni `userId` bo'yicha unique qilish: har filial uchun `Set<userId>` yig'ib, `.size`ni olish. `allBranchesCount` ham branch-null odamlarning unique `userId` to'plami.
- `perBranch: Map<branchId, Set<userId>>`, keyin `137`-qatorda `(perBranch.get(b.id)?.size ?? 0) + allBranches.size`. Ikki-rol odam bir marta sanaladi.

**Qabul**
- Ikki rolli (ikki assignment) xodim filial sonida bir marta ko'rinadi.

---

## 3. `getWorkspaces` validTo-muddati o'tgan assignment'larni ko'rsatadi, `switchWorkspace` rad etadi

**Muammo**
- `auth.service.ts:335-350` (`getWorkspaces`): `where(and(eq(userId), eq(isActive, true)))` — `validTo` filtri **yo'q**. Muddati o'tgan (validTo < now) assignment ro'yxatda ko'rinadi.
- `switchWorkspace` esa muddatni majburlaydi (`auth.service.ts:470`: `or(isNull(validTo), gt(validTo, now))`). Natija: foydalanuvchi workspace ko'radi, tanlaganda rad etiladi (chalkash UX).

**Fix yondashuvi**
- `getWorkspaces` where'iga `switchWorkspace`dagi bilan bir xil shart qo'shish: `or(isNull(userAssignments.validTo), gt(userAssignments.validTo, now))` (`now = new Date()`; `gt` allaqachon shu faylda import qilingan — 123/400/470-qatorlar).

**Qabul**
- Muddati o'tgan assignment workspace ro'yxatida ko'rinmaydi — ro'yxat va `switchWorkspace` izchil.

---

## 4. `upsertProfile` a'zo bo'lmagan `userId`ni qabul qiladi

**Muammo**
- `users.service.ts:344-396` (`upsertProfile`): 348-349 izohi ham tan oladi — RLS faqat `activeTenantId`ni tekshiradi, `userId` aynan shu tenantga a'zo ekani tasdiqlanmaydi. Boshqa tenant/platform userining `staffProfiles` yozuvi joriy tenantda yaratilishi mumkin (maosh/komissiya bilan).

**Fix yondashuvi**
- `insert`dan (369) oldin `userAssignments`da (`tenantId = activeTenantId`, `userId`, `isActive = true`, validTo hali o'tmagan) aktiv assignment borligini tekshirish; yo'q bo'lsa xato (`user.not_member` / 404). RLS `getDb(c)` tenantni cheklaydi, faqat `userId` filtrini qo'shish kifoya.

**Qabul**
- Joriy tenantga aktiv assignmenti yo'q `userId` uchun profil yaratish/yangilash RAD qilinadi.

---

## 5. `listItems` branch filtri null-filial (tenant-bo'ylab) itemlarni yashiradi

**Muammo**
- `stock.service.ts:76` (`listItems`): `if (query.branchId) filters.push(eq(stockItems.branchId, query.branchId))`. `stockItems.branchId` **nullable** (`db-schema/src/tables/stock-items.ts:13`, `onDelete: 'set null'`) — `branchId IS NULL` = tenant-bo'ylab (barcha filialga tegishli) item. Filial bo'yicha filtrlaganda bu itemlar butunlay yo'qoladi.

**Fix yondashuvi**
- Filtrni kengaytirish: `branchId` berilganda `or(eq(stockItems.branchId, query.branchId), isNull(stockItems.branchId))` — o'sha filial + tenant-bo'ylab itemlar. `or`/`isNull` `drizzle-orm`dan import (fayl allaqachon `and`/`eq` ishlatadi).

**Qabul**
- Filial bo'yicha ro'yxatda o'sha filial itemlari + null-filial (tenant-bo'ylab) itemlar ko'rinadi.
