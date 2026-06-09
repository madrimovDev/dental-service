# RFC-0007: Yangi ERP modullar data model (ombor / xarajat / payroll)

- **Status:** Accepted (STUB — yo'nalish)
- **Sana:** 2026-06-09
- **Bog'liq:** [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md), R4 (CLI-71), Linear CLI-90

> ⚠️ **STUB** — bu modullar R4 (oylar narida); talablar o'zgaradi. Bu hujjat faqat **yo'nalish** beradi (yuqori darajadagi data model + tayanch qarorlar). To'liq dizayn R4 boshlanganda, alohida to'liq RFC sifatida yoziladi.

## Kontekst

R4 uchta yangi ERP moduli qo'shadi — backend'da hech narsa yo'q: **ombor (stock)**, **xarajatlar**, **ish haqi (payroll)**. Bularning umumiy tayanchlari hozir belgilanadi, tafsilot keyin.

## Tayanch qarorlar (umumiy)

- **Vertikal-neytral core** (RFC-0001) — bu modullar dental seam emas, har klinikada bor.
- **Multi-tenant + RLS** (CLAUDE.md) — har jadval `tenant_id`, RLS yoqilgan, factory service'lar.
- **Filial darajasi:** ombor/xarajat per-branch (CONCEPT Q1.c/Q1.e — Phase 1 da har filial alohida).

## Yo'nalish — data model eskizi

### Ombor (stock)
- `stock_items` — tenant, branch, name, type (material/dori/sarf/asbob), unit, quantity, reorder_level, status (derived: yetarli/kam/tugayapti).
- `stock_movements` — item, qty, direction (in/out), reason (qabul/sarf/inventarizatsiya), by_user, ref (masalan vizit/lab).
- Asistent dashboard'dan **sarf qaydi** (out movement).

### Xarajatlar
- `expenses` — tenant, branch, date, category (material/ijara/kommunal/lab/…), amount, currency, vendor?, description, created_by, approved_by?.
- Hisobotlarga (RFC-0006) ulanadi (daromad − xarajat = sof).

### Ish haqi (payroll)
- Xodim kompensatsiya: `user_assignments` yoki `staff_profiles`'ga `comp_scheme` (oylik/foiz), `comp_rate` (RFC: xodim profili, R4).
- `payroll_periods` — tenant, period (oy), status (hisoblanmoqda/hisoblandi/to'landi).
- `payroll_lines` — period, staff, scheme, calculated_amount, status, paid_at. Foiz sxema → manba **RFC-0006 reports** (doktor daromadi/bajarilgan vizitlar).

## Ochiq savollar (R4 da hal qilinadi)

- Ombor: markaziy ombor + filial taqsimoti kerakmi yoki faqat per-branch? (CONCEPT: hozircha per-branch).
- Payroll: foiz hisoblash aniq formulasi (daromad bazasi, davr chegarasi, qaytarishlar ta'siri).
- Xarajat ↔ buxgalteriya/1C eksport integratsiyasi.
- Bu uchtasi alohida modulmi yoki bitta "finance/erp" modul ostidami.

## Holat

Bu STUB **Accepted-as-direction** — yo'nalish tasdiqlanadi, lekin schema R4 da to'liq RFC bilan qotiriladi (yangi sub-RFC yoki bu hujjatni kengaytirish).
