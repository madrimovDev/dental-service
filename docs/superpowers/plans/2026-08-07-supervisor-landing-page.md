# Supervisor landing + yuklab olish sahifasi — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supervisor VM'da `http://192.168.3.242/start` manzilida turadigan bir ekranlik o'zbekcha sahifa — Windows installerni yuklab olish + loyihaning qisqa tanishtiruvi.

**Architecture:** Sof statik HTML (build bosqichisiz, tashqi resurssiz) `infra/supervisor/landing/` da; installer va uning metadata'si `infra/supervisor/releases/` da; ikkalasi Caddy'ga read-only volume sifatida ulanadi. Yuklab olish havolasi barqaror fayl nomiga ishora qiladi, versiya ma'lumoti esa alohida `release.json` dan progressive-enhancement tarzida o'qiladi — JSON tushsa tugma baribir ishlaydi. Reliz chiqarish bitta bash skript bilan.

**Tech Stack:** HTML5 + inline CSS + vanilla JS (`fetch`), Caddy 2, Docker Compose, bash + rsync + `sha256sum`.

**Spec:** `docs/superpowers/specs/2026-08-07-supervisor-landing-page-design.md`

## Global Constraints

- Til: **faqat o'zbek** (lotin). Ruscha versiya bu rejaga kirmaydi.
- Sahifada **tashqi resurs YO'Q** — CDN, veb-shrift, analitika, tashqi rasm ishlatilmaydi. Sahifa internetsiz LAN'da to'liq ochilishi shart.
- Sahifada **kredensial YO'Q** — litsenziya kaliti, telefon, parol yozilmaydi.
- **Aloqa bo'limi yozilmaydi** — foydalanuvchi ma'lumot bermadi; namuna qiymat (`+998 XX ...`) qo'yish taqiqlanadi.
- Mavjud Caddy marshrutlari `/`, `/v1/*`, `/bins/*` **o'zgarmaydi**.
- Barqaror installer nomi: **`dental-service-setup.exe`**.
- VM: `ubuntu@192.168.3.242`, loyiha daraxti `~/dental-service` (git klon EMAS, rsync nusxasi).
- Har commit oldidan pre-commit hook biome + typecheck ishga tushiradi — o'zi bajariladi, qo'lda chaqirish shart emas.

---

## File Structure

| Fayl | Mas'uliyati |
|---|---|
| `infra/supervisor/landing/index.html` | **Yangi.** Butun sahifa: razmetka + inline CSS + `release.json` o'qiydigan kichik skript. Yagona fayl — bo'linmaydi. |
| `infra/supervisor/Caddyfile.ip` | **O'zgaradi.** Ikkita yangi `handle` bloki, umumiy `handle` dan OLDIN. |
| `infra/supervisor/docker-compose.ip.yml` | **O'zgaradi.** `caddy` xizmatiga ikkita read-only mount. |
| `.gitignore` | **O'zgaradi.** `infra/supervisor/releases/` qo'shiladi. |
| `scripts/publish-desktop-build.sh` | **Yangi.** Reliz chiqarish: tekshirish → `release.json` → rsync → deploy-keyingi `curl` tasdiqlash. |
| `docs/DESKTOP-WINDOWS-BUILD-TEST.md` | **O'zgaradi.** rsync buyrug'iga `releases` exclude'i + reliz chiqarish bo'limi. |

---

## Task 1: Statik sahifa va Caddy marshruti

Sahifa yaratiladi va Caddy orqali beriladi. Bu task oxirida `/start` ochiladi, lekin yuklab olinadigan fayl hali yo'q (tugma 404 beradi — Task 2 to'ldiradi).

**Files:**
- Create: `infra/supervisor/landing/index.html`
- Modify: `infra/supervisor/Caddyfile.ip` (26–33-qatorlar orasi — `handle_path /bins/*` dan keyin, `handle {` dan oldin)
- Modify: `infra/supervisor/docker-compose.ip.yml` (`caddy` xizmati `volumes:` ro'yxati, ~84–88-qatorlar)
- Modify: `.gitignore` (oxiriga)

**Interfaces:**
- Consumes: hech narsa.
- Produces: `/start` HTTP marshruti; `/download/*` statik marshruti (Task 2 shu yerga fayl qo'yadi); sahifa `GET /download/release.json` dan `{version: string, size: number, sha256: string, publishedAt: string}` shaklini kutadi va `/download/dental-service-setup.exe` ga havola qiladi.

- [ ] **Step 1: `.gitignore` ga reliz papkasini qo'shish**

Papka yaratilishidan OLDIN qilinadi — 135 MB binariy tasodifan git'ga tushmasin.

`.gitignore` oxiriga:

```
# Desktop reliz artefaktlari (installer + metadata) — VM'ga rsync qilinadi, git'da EMAS
infra/supervisor/releases/
```

- [ ] **Step 2: Sahifani yozish**

`infra/supervisor/landing/index.html` yaratiladi:

```html
<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dental Service — yuklab olish</title>
<style>
  :root {
    --bg: #f6f8f8; --card: #fff; --ink: #14302e; --muted: #5c7370;
    --line: #dbe5e3; --teal: #0f766e; --teal-dark: #115e56;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e1918; --card: #14231f; --ink: #e6f0ee; --muted: #93a8a4;
      --line: #243a36; --teal: #2dd4bf; --teal-dark: #14b8a6;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.25rem; background: var(--bg); color: var(--ink);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 1.9rem; margin: 0 0 .4rem; letter-spacing: -.02em; }
  .lead { color: var(--muted); margin: 0 0 2rem; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 1.5rem; margin-bottom: 1.5rem;
  }
  .dl {
    display: inline-block; background: var(--teal); color: #fff; text-decoration: none;
    font-weight: 600; font-size: 1.05rem; padding: .85rem 1.6rem; border-radius: 10px;
  }
  .dl:hover { background: var(--teal-dark); }
  .meta { color: var(--muted); font-size: .9rem; margin-top: .75rem; }
  h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
  ol, ul { margin: 0; padding-left: 1.25rem; }
  li { margin-bottom: .5rem; }
  code {
    background: var(--bg); border: 1px solid var(--line); border-radius: 5px;
    padding: .1rem .35rem; font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: .88em; word-break: break-all;
  }
  pre {
    background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
    padding: .75rem 1rem; overflow-x: auto; margin: .5rem 0 0;
  }
  pre code { border: 0; background: none; padding: 0; }
  .hash { color: var(--muted); font-size: .78rem; margin-top: 2rem; word-break: break-all; }
  .warn { color: var(--muted); font-size: .9rem; margin-top: .75rem; }
</style>
</head>
<body>
<main>
  <h1>Dental Service</h1>
  <p class="lead">
    Klinika boshqaruv tizimi: bemorlar, yozilish, navbat, kassa va klinik yozuvlar —
    bitta dasturda, klinikaning o'z kompyuterida ishlaydi.
  </p>

  <div class="card">
    <a class="dl" id="dl" href="/download/dental-service-setup.exe" download>
      Windows uchun yuklab olish
    </a>
    <div class="meta" id="meta">Versiya — · Hajm — · Sana —</div>
    <p class="warn">
      Dastur imzolanmagan, shuning uchun Windows ogohlantirish ko'rsatadi —
      quyidagi 1-qadamga qarang.
    </p>
  </div>

  <div class="card">
    <h2>O'rnatish</h2>
    <ol>
      <li>
        Faylni ishga tushiring. «Windows protected your PC» oynasi chiqsa —
        <b>More info</b> → <b>Run anyway</b>.
      </li>
      <li>O'rnatishda rolni tanlang: <b>server</b> (klinikaning asosiy kompyuteri).</li>
      <li>
        Dasturni ochishdan oldin server manzilini ko'rsating. PowerShell'ni
        administrator sifatida ochib:
        <pre><code>[Environment]::SetEnvironmentVariable("SUPERVISOR_URL","http://192.168.3.242","Machine")</code></pre>
      </li>
      <li>Dasturni oching va ta'minotchidan olgan litsenziya kalitini kiriting.</li>
    </ol>
  </div>

  <div class="card">
    <h2>Tizim talablari</h2>
    <ul>
      <li>Windows 10 yoki 11, 64-bit</li>
      <li>Kamida 2 GB bo'sh disk maydoni</li>
      <li>Klinika tarmog'iga ulanish (server manziliga yeta olishi kerak)</li>
    </ul>
  </div>

  <p class="hash" id="hash" hidden></p>
</main>
<script>
  // release.json — progressive enhancement: yuklanmasa yoki buzuq bo'lsa
  // sahifa va yuklab olish tugmasi o'zgarishsiz ishlayveradi (havola statik).
  const fmtSize = (b) => (b / 1048576).toFixed(0) + ' MB';
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('uz-UZ');
  };
  fetch('/download/release.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((rel) => {
      const parts = [];
      if (rel.version) parts.push('Versiya ' + rel.version);
      if (Number.isFinite(rel.size)) parts.push('Hajm ' + fmtSize(rel.size));
      const d = rel.publishedAt && fmtDate(rel.publishedAt);
      if (d) parts.push('Sana ' + d);
      if (parts.length) document.getElementById('meta').textContent = parts.join(' · ');
      if (rel.sha256) {
        const el = document.getElementById('hash');
        el.textContent = 'SHA-256: ' + rel.sha256;
        el.hidden = false;
      }
    })
    .catch(() => {
      /* jimgina — statik havola baribir ishlaydi */
    });
</script>
</body>
</html>
```

- [ ] **Step 3: Caddy marshrutlarini qo'shish**

`infra/supervisor/Caddyfile.ip` da `handle_path /bins/* { ... }` blokidan KEYIN, `handle { reverse_proxy admin:80 }` dan OLDIN quyidagini qo'ying:

```
	# Landing sahifa — BITTA fayl, shuning uchun `rewrite` bilan beriladi
	# (papka listingi/traversal yuzasi ochilmaydi). Umumiy `handle` dan
	# OLDIN turishi SHART, aks holda admin SPA hamma narsani ushlaydi.
	handle /start {
		root * /srv/landing
		rewrite * /index.html
		file_server
	}

	# Mijozga beriladigan reliz artefaktlari (installer + release.json).
	# `bins/` dan ATAYIN alohida: bins = build KIRISHLARI (prebuild
	# iste'mol qiladi), releases = mijozga CHIQISH.
	handle_path /download/* {
		root * /srv/releases
		file_server
	}
```

- [ ] **Step 4: Volume mount qo'shish**

`infra/supervisor/docker-compose.ip.yml` da `caddy` xizmatining `volumes:` ro'yxatiga `./bins:/srv/bins:ro` qatoridan keyin:

```yaml
      - ./landing:/srv/landing:ro
      - ./releases:/srv/releases:ro
```

- [ ] **Step 5: Bo'sh reliz papkasini yaratish**

Compose mount qilayotgan papka mavjud bo'lmasa Docker uni root egaligida yaratadi. Lokal va VM'da oldindan yaratamiz:

```bash
mkdir -p infra/supervisor/releases
ssh ubuntu@192.168.3.242 'mkdir -p ~/dental-service/infra/supervisor/{landing,releases}'
```

- [ ] **Step 6: VM'ga yetkazish va Caddy'ni qayta ishga tushirish**

```bash
rsync -az infra/supervisor/landing/ ubuntu@192.168.3.242:dental-service/infra/supervisor/landing/
rsync -az infra/supervisor/Caddyfile.ip infra/supervisor/docker-compose.ip.yml \
  ubuntu@192.168.3.242:dental-service/infra/supervisor/
ssh ubuntu@192.168.3.242 'cd ~/dental-service/infra/supervisor && \
  export RSA_PRIVATE_KEY="$(cat ~/supervisor-private.pem)" && \
  docker compose -f docker-compose.ip.yml --env-file .env.production up -d caddy'
```

- [ ] **Step 7: Marshrutlarni tekshirish — regressiya YO'Qligi asosiy mezon**

```bash
for p in /start / /bins/valkey-win.zip; do
  printf "%-26s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -r 0-1024 "http://192.168.3.242$p")"
done
curl -s -o /dev/null -w "v1 (401 kutiladi): %{http_code}\n" \
  -X POST http://192.168.3.242/v1/admin/clinics
curl -s http://192.168.3.242/start | grep -c "Dental Service"
```

Kutilgan: `/start` → 200, `/` → 200 (admin SPA), `/bins/valkey-win.zip` → 206,
`/v1/...` → 401, grep → 1 dan katta.

⚠️ Agar `/start` 200 o'rniga admin SPA'ning HTML'ini qaytarsa — blok tartibi
noto'g'ri, Step 3 ni qayta ko'ring.

- [ ] **Step 8: Sahifani brauzerda ochib ko'rish**

`http://192.168.3.242/start` — sarlavha, tugma, 4 qadam va talablar ko'rinishi
kerak. `release.json` hali yo'q, shuning uchun meta qatori `Versiya — · Hajm — ·
Sana —` bo'lib qoladi va SHA-256 qatori ko'rinmaydi. **Bu — kutilgan holat va
§3.3 qarorining tekshiruvi:** JSON bo'lmasa ham sahifa buzilmaydi.

- [ ] **Step 9: Commit**

```bash
git add .gitignore infra/supervisor/landing/index.html \
  infra/supervisor/Caddyfile.ip infra/supervisor/docker-compose.ip.yml
git commit -m "feat(supervisor): /start landing sahifasi + /download statik marshruti"
```

---

## Task 2: Reliz chiqarish skripti

Installerni VM'ga yuklaydi va sahifadagi versiya ma'lumotini yangilaydi.

**Files:**
- Create: `scripts/publish-desktop-build.sh`
- Modify: `docs/DESKTOP-WINDOWS-BUILD-TEST.md`

**Interfaces:**
- Consumes: Task 1 dagi `/download/*` marshruti va `releases/` mount'i.
- Produces: VM'da `releases/dental-service-setup.exe` va `releases/release.json` (`{version, size, sha256, publishedAt}`) — Task 1 sahifasi aynan shu shaklni o'qiydi.

- [ ] **Step 1: Skriptni yozish**

`scripts/publish-desktop-build.sh`:

```bash
#!/usr/bin/env bash
# Windows installerni Supervisor VM'ga chiqaradi va /start sahifasidagi
# versiya ma'lumotini yangilaydi.
#
# Ishlatish (repo root'dan):
#   bash scripts/publish-desktop-build.sh
#   bash scripts/publish-desktop-build.sh "/boshqa/yo'l/Setup.exe"
#
# Env:
#   TARGET_HOST  (default ubuntu@192.168.3.242)
#   BASE_URL     (default http://192.168.3.242)

set -euo pipefail

TARGET_HOST="${TARGET_HOST:-ubuntu@192.168.3.242}"
BASE_URL="${BASE_URL:-http://192.168.3.242}"
TARGET_DIR="dental-service/infra/supervisor/releases"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(grep -m1 '"version"' "$ROOT_DIR/apps/desktop/package.json" | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/')"

if [ -z "$VERSION" ]; then
  echo "XATO: apps/desktop/package.json dan versiya o'qib bo'lmadi" >&2
  exit 1
fi

EXE="${1:-$ROOT_DIR/apps/desktop/release/Dental Service Setup $VERSION.exe}"

if [ ! -f "$EXE" ]; then
  echo "XATO: installer topilmadi: $EXE" >&2
  echo "Avval build qiling (docs/DESKTOP-WINDOWS-BUILD-TEST.md §0b)." >&2
  exit 1
fi

# ⚠️ Bu tekshiruv `--target=bun-windows-x64` tushib qolgan holatni ushlaydi:
# usiz Linux'da ELF binariy yasalib `.exe` deb ataladi, installer muammosiz
# yig'iladi va faqat mijoz mashinasida ishlamaydi (2026-08-07 da topilgan).
if ! file -b "$EXE" | grep -q '^PE32'; then
  echo "XATO: bu Windows binariysi EMAS:" >&2
  echo "  $(file -b "$EXE")" >&2
  exit 1
fi

SIZE="$(stat -c%s "$EXE")"
SHA="$(sha256sum "$EXE" | cut -d' ' -f1)"
PUBLISHED="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$EXE" "$STAGE/dental-service-setup.exe"
cat > "$STAGE/release.json" <<JSON
{
  "version": "$VERSION",
  "size": $SIZE,
  "sha256": "$SHA",
  "publishedAt": "$PUBLISHED"
}
JSON

echo "=== Yuklanmoqda: v$VERSION, $((SIZE / 1048576)) MB ==="
ssh "$TARGET_HOST" "mkdir -p ~/$TARGET_DIR"
rsync -az --progress "$STAGE/dental-service-setup.exe" "$STAGE/release.json" \
  "$TARGET_HOST:$TARGET_DIR/"

echo "=== Tekshirilmoqda ==="
fail=0

start_code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/start")"
[ "$start_code" = "200" ] || { echo "  /start -> $start_code (200 kutilgan)" >&2; fail=1; }

exe_code="$(curl -s -o /dev/null -r 0-1024 -w '%{http_code}' "$BASE_URL/download/dental-service-setup.exe")"
[ "$exe_code" = "206" ] || { echo "  installer -> $exe_code (206 kutilgan)" >&2; fail=1; }

remote_json="$(curl -s "$BASE_URL/download/release.json")"
remote_size="$(printf '%s' "$remote_json" | grep -oE '"size"[[:space:]]*:[[:space:]]*[0-9]+' | grep -oE '[0-9]+$')"
if [ "$remote_size" != "$SIZE" ]; then
  echo "  release.json hajmi mos emas: $remote_size != $SIZE" >&2
  fail=1
fi

# Serverdagi FAYLNING haqiqiy hajmi (JSON da nima yozilganidan mustaqil) —
# HEAD so'rovi, 135 MB yuklab olinmaydi.
served_size="$(curl -sI "$BASE_URL/download/dental-service-setup.exe" \
  | grep -i '^content-length:' | tr -d '\r' | awk '{print $2}')"
if [ -n "$served_size" ] && [ "$served_size" != "$SIZE" ]; then
  echo "  serverdagi fayl hajmi mos emas: $served_size != $SIZE" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "=== YIQILDI ===" >&2
  exit 1
fi

echo "=== TAYYOR ==="
echo "  $BASE_URL/start"
echo "  v$VERSION · $((SIZE / 1048576)) MB · sha256 ${SHA:0:16}..."
```

- [ ] **Step 2: Skriptni bajariladigan qilish va noto'g'ri kirish bilan sinash**

Avval xato yo'llarni tekshiramiz — skript jimgina noto'g'ri narsa yuklamasligi kerak:

```bash
chmod +x scripts/publish-desktop-build.sh

# (a) mavjud bo'lmagan fayl → aniq xato, exit 1
bash scripts/publish-desktop-build.sh /yoq/bunday/fayl.exe; echo "exit=$?"

# (b) Windows binariysi bo'lmagan fayl → PE32 tekshiruvi ushlashi kerak
printf 'salom' > /tmp/soxta.exe
bash scripts/publish-desktop-build.sh /tmp/soxta.exe; echo "exit=$?"
rm -f /tmp/soxta.exe
```

Kutilgan: ikkalasi ham `exit=1` va tushunarli o'zbekcha xato; VM'ga hech narsa
yuklanmaydi.

- [ ] **Step 3: Haqiqiy relizni chiqarish**

```bash
bash scripts/publish-desktop-build.sh
```

Kutilgan: `=== TAYYOR ===` va sahifa manzili. Skript ichidagi barcha `curl`
tekshiruvlari o'tishi kerak.

- [ ] **Step 4: Sahifani qayta ochib, meta to'lganini ko'rish**

`http://192.168.3.242/start` — endi `Versiya 0.1.0 · Hajm 135 MB · Sana ...`
va pastda SHA-256 ko'rinishi kerak. Tugmani bosib faylni yuklab ko'ring.

- [ ] **Step 5: Degradatsiya sinovi — spec §3.3 ning butun ma'nosi**

`release.json` ni vaqtincha buzib, sahifa hamon ishlashini tasdiqlaymiz:

```bash
ssh ubuntu@192.168.3.242 'cd ~/dental-service/infra/supervisor/releases && \
  cp release.json release.json.bak && echo "buzuq{{{" > release.json'
```

Brauzerda `/start` ni yangilang: sahifa ochilishi, tugma ishlashi va meta
qatori `Versiya — · Hajm — · Sana —` bo'lib qolishi kerak. Konsolda xato
chiqmasligi kerak (`catch` yutadi).

Tiklash:

```bash
ssh ubuntu@192.168.3.242 'cd ~/dental-service/infra/supervisor/releases && \
  mv release.json.bak release.json'
```

- [ ] **Step 6: Runbook'ni yangilash**

`docs/DESKTOP-WINDOWS-BUILD-TEST.md` da:

(a) §0b oxiriga yangi kichik bo'lim qo'shing:

```markdown
### Relizni chiqarish

Build tugagach installerni Supervisor VM'ga chiqarish:

```bash
bash scripts/publish-desktop-build.sh
```

Skript PE32 ekanini tekshiradi (Linux'da `--target` tushib qolgan holatni
ushlaydi), `release.json` yozadi, VM'ga yuklaydi va `curl` bilan tasdiqlaydi.
So'ng sahifa: `http://192.168.3.242/start`.
```

(b) §0 dagi jadvalga qator qo'shing:

```markdown
| Yuklab olish sahifasi | `http://192.168.3.242/start` |
```

(c) Daraxtni VM'ga rsync qiladigan HAR BIR buyruqqa `--exclude 'infra/supervisor/releases'`
qo'shing — `bins` bilan bir xil sabab: `--delete` aks holda 135 MB installerni
o'chirib yuboradi.

- [ ] **Step 7: Commit**

```bash
git add scripts/publish-desktop-build.sh docs/DESKTOP-WINDOWS-BUILD-TEST.md
git commit -m "feat(supervisor): desktop reliz chiqarish skripti + runbook"
```

---

## Self-review qaydi

Spec bo'limlari va ularni qoplaydigan tasklar:

| Spec | Task |
|---|---|
| §3.1 `/start`, admin tegilmaydi | T1 Step 3, Step 7 (regressiya tekshiruvi) |
| §3.2 statik HTML, tashqi resurssiz | T1 Step 2 |
| §3.3 barqaror nom + JSON boyitish | T1 Step 2 (skript), T1 Step 8 + T2 Step 5 (degradatsiya sinovi) |
| §3.4 `bins/` ≠ `releases/` | T1 Step 3, Step 4 |
| §3.5 kredensial yo'q | T1 Step 2 (4-qadamda «ta'minotchidan olgan kalit») |
| §4 fayl tarkibi | T1 Step 1, 2, 5; T2 Step 1 |
| §5.1 sahifa 5 bo'limi | T1 Step 2 — aloqa bo'limi ATAYIN yo'q (Global Constraints) |
| §5.2 `release.json` shakli | T2 Step 1 |
| §5.3 Caddy | T1 Step 3 |
| §5.4 compose | T1 Step 4 |
| §5.5 publish skripti (5 qadam) | T2 Step 1 |
| §6 rsync exclude xavfi | T2 Step 6(c) |
| §6 Caddy blok tartibi | T1 Step 3 izohi + Step 7 ogohlantirishi |
| §6 katta fayl git'ga tushishi | T1 Step 1 (papkadan OLDIN) |
| §7 tekshirish | T1 Step 7–8, T2 Step 2–5 |
| §8 mezon | T1 Step 7, T2 Step 3–5 |

Qoplanmagan spec talabi yo'q.
