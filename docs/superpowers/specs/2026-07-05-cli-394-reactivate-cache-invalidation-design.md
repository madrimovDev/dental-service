# CLI-394 — Reactivate mutation cache invalidatsiyasi (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-394 (Low)
> **Scope:** `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` — faqat `reactivate` mutation'ning `onSuccess` handleri.

---

## ⚠️ Ketma-ketlik konstraint (MUHIM)

Ushbu spec **CLI-391 allaqachon qo'llanilgan** deb faraz qiladi. CLI-391 (`docs/superpowers/specs/2026-07-05-cli-391-reactivate-fingerprint-ux-design.md` + `docs/superpowers/plans/2026-07-05-cli-391-reactivate-fingerprint-ux.md`) `reactivate` mutation'ning `mutationFn` tanasini butunlay qayta yozadi (`prompt()` olib tashlanadi, saqlangan `data.license.fingerprint` to'g'ridan-to'g'ri ishlatiladi) va shu mutation blokini o'rab turgan JSX'ga (`Text` qatori + `Button disabled`) o'zgarish kiritadi. Ikkala ticket ham bitta mutation blokiga tegishli bo'lgani uchun, CLI-391'ning o'z speci §3'da aniq belgilagan: **CLI-391 birinchi, CLI-394 ikkinchi qo'llanilishi shart** — teskari tartibda qo'llash merge-conflict/bir-birini bekor qilish xavfini tug'diradi.

Shu sababli bu hujjatdagi barcha "hozirgi holat" (before) kod namunalari — **CLI-391 qo'llanilgandan KEYINGI** holat, ya'ni CLI-391 plani (`docs/superpowers/plans/2026-07-05-cli-391-reactivate-fingerprint-ux.md`, Task 1 Step 3)dagi implementatsiya natijasi. Bu spec hech qachon joriy (pre-CLI-391) `prompt()`-based koddan foydalanmaydi.

## 1. Muammo

`ClinicDetailPage.tsx`da 3 ta mutation bor: `updateModules`, `reactivate`, `deactivate`. `updateModules` va `deactivate`'ning `onSuccess` handleri ikkalasi ham muvaffaqiyatdan keyin `qc.invalidateQueries({ queryKey: ['clinic', id] })` chaqiradi — bu server holatini (masalan, `isActive`, `fingerprint`, modul ro'yxati) qayta so'rab, UI'ni yangilaydi. `reactivate`'ning `onSuccess` handleri esa (CLI-391dan keyin ham) faqat `setMutationError(null)` chaqiradi — cache invalidatsiya qilinmaydi. Natijada admin "Reactivate" tugmasini bosgandan keyin ekran eski (`isActive: false`, "Bekor qilingan") holatni ko'rsatishda davom etadi, sahifani qo'lda yangilamaguncha (yoki boshqa mutation orqali tasodifan invalidatsiya bo'lmaguncha).

## 2. Yondashuv

CLI-391dan keyingi `reactivate` mutation shakli (referens: yuqoridagi CLI-391 plani, Task 1 Step 3):

```tsx
const reactivate = useMutation({
  mutationFn: async () => {
    if (!data?.license?.fingerprint) return;
    const res = await authFetch('/v1/reactivate', {
      method: 'POST',
      body: JSON.stringify({
        licenseKey: data.license.licenseKey,
        fingerprint: data.license.fingerprint,
      }),
    });
    if (!res.ok) throw new Error("Litsenziyani qayta faollashtirib bo'lmadi");
  },
  onSuccess: () => setMutationError(null),
  onError: (err) => {
    setMutationError(
      err instanceof Error ? err.message : "Litsenziyani qayta faollashtirib bo'lmadi",
    );
  },
});
```

`onSuccess`ni `deactivate`'dagi (joriy fayl, 86-89-qatorlar) va `updateModules`'dagi (joriy fayl, 46-49-qatorlar) bir xil naqshga moslashtiramiz:

```tsx
onSuccess: () => {
  setMutationError(null);
  qc.invalidateQueries({ queryKey: ['clinic', id] });
},
```

`qc` (`useQueryClient()`) va `id` (`useParams`) allaqachon component scope'ida mavjud — yangi import yoki hook kerak emas. `mutationFn` tanasi, `onError`, JSX (Fingerprint matni, Button disabled) — hech biri o'zgarmaydi.

## 3. DoD

- [ ] `reactivate` mutation'ning `onSuccess` handleri `setMutationError(null)` dan keyin `qc.invalidateQueries({ queryKey: ['clinic', id] })` chaqiradi (aynan `deactivate`/`updateModules`dagi query key bilan).
- [ ] Yangi test: reactivate muvaffaqiyatli bo'lganda `['clinic', id]` query invalidatsiya qilinishi tekshiriladi (masalan, `GET /v1/admin/clinics/:id` reactivate'dan keyin qayta so'ralganini yoki `queryClient.invalidateQueries` chaqirilganini kutish).
- [ ] Mavjud testlar (jumladan CLI-391 qo'shgan 3 ta test) buzilmaydi.
- [ ] Typecheck toza (`apps/supervisor-admin`).
