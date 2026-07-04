# CLI-373 — select-workspace sahifasidagi hardcoded "Owner" bejcha (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-373 (Medium)
> **Scope:** `apps/web/src/features/auth/pages/select-workspace.page.tsx:149` + `packages/i18n/src/locales/uz.json` + `packages/i18n/src/locales/ru.json`

---

## 1. Goal

`SelectWorkspacePage` (`apps/web/src/features/auth/pages/select-workspace.page.tsx`) sahifasidagi har bir matn `t()` orqali o'tadi (`title`, `no_workspaces`, `all_branches`, `session_expired_title`, `session_expired_message`, `switch_failed`) — bittadan tashqari: qator 149dagi owner-bejcha `t()`ni chetlab o'tib, literal inglizcha `"Owner"` matnini chiqaradi:

```tsx
{opt.isOwner && <Badge color="teal">Owner</Badge>}
```

Bu loyihaning CLAUDE.md §3.9/§5 (i18n) va §7 ("UI da hardcoded uz/ru matn — har doim `t('keyword')`") qoidasini buzadi — ru interfeys tanlagan foydalanuvchi ham "Owner" ko'radi. Maqsad: shu bitta literalni mavjud `t()` naqshiga mos qilib almashtirish, uz/ru tarjima qo'shib.

## 2. Topilgan holat (kod o'qish natijasi)

- **`select-workspace.page.tsx`** — barcha matn kaliti `auth.select_workspace.*` namespace'da (`title`, `no_workspaces`, `all_branches`, `session_expired_title`, `session_expired_message`, `switch_failed`). Qator 149 — yagona istisno.
- **`packages/i18n/src/locales/uz.json:129-136`** va **`ru.json:129-136`** — `auth.select_workspace` bloki mavjud, 6 ta kalit bilan:
  ```json
  "select_workspace": {
    "title": "Workspace tanlash",
    "no_workspaces": "Sizda hech qanday klinika yo'q. Birinchi qadam — klinikani ro'yxatdan o'tkazing.",
    "all_branches": "Barcha filiallar",
    "session_expired_title": "Sessiya muddati tugadi",
    "session_expired_message": "Iltimos, qayta login qiling. Eski refresh token endi yaroqsiz.",
    "switch_failed": "Workspace almashtirib bo'lmadi"
  },
  ```
- **Mavjud "owner" tarjima konvensiyasi** — loyihada "Owner" so'zi hech qachon inglizcha qoldirilmagan, quyidagi mavjud kalitlar bor (`uz.json`/`ru.json`, settings/dashboard namespace'lari):
  - `owner_full_name`: "Egasining to'liq ismi" / "ФИО владельца" (registratsiya formasi)
  - `owner_desc`: "Klinika egasi — barcha ruxsatlarga ega" / "Владелец клиники — все права" (dashboard, joriy foydalanuvchi rol tavsifi)
  - `transfer_ownership`: "Egalikni o'tkazish" / "Передать владение"
  - `transfer_new_owner`: "Yangi egasi (xodim)" / "Новый владелец (сотрудник)"
  - Qisqa status-so'z uslubi uchun yaqin precedent: `role_staff`: `"Xodim"` (bitta so'zli rol-yorlig'i, xuddi shu dashboard namespace'da) — bejcha ham xuddi shunday bitta-so'zli qisqa forma bo'lishi kerak, "Klinika egasi — barcha ruxsatlarga ega" kabi to'liq gap emas.
  - **Xulosa:** loyihada "owner" doim **"egasi"** ildizi bilan tarjima qilingan (uz) va **"владелец"** (ru). Bejcha uchun eng qisqa, mos forma — **"Egasi"** (uz) / **"Владелец"** (ru) — `role_staff: "Xodim"` bilan bir xil uslub (mustaqil ot, bir so'z).

## 3. Approach

**Yangi kalit:** `auth.select_workspace.owner_badge`, mavjud `select_workspace` blokiga qo'shiladi (`all_branches`dan keyin — ikkalasi ham option-card'ning shu qatorida ko'rinadigan matn).

**uz.json qiymati:** `"Egasi"`
**ru.json qiymati:** `"Владелец"`

**Kod o'zgarishi** (`select-workspace.page.tsx:149`):
```tsx
{opt.isOwner && <Badge color="teal">{t('auth.select_workspace.owner_badge')}</Badge>}
```
Boshqa hech narsa o'zgarmaydi — `Badge` komponenti, `color="teal"`, joylashuv barchasi bir xil qoladi; faqat children `t()` chaqiruviga almashadi.

## 4. Ko'lamdan tashqari (qasddan qoldirilgan, ticket qamrovi emas)

Kod o'qishda **yana bitta** hardcoded `'Owner'` topildi — `collectOptions()` funksiyasi (`select-workspace.page.tsx:196`), owner-tenant assignments'da yo'q bo'lgan hollarda `roleName: 'Owner'` deb literal string beradi, keyin bu `{opt.roleName}` orqali qator 146da to'g'ridan-to'g'ri render qilinadi (`{opt.branchName ?? t(...)} · {opt.roleName}`). Bu ham hardcoded inglizcha matn, lekin **CLI-373 ticket qamrovida emas** (ticket faqat qator 149dagi Badge'ni ko'rsatadi, DoD ham shunga ishora qiladi). Alohida ticket sifatida qayd etish tavsiya qilinadi — bu spec/plan uni tuzatmaydi.

## 5. DoD (ticketdan)

- [ ] `apps/web/src/features/auth/pages/select-workspace.page.tsx:149` — `<Badge color="teal">Owner</Badge>` → `<Badge color="teal">{t('auth.select_workspace.owner_badge')}</Badge>`.
- [ ] `packages/i18n/src/locales/uz.json` — `auth.select_workspace.owner_badge` = `"Egasi"`.
- [ ] `packages/i18n/src/locales/ru.json` — `auth.select_workspace.owner_badge` = `"Владелец"`.
- [ ] Yangi/yangilangan test — `opt.isOwner === true` bo'lganda bejcha matni literal `"Owner"` EMAS, `t()`dan kelgan qiymat (`"Egasi"`, default uz locale) ekanini isbotlaydi.
- [ ] `bun run typecheck` (yoki loyihaning umumiy typecheck skripti) toza.
