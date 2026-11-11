# scripts/ui — vizual tekshiruv vositalari

Chromium: `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome` (`playwright-core`).
PNG'lar `/tmp/claude-1000/<lane>/` ga yoziladi va **Read** bilan ko'riladi.

## Kanvas artboard
```
bun scripts/ui/canvas-shot.ts <Name> [out.png]     # Name = docs/design/ui-redesign-2026-11/canvas/<Name>.dc.html
```
`support.js` so'rovi `.cache/dc-runtime.js` ga yo'naltiriladi (oflayn), Google Fonts bloklanadi.

## Kontrast
```
bun scripts/ui/contrast-check.ts   # tokens.css light + dark juftliklari, matn >= 4.5:1; yetmasa exit 1
```
Yangi rang juftligi qo'shilsa `PAIRS` ro'yxatiga yozing.

## Ilova (rol bo'yicha, light + dark)
1. Lane bazasi tayyor (`scripts/wf-lane.sh prep <lane> <n> --db`), `.env` shu lane'niki.
2. Web build: `(cd apps/web && VITE_API_BASE_URL= bun run build)`
3. API: `cd apps/api && API_PORT=8041 WEB_DIST_DIR=$PWD/../web/dist bun --env-file=../../.env run src/index.ts &`
4. Seed (tenant + har rol shabloni xodimi + custom rol): `bun scripts/ui/seed-roles.ts --base http://localhost:8041 --out /tmp/claude-1000/ui0/creds.json`
5. Skrinshot: `bun scripts/ui/app-shot.ts --base http://localhost:8041 --phone <creds.users.receptionist.phone> --password <...> --tenant "<creds.tenant>" --paths /,/patients --out /tmp/claude-1000/ui0/app --both`
6. Serverni to'xtating (portni `kill` qiling).

Rol bo'yicha tekshiruv real cheklangan rol bilan (`@owner` emas).
