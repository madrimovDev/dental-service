# Dental Service — Desktop Offline + Supervisor Dizayn Spesifikatsiyasi

**Sana:** 2026-06-29
**Holat:** Tasdiqlangan
**Muallif:** madrimovDev + Claude

---

## 1. Umumiy tizim xaritasi

```
┌─────────────────────────────────────────────────────┐
│                  SUPERVISOR (Cloud)                  │
│  - Klinikalar boshqaruvi                            │
│  - Litsenziya + machine fingerprint                 │
│  - Modul on/off (tarif asosida)                     │
│  - S3 backup boshqaruvi                             │
│  - Admin panel (developer uchun)                    │
└──────────────┬──────────────────────────────────────┘
               │ HTTPS (activation, heartbeat, modules)
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐   ┌─────────────────────────┐
│   LOCAL     │   │   SAAS / ONLINE         │
│  DESKTOP    │   │  (docker-compose.prod)  │
│             │   │                         │
│ Electron    │   │ Caddy + TLS             │
│ Postgres    │   │ API + Worker            │
│ Valkey      │   │ Postgres + Redis        │
│ API.exe     │   │ MinIO / S3              │
└──────┬──────┘   └──────────┬──────────────┘
       │                     │
       └──────────┬──────────┘
                  ▼
         ┌────────────────┐
         │   S3 Storage   │
         │ (AWS / MinIO)  │
         │ Backup + files │
         └────────────────┘
```

---

## 2. Local Desktop rejimi

### 2.1 Deployment modeli

Bitta installer (`DentalServiceSetup.exe`) — bir xil EXE barcha mashinalarga o'rnatiladi.
O'rnatish vaqtida foydalanuvchi **rol** tanlaydi:

- **Server** → barcha servislar ishga tushadi, LAN'da serve qiladi
- **Klient** → serverga ulanadi (avtomatik topadi)

### 2.2 Installer tarkibi

```
DentalServiceSetup.exe (NSIS via electron-builder)
└── C:\Program Files\DentalService\
    ├── DentalService.exe        (Electron — tray + process manager)
    ├── resources/
    │   ├── api.exe              (bun build --compile — Hono API + web static)
    │   ├── config.json          (rol: server|klient, server IP, license)
    │   ├── postgres/            (~50MB portable PostgreSQL 16 for Windows)
    │   │   └── bin/ + lib/
    │   └── valkey/              (~5MB Redis-fork, rasmiy Windows binary)
    │       └── valkey-server.exe

C:\ProgramData\DentalService\   (ma'lumotlar — o'rnatishda yaratiladi)
    ├── postgres/data/           (DB fayllar)
    ├── uploads/                 (rasm va fayllar, MinIO o'rniga)
    ├── license.lic              (AES-256 shifrlangan litsenziya)
    └── logs/
```

### 2.3 Server rejimi — startup oqimi

```
DentalService.exe (Server) ishga tushadi
    ↓
license.lic tekshiriladi (fingerprint mos keladi?)
    ↓ (mos kelsa)
postgres.exe ishga tushadi → healthcheck
valkey-server.exe ishga tushadi → healthcheck
    ↓ (birinchi marta: initdb + migrations + seed)
api.exe ishga tushadi (0.0.0.0:80)
    ↓
mDNS: _dental-service._tcp.local → e'lon qilinadi
UDP listener: port 47890 → "DENTAL_DISCOVER_v1" so'rovlarga javob
    ↓
Tray icon: "Server | 192.168.x.x | N ta qurilma"
Brauzer ochiladi: http://localhost
```

### 2.4 Klient rejimi — startup oqimi

```
DentalService.exe (Klient) ishga tushadi
    ↓
Server qidirish (ketma-ket):
  1. mDNS: _dental-service._tcp.local
  2. UDP broadcast port 47890: "DENTAL_DISCOVER_v1"
  3. config.json dagi oxirgi saqlangan IP
    ↓
Topildi → http://SERVER_IP ga ulanadi
Topilmadi → "Server topilmadi" + qo'lda IP kiritish (sozlamalar)
    ↓
Tray icon: "Klient | Ulangan: 192.168.x.x"
Brauzer ochiladi: http://SERVER_IP
```

**Sozlamalar:** Server IP qo'lda ham o'zgartirilishi mumkin (agar DHCP o'zgartirsa)

### 2.5 Tray menu

**Server rejimi:**
```
🟢 Dental Service — Server
────────────────────────
📡 Tarmoq manzili: 192.168.1.10
👥 Ulangan qurilmalar: 3
🔐 Litsenziya: Premium | 28 kun qoldi
────────────────────────
🌐 Ochish
📋 Loglar
⚙️  Sozlamalar
🔴 To'xtatish
```

**Klient rejimi:**
```
🟢 Dental Service — Klient
────────────────────────
✅ Ulangan: 192.168.1.10
────────────────────────
🌐 Ochish
⚙️  Sozlamalar (IP o'zgartirish)
❌ Chiqish
```

### 2.6 RAM/CPU optimallashtirish (i3/i5, 8GB RAM, ~5 qurilma)

| Servis | Optimallashtirilgan | Konfiguratsiya |
|---|---|---|
| PostgreSQL | ~80MB | `shared_buffers=64MB`, `max_connections=20`, `work_mem=4MB` |
| Valkey | ~20MB | `maxmemory 64mb`, `maxmemory-policy allkeys-lru` |
| API (Bun) | ~60MB | Worker merged-in-process (alohida jarayon yo'q) |
| Electron | ~80MB | Tray only (BrowserWindow yo'q serverda) |
| MinIO | **0** | **O'chirildi** — local filesystem ishlatiladi |
| **Jami** | **~240MB** | |

### 2.7 Kod o'zgarishlari

**Katta o'zgarishlar:**

| Fayl | O'zgarish |
|---|---|
| `apps/desktop/src/main.ts` | To'liq qayta yoziladi: web wrapper → process manager + tray + discovery |
| `apps/api/src/lib/storage.ts` | Yangi fayl: MinIO o'rniga local filesystem adapter |
| `apps/api/src/lib/s3.ts` | `storage.ts` ga yo'naltiriladi |
| `electron-builder.yml` | Portable Postgres + Valkey resources'ga qo'shiladi |

**Kichik o'zgarishlar:**
- BullMQ worker → API process ichiga birlashtiriladi
- `apps/api/src/lib/license.ts` → yangi: litsenziya tekshiruvi middleware

**O'ZGARMAYDI (100%):**
- Barcha biznes logika (routes, services, repository'lar)
- Frontend React app (static fayllar sifatida serve qilinadi)
- PostgreSQL schema + RLS + migratsiyalar
- Auth, RBAC, i18n, barcha feature'lar (M0–M14)

---

## 3. Supervisor tizimi

### 3.1 Arxitektura

Supervisor — developer (siz) boshqaradigan **alohida loyiha** (alohida repo):

```
supervisor-service/
├── apps/admin/     (React — developer uchun admin panel)
└── apps/api/       (Hono — Dental Service chaqiradigan API)
```

### 3.2 Admin panel imkoniyatlari

- Klinikalar ro'yxati (nomi, litsenziya holati, tarif, oxirgi heartbeat)
- Yangi litsenziya yaratish → license key generatsiya
- Modul on/off toggle (real-time, keyingi heartbeat'da qo'llanadi)
- S3 backup holati (oxirgi backup vaqti, hajmi, restore tugmasi)
- Tarif o'zgartirish

### 3.3 Supervisor API (Dental Service chaqiradi)

```
POST /v1/activate          → license key + fingerprint → tasdiqlash
POST /v1/heartbeat         → kunlik tekshiruv → modullar ro'yxati
POST /v1/backup/notify     → backup tugadi, S3 path yuboriladi
GET  /v1/backup/restore    → restore presigned URL (S3)
```

---

## 4. Litsenziya va Modul Gating

### 4.1 Machine Fingerprint

```
Fingerprint = SHA256(CPU_ID + Motherboard_Serial + Primary_MAC)
→ "A3F9-2B1C-7E4D-..."
```

Boshqa PCga ko'chirilsa — fingerprint mos kelmaydi → bloklangan.

### 4.2 Aktivatsiya oqimi (bir marta, internet kerak)

```
O'rnatish →
  1. Fingerprint generatsiya qilinadi
  2. Foydalanuvchi license key kiritadi (sizdan olgan)
  3. POST supervisor/v1/activate { key, fingerprint, version }
  4. ← { valid, modules[], expiresAt, serverTime, signature (RSA) }
  5. → AES-256 shifrlangan license.lic ga saqlanadi
        (kalit = fingerprint → boshqa PCda ochilmaydi)
```

### 4.3 Kunlik heartbeat (background)

```
Har 24 soatda bir:
  POST supervisor/v1/heartbeat { key, fingerprint }
  ← { valid, modules[], nextCheck, serverTime }
  → license.lic yangilanadi
```

**Offline grace period: 30 kun**
- 30 kun internet bo'lmasa → faqat asosiy modullar ishlaydi
- Grace hisoblash: `serverTime` asosida (tizim soatini o'zgartirish ishlamaydi)

### 4.4 Anti-crack himoya

| Hujum | Himoya |
|---|---|
| `.lic` faylni ko'chirish | AES-256 (kalit = fingerprint) → boshqa PCda ochilmaydi |
| Litsenziya soxtalashtirish | RSA imzosi (Supervisor private key) |
| Binary patching | Bun compile obfuscation (qisman) |
| Supervisor MITM | HTTPS + sertifikat pinning |
| Tizim soati hack | Server `serverTime` bilan solishtirish |

**Realistik xavf darajasi: Past** (O'zbekiston kichik klinika bozori, texnik hacker emas)

### 4.5 Tarif modeli (texnik)

| Tarif | Modullar |
|---|---|
| **Starter** | Bemorlar, yozilish, navbat |
| **Standard** | + Kassa, hisobotlar, xodimlar |
| **Premium** | + Klinik (odontogram, davolash), lab, rasm |
| **Enterprise** | + ERP, payroll, ombor, filiallar |
| **Backup** *(qo'shimcha)* | + S3 cloud backup (har tarifga qo'shiladi) |

**Mavjud `vertical-features.ts` kengaytiriladi** — modul ro'yxati Supervisor'dan keladi, lokal cache'da saqlanadi.

---

## 5. S3 Cloud Backup

**Faqat "Backup" tarifi bor klinikalar uchun.**

### 5.1 Backup oqimi

```
Har kecha 02:00 da (server rejimida):
  1. pg_dump → {date}-db.sql.gz
  2. uploads/ → {date}-files.tar.gz
  3. AES-256 shifrlash (clinic-specific kalit, Supervisor saqlaydi)
  4. S3 ga yuklash: s3://dental-backups/{clinicId}/{date}/
  5. POST supervisor/v1/backup/notify { clinicId, s3Path, size, checksum }
```

### 5.2 Restore oqimi

```
Admin panel → "Restore" tugma →
  GET supervisor/v1/backup/restore { clinicId, date }
  ← { presignedUrl (15 daqiqa) }
  → Dental Service yuklab oladi
  → Decrypt → pg_restore + fayllar
```

### 5.3 Local vs SaaS farqi

- **Local desktop:** local filesystem → backup vaqtida S3 ga yuklash
- **SaaS:** MinIO allaqachon bor (S3-compatible) → to'g'ridan S3 ga

---

## 6. SaaS / Online rejim

**Arxitektura o'ZGARMAYDI** — `docker-compose.prod.yml` allaqachon tayyor.

### 6.1 Local vs SaaS farqlari

| | Local Desktop | SaaS |
|---|---|---|
| Deployment | Windows EXE (NSIS) | VPS + Docker |
| Litsenziya | Machine fingerprint | Domain/subdomain |
| Fayl storage | Local filesystem | MinIO → S3 |
| TLS | Yo'q (LAN HTTP) | Caddy + Let's Encrypt |
| Supervisor | Heartbeat (24h) | Heartbeat (24h) |
| Backup | Ixtiyoriy (tarif) | Standart S3 |
| Worker | API process ichida | Alohida `worker` service |

**Supervisor** ikkalasini ham bitta API orqali boshqaradi:
```json
{ "licenseType": "desktop" | "saas" }
```

---

## 7. Amalga oshirish tartibi (bosqichlar)

### Bosqich 1: Local Desktop MVP
1. `apps/desktop` — process manager + tray + installer wizard (Server/Klient)
2. `apps/api/src/lib/storage.ts` — MinIO → local filesystem
3. Portable Postgres + Valkey Windows binaries bundling
4. electron-builder NSIS installer
5. Server discovery (mDNS + UDP broadcast)

### Bosqich 2: Litsenziya + Modul Gating
1. `apps/api/src/lib/license.ts` — fingerprint + .lic parser + middleware
2. `vertical-features.ts` kengaytirish (Supervisor modullar ro'yxati)
3. Supervisor loyihasi yaratish (alohida repo)
4. Supervisor admin panel + API

### Bosqich 3: S3 Backup
1. Backup scheduler (server rejimida, 02:00)
2. Encrypt + S3 upload
3. Restore jarayoni
4. Supervisor backup panel

### Bosqich 4: SaaS
1. `docker-compose.prod.yml` allaqachon tayyor — asosan deployment docs
2. Supervisor'da `licenseType: 'saas'` qo'shish
3. Domain-based litsenziya

---

## 8. Ochiq savollar

- [ ] S3 provider: AWS S3 yoki o'z MinIO serveri?
- [ ] Supervisor qaysi hostingda? (VPS, Railway, Fly.io?)
- [ ] Grace period: 30 kun yetarlimi?
- [ ] Backup encryption kaliti: Supervisor saqlaydi yoki klinika o'zi?
- [ ] Reactivation: hardware o'zgarganda qanday jarayon?
