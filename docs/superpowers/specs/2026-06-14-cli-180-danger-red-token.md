# CLI-180 — Destruktiv amal rangini token-danger qilish (red palette remap)

**Sana:** 2026-06-14
**Epik:** CLI-177
**Holat:** Spec — advisor approval olingan (red remap, variantColorResolver tashlandi)

## 1. Muammo (gap-validatsiya)

`mantine-theme.ts` `colors: { teal }` — `red` yo'q. `color="red"` (25 sayt: Button 3, ActionIcon ~16, Alert 4, Menu.Item 1, Badge 1) Mantine default red palette (red-6 ≈ #fa5252) ishlatadi — `--danger` token (#dc2626) EMAS. Delete/danger affordance'lar noto'g'ri qizil. **Haqiqiy ko'rinadigan farq** (CLI-178'dan farqli).

## 2. Yechim — red tuple `--danger` token atrofida

`mantine-theme.ts` `colors`'ga `red` `MantineColorsTuple` qo'shish. Anchorlar (primaryShade `{light:6, dark:4}` bo'yicha Mantine `color="red"` filled shu shadelarni oladi):
- `red[6] = #dc2626` (light `--danger` = tokens.css `--red-600`)
- `red[4] = #f08a82` (dark `--danger` = tokens.css dark blok)

Ramp (Tailwind red asosi, red-600=#dc2626 aynan mos; shade 4 token salmon'ga moslangan):
```
0:#fef2f2 1:#fee2e2 2:#fecaca 3:#fca5a5 4:#f08a82 5:#ef4444 6:#dc2626 7:#b91c1c 8:#991b1b 9:#7f1d1d
```
Monotonik och→to'q. Button/ActionIcon/Alert/Badge/Menu `color="red"` hammasi shu palitradan → token-danger, **0 call-site churn**.

## 3. Ko'lamdan tashqari
- variantColorResolver — **tashlandi** (consumer grep = 0).
- `color="red"`→`variant="danger"` migration — rad (Alert/Badge/Menu `color` ishlatadi).
- Biome custom lint — rad (token-red bo'lgach style preference). Ixtiyoriy CI grep keyinroq.
- Size vocabulary — defer.

## 4. Test (vizual/qiymat, behavior emas)
`mantine-theme.test.ts` (yoki teal-sync yonida): `mantineTheme.colors.red[6] === '#dc2626'`, `[4] === '#f08a82'`. Manual: DesignSystemPage delete/danger token-red.

## 5. DoD
- `red` tuple theme'da; theme unit test yashil; UI `bun test` o'tadi; tsc toza.
