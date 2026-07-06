# CLI-420 — Vertical almashtirishda stale `useVertical` (gated tab'lar 403)

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgarishisiz). Manba: `AUDIT-2026-07-06.md` §M7, `scratchpad/audit-02-clinical.md` (birinchi topilma). Prioritet: MEDIUM (frontend UX + noto'g'ri 403).

---

## 1. Muammo

Admin klinika verticalini almashtirganda (masalan `dental → general`), sidebar / CommandPalette / PatientCard tab'lari eski vertical bo'yicha ko'rinishda qoladi va bosilganda `403 feature.disabled` qaytaradi. To'liq sahifa reload'igacha holat tuzalmaydi.

**Ildiz sabab.** Frontend'da ikkita ALOHIDA query-key mavjud:

- `settingsKeys.tenantSettings()` → `['tenant-settings']` (`settings.keys.ts:10`)
- `settingsKeys.tenantVertical()` → `['tenant-vertical']` (`settings.keys.ts:11`)

Vertical UI-gating `useVertical()` orqali o'qiladi, u esa `useTenantVertical()` → `settingsKeys.tenantVertical()` (`['tenant-vertical']`) key'idan keladi (`settings.api.ts:211-222`). Bu ataylab alohida yengil, permission'siz endpoint (`GET /tenant-settings/vertical`) — HAR rol chaqira olishi uchun (CLI-80 / CLI-153 takrori, `settings.api.ts:206-210` izohi).

Lekin verticalni yozadigan mutation:

```ts
// apps/web/src/features/settings/settings.api.ts:224-231
export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTenantSettingsBody) =>
      updateTenantSettings(body).then((res) => res.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenantSettings() }),
  });
}
```

`onSuccess` FAQAT `settingsKeys.tenantSettings()` (`['tenant-settings']`) ni invalidate qiladi. `['tenant-vertical']` hech qачон invalidate bo'lmaydi → `useVertical()` `staleTime` tugagунча (yoki reload'gача) eski qiymatni qaytaradi.

**Ta'sir.** `dental → general` dan keyin Odontogram/Lab tab'lari ko'rinib qoladi va 403 beradi; teskari yo'nalishda (`general → dental`) yangi yoqilgan feature'lar reload'gача yashirin qoladi.

---

## 2. Dizayn qarori

**Qaror:** `useUpdateTenantSettings().onSuccess` ikkala key'ni ham invalidate qilsin — `tenantSettings()` VA `tenantVertical()`.

Sabablar:
- Vertical `tenant_settings` yozuvining bir maydoni; uni o'zgartiruvchi yagona mutation shu. Ikkala derivatsiyani (to'liq settings + yengil vertical) bitta manba yangilagani uchun ikkalasini ham invalidate qilish to'g'ri.
- CLAUDE.md §Frontend "TanStack query-key invalidation" konvensiyasiga mos: mutation o'zgartirgan har bir bog'liq key invalidate qilinadi.
- Alternativa (ikkala key'ni bitta key'ga birlashtirish) rad etildi — ular ataylab ajratilgan: `tenantSettings` `tenant_settings.view` permission talab qiladi, `tenantVertical` permission'siz. Birlashtirish CLI-80/CLI-153 regressiyasini qайtaradi.

Bu 30s `staleTime`ga tayanmaydi — invalidate darhol refetch trigger qiladi, shuning uchun sidebar/tab'lar reload'siz yangilanadi.

---

## 3. Spec + test case'lar

**Xulq-atvor spetsifikatsiyasi:**
- `useUpdateTenantSettings` muvaffaqiyatli bo'lganda `['tenant-settings']` VA `['tenant-vertical']` query'lari invalidate bo'lishi shart.
- Vertical `dental → general` o'zgargach, `useVertical()` reload'siz yangi qiymatni (`general`) qaytarishi kerak → gated tab'lar (Odontogram/Lab) yo'qoladi.
- Boshqa mavjud `onSuccess` xulqi (`tenantSettings` invalidatsiyasi) saqlanadi.

**Test case'lar** (`settings.api.test.ts` yoki mavjud settings test faylida):
1. **T1 (asosiy):** `useUpdateTenantSettings` mutation `mutate`-lansa, `queryClient.invalidateQueries` `['tenant-vertical']` bilan chaqirilishi kerak (spy/mock orqali). — HOZIR QIZIL.
2. **T2 (regressiya):** o'sha mutation `['tenant-settings']` ni ham invalidate qilishда davom etadi. — YASHIL bo'lib qolishi kerak.
3. **T3 (integratsiya, ixtiyoriy):** `QueryClientProvider` ostida `useVertical()` + `useUpdateTenantSettings()`ni render qilib, vertical `general`ga mutate qilingach `useVertical()` `'general'` qaytarishini kutish (MSW yoki mock `getTenantVertical`).

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing test yozish** — `settings.api` test faylida T1 (`invalidateQueries` `['tenant-vertical']` bilan chaqirilishini kutuvchi). Ishga tushirib QIZIL ekanini tasdiqlash (`turbo test --filter @dental/web` yoki web vitest).
2. **Implementatsiya** — `settings.api.ts:229` `onSuccess`ni ikkala key'ni invalidate qiladigan qilib o'zgartirish:
   ```ts
   onSuccess: () => {
     qc.invalidateQueries({ queryKey: settingsKeys.tenantSettings() });
     qc.invalidateQueries({ queryKey: settingsKeys.tenantVertical() });
   },
   ```
3. **Yashil** — T1/T2/T3 o'tishini tasdiqlash.
4. **Typecheck** — `turbo typecheck --filter @dental/web` toza.
5. **Qo'lda verify** — dev muhitda vertical `dental → general` almashtirib, reload'siz sidebar/PatientCard tab'lari yangilanishini ko'rish (Odontogram/Lab yo'qoladi).
6. **Commit** — `fix(web): vertical almashtirishda useVertical stale qolardi — tenantVertical() ham invalidate`.

---

## 5. Migratsiya / xavflar

- **Migratsiya yo'q** — DB / schema o'zgarmaydi, faqat frontend invalidatsiya.
- **Xavf: past.** Yagona qo'shimcha — bitta ekstra `invalidateQueries` (bitta yengil `GET /tenant-settings/vertical` refetch). Verticalni faqat admin va kam almashtiradi.
- Backend o'zgarmaydi; endpoint mavjud (`getTenantVertical`).

---

## 6. Qabul mezonlari

- [ ] `useUpdateTenantSettings.onSuccess` `['tenant-vertical']` ni invalidate qiladi (test bilan qamrangan).
- [ ] `['tenant-settings']` invalidatsiyasi saqlanadi (regressiya testi yashil).
- [ ] Vertical `dental → general` almashtirilгач, to'liq reload'siz Odontogram/Lab tab'lari sidebar/PatientCard/CommandPalette'dan yo'qoladi va 403 bermaydi.
- [ ] `general → dental`da yangi feature'lar reload'siz paydo bo'ladi.
- [ ] Typecheck + web test suite toza.

---

## 7. Ta'sirlangan fayllar

- `apps/web/src/features/settings/settings.api.ts` (`useUpdateTenantSettings`, ~224-231) — YAGONA kod o'zgarishi.
- `apps/web/src/features/settings/settings.keys.ts` (o'qish uchun; `tenantVertical()` allaqachon mavjud, o'zgarmaydi).
- `apps/web/src/features/settings/*.test.ts` (yangi/yangilangan test).
