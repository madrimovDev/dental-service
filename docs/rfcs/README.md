# RFC'lar — Arxitektura qarorlari

Redesign keltirgan **yangi/o'zgargan arxitektura qarorlari** shu yerda hujjatlashtiriladi. Allaqachon qotirilgan qarorlar ([`CLAUDE.md`](../../CLAUDE.md), [`CONCEPT.md`](../../CONCEPT.md): stack, RLS, factory DI, OpenAPI, multi-tenant, RBAC) qayta yozilmaydi.

Shablon: [`0000-template.md`](./0000-template.md). Yaxlit manzara: [`../architecture.md`](../architecture.md).

## Holat

| RFC | Mavzu | Epik | Chuqurlik | Status |
|---|---|---|---|---|
| [0001](./0001-extensibility-vertical-model.md) | Extensibility / vertikal model | cross | to'liq | ✅ Accepted |
| [0002](./0002-frontend-architecture.md) | Frontend arxitektura (folder, data-fetch, state, packages/ui) | R0/R1 | to'liq | ✅ Accepted |
| [0003](./0003-design-system-theming.md) | Design system & theming (teal↔Mantine, dark mode) | R0 | qaror+oqibat | ✅ Accepted |
| [0004](./0004-app-shell-navigation.md) | App shell & rol-adaptive nav | R1 | qaror+oqibat | ✅ Accepted |
| [0005](./0005-patient-balance-ledger.md) | Patient balance / ledger (computed vs materialized) | R3 | real (ochiq tanlov) | ✅ Accepted |
| [0006](./0006-reporting-aggregation.md) | Reporting & aggregation (dashboard/KPI) | R3 | real (ochiq tanlov) | ✅ Accepted |
| [0007](./0007-erp-modules-data-model.md) | Yangi ERP modullar data model (ombor/xarajat/payroll) | R4 | stub | ✅ Accepted (yo'nalish) |
| [0008](./0008-notifications.md) | Notifications (kanal abstraksiya + Eskiz) | R4 | stub | ✅ Accepted (yo'nalish) |
| [0009](./0009-backend-module-architecture.md) | Backend modul arxitekturasi (6-fayl qatlamli, RLS-only) | cross | to'liq | ✅ Accepted |

> Chuqurlik yetuklikka qarab: yaqin epiklar (R0/R1) to'liq; uzoq epiklar (R3/R4) qisqaroq — talablar o'zgarishi mumkin. RFC-ma-RFC yoziladi va ko'rib chiqiladi.
