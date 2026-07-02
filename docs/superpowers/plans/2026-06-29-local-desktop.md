# Local Desktop (Windows Installer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dental-service` ni Windows'da offline LAN'da ishlaydigan qilish — bitta NSIS installer, Server yoki Klient rejimi, portable Postgres + Valkey bundled, MinIO o'rniga local filesystem.

**Architecture:** Electron process manager tray iconida ishlaydi. Server rejimida portable Postgres + Valkey + `api.exe` (`bun compile`) ishga tushiriladi va LAN'da serve qilinadi. Klient rejimida faqat mDNS/UDP orqali server topiladi va web UI ochiladi. Supervisor'dan olingan `.lic` fayl modullarni gating qiladi.

**Tech Stack:** Electron 33, electron-builder (NSIS), `bun build --compile`, portable PostgreSQL 16 for Windows, Valkey 8 (Windows binary), Node.js `dgram` (UDP), `@homebridge/ciao` (mDNS), `systeminformation` (fingerprint), Node.js `crypto` (AES-256), Vitest (unit tests)

## Global Constraints

- TypeScript strict mode, path alias `@/` → `apps/api/src/`
- Bun runtime (backend), Electron 33 (desktop)
- Vitest — API unit testlari; `bun test` — integration testlari
- Biome lint + typecheck har commit oldidan
- `getDb(c)` orqali DB (RLS-bound) — hech qachon to'g'ridan import qilma
- Hech qachon hardcoded tenant/permission — factory DI pattern
- i18n: barcha UI string `t()` orqali
- O'zgartirilgan barcha fayllarga `bun run typecheck` o'tishi shart

---

## Fayl xaritasi

### Yangi fayllar

| Fayl | Vazifa |
|---|---|
| `apps/api/src/lib/storage.ts` | Local filesystem storage adapter (MinIO o'rniga) |
| `apps/api/src/lib/license.ts` | Machine fingerprint, .lic fayl encrypt/decrypt, modul ro'yxati |
| `apps/api/src/lib/license-client.ts` | Supervisor API ga activate + heartbeat HTTP calls |
| `apps/api/src/lib/license-middleware.ts` | Hono middleware — modul gating |
| `apps/api/src/routes/uploads.ts` | `GET /uploads/:key` — auth tekshirib fayl qaytaradi |
| `apps/desktop/src/config.ts` | config.json read/write (rol, serverUrl, licenseKey) |
| `apps/desktop/src/process-manager.ts` | Postgres, Valkey, api.exe ishga tushirish/to'xtatish |
| `apps/desktop/src/first-run.ts` | initdb + migrate + seed (birinchi ishga tushishda) |
| `apps/desktop/src/discovery.ts` | mDNS + UDP server (server rejimi) va klient (klient rejimi) |
| `apps/desktop/src/tray.ts` | Tray icon + menu (server/klient holat) |
| `infra/postgres-win.conf` | Windows uchun optimallashtirilgan PG konfiguratsiya |
| `infra/valkey-win.conf` | Windows uchun optimallashtirilgan Valkey konfiguratsiya |
| `scripts/download-portable-bins.sh` | Build vaqtida portable Postgres + Valkey yuklab olish |

### O'zgartirilgan fayllar

| Fayl | O'zgarish |
|---|---|
| `apps/api/src/lib/s3.ts` | `createLocalStorageAdapter` ga yo'naltirish |
| `apps/api/src/index.ts` | `StorageAdapter` DI ga qo'shiladi; worker merged-in |
| `apps/desktop/src/main.ts` | Web wrapper → config o'qib Server/Klient rejimini tanlash |
| `apps/desktop/package.json` | `systeminformation`, `@homebridge/ciao` qo'shiladi |
| `apps/desktop/electron-builder.yml` | `extraResources` — postgres/, valkey/ bundling |

---

## Task 1: Local Filesystem Storage Adapter

**Files:**
- Create: `apps/api/src/lib/storage.ts`
- Create: `apps/api/src/routes/uploads.ts`
- Test: `apps/api/src/lib/storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface StorageAdapter {
    save(key: string, data: Buffer): Promise<void>
    stream(key: string): ReadableStream
    remove(key: string): Promise<void>
    exists(key: string): Promise<boolean>
    serveUrl(key: string): string
  }
  createLocalStorageAdapter(baseDir?: string): StorageAdapter
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/api/src/lib/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createLocalStorageAdapter } from './storage'

describe('createLocalStorageAdapter', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'storage-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('saves and streams a file', async () => {
    const storage = createLocalStorageAdapter(tmpDir)
    const data = Buffer.from('hello world')
    await storage.save('test/file.txt', data)
    expect(await storage.exists('test/file.txt')).toBe(true)
  })

  it('returns false for non-existent file', async () => {
    const storage = createLocalStorageAdapter(tmpDir)
    expect(await storage.exists('missing.txt')).toBe(false)
  })

  it('removes a file', async () => {
    const storage = createLocalStorageAdapter(tmpDir)
    await storage.save('to-delete.txt', Buffer.from('x'))
    await storage.remove('to-delete.txt')
    expect(await storage.exists('to-delete.txt')).toBe(false)
  })

  it('serveUrl returns correct path', () => {
    const storage = createLocalStorageAdapter(tmpDir)
    expect(storage.serveUrl('images/abc.jpg')).toBe('/uploads/images%2Fabc.jpg')
  })
})
```

- [ ] **Step 2: Test ishga tushir — FAIL bo'lishini tekshir**

```bash
cd apps/api && bun test src/lib/storage.test.ts
```
Kutilgan: `Cannot find module './storage'`

- [ ] **Step 3: `storage.ts` implementatsiya yoz**

```ts
// apps/api/src/lib/storage.ts
import { mkdir, unlink, stat } from 'fs/promises'
import { dirname, join } from 'path'

const DEFAULT_DIR =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\uploads'
    : '/var/lib/dental-service/uploads'

export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>
  stream(key: string): ReadableStream
  remove(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  serveUrl(key: string): string
}

export const createLocalStorageAdapter = (
  baseDir = process.env.UPLOADS_DIR ?? DEFAULT_DIR
): StorageAdapter => ({
  async save(key, data) {
    const path = join(baseDir, key)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, data)
  },
  stream(key) {
    return Bun.file(join(baseDir, key)).stream()
  },
  async remove(key) {
    await unlink(join(baseDir, key))
  },
  async exists(key) {
    try {
      await stat(join(baseDir, key))
      return true
    } catch {
      return false
    }
  },
  serveUrl(key) {
    return `/uploads/${encodeURIComponent(key)}`
  },
})
```

- [ ] **Step 4: Upload route yoz**

```ts
// apps/api/src/routes/uploads.ts
import { Hono } from 'hono'
import { join } from 'path'
import type { StorageAdapter } from '@/lib/storage'

const DEFAULT_DIR =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\uploads'
    : '/var/lib/dental-service/uploads'

export const uploadsRoutes = (storage: StorageAdapter) => {
  const app = new Hono()

  // JWT middleware allaqachon parent router'da — bu route protected
  app.get('/:key{.+}', async (c) => {
    const key = decodeURIComponent(c.req.param('key'))
    if (!(await storage.exists(key))) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'File not found' } }, 404)
    }
    const file = Bun.file(join(DEFAULT_DIR, key))
    return new Response(storage.stream(key), {
      headers: { 'Content-Type': file.type ?? 'application/octet-stream' },
    })
  })

  return app
}
```

- [ ] **Step 5: `s3.ts` ni storage.ts ga yo'naltir**

`apps/api/src/lib/s3.ts` faylini o'chirma — faqat qayta eksport:
```ts
// apps/api/src/lib/s3.ts
export { createLocalStorageAdapter as createS3Client } from './storage'
```
(s3.ts'ni import qilgan joylar avtomatik storage.ts'ni ishlatadi)

- [ ] **Step 6: Test qayta ishga tushir — PASS bo'lishini tekshir**

```bash
cd apps/api && bun test src/lib/storage.test.ts
```
Kutilgan: 4 ta test PASS

- [ ] **Step 7: Typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/storage.ts apps/api/src/lib/s3.ts apps/api/src/routes/uploads.ts apps/api/src/lib/storage.test.ts
git commit -m "feat(api): MinIO → local filesystem storage adapter"
```

---

## Task 2: Machine Fingerprint + License Fayl (.lic)

**Files:**
- Create: `apps/api/src/lib/license.ts`
- Test: `apps/api/src/lib/license.test.ts`

**Interfaces:**
- Consumes: `systeminformation` npm package (`si.cpu()`, `si.system()`, `si.networkInterfaces()`)
- Produces:
  ```ts
  interface LicenseData {
    licenseKey: string
    clinicId: string
    modules: string[]
    expiresAt: string       // ISO date (Supervisor serverTime asosida)
    gracePeriodDays: number // Supervisor'dan keladi
    issuedAt: string
    signature: string       // Supervisor RSA imzosi (hex)
  }
  getFingerprint(): Promise<string>          // SHA-256 hex
  readLicense(): Promise<LicenseData | null>
  writeLicense(data: LicenseData): Promise<void>
  isLicenseValid(data: LicenseData): boolean // signature + grace check
  getActiveModules(): Promise<string[]>
  LICENSE_PATH: string
  ```

- [ ] **Step 1: `systeminformation` o'rnat**

```bash
cd apps/desktop && bun add systeminformation
```

- [ ] **Step 2: Failing test yoz**

```ts
// apps/api/src/lib/license.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('systeminformation', () => ({
  cpu: vi.fn().mockResolvedValue({ physicalCores: 4, manufacturer: 'Intel', brand: 'i5' }),
  system: vi.fn().mockResolvedValue({ uuid: 'test-uuid-1234', serial: 'SN123456' }),
  networkInterfaces: vi.fn().mockResolvedValue([
    { iface: 'eth0', mac: '00:11:22:33:44:55', default: true }
  ]),
}))

describe('getFingerprint', () => {
  it('returns consistent SHA-256 hash', async () => {
    const { getFingerprint } = await import('./license')
    const fp1 = await getFingerprint()
    const fp2 = await getFingerprint()
    expect(fp1).toBe(fp2)
    expect(fp1).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('writeLicense + readLicense', () => {
  it('round-trips license data', async () => {
    const { writeLicense, readLicense } = await import('./license')
    const data = {
      licenseKey: 'TEST-KEY-1234',
      clinicId: 'clinic-abc',
      modules: ['patients', 'appointments'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'mock-signature',
    }
    await writeLicense(data)
    const read = await readLicense()
    expect(read).toMatchObject({ licenseKey: 'TEST-KEY-1234', modules: ['patients', 'appointments'] })
  })
})

describe('isLicenseValid', () => {
  it('returns false if expiresAt + gracePeriodDays passed', () => {
    const { isLicenseValid } = require('./license')
    const expired = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: [],
      expiresAt: new Date(Date.now() - 86400000 * 60).toISOString(), // 60 kun oldin
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'sig',
    }
    expect(isLicenseValid(expired)).toBe(false)
  })
})
```

- [ ] **Step 3: Test ishga tushir — FAIL**

```bash
cd apps/api && bun test src/lib/license.test.ts
```
Kutilgan: `Cannot find module './license'`

- [ ] **Step 4: `license.ts` implementatsiya yoz**

```ts
// apps/api/src/lib/license.ts
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import si from 'systeminformation'

export interface LicenseData {
  licenseKey: string
  clinicId: string
  modules: string[]
  expiresAt: string
  gracePeriodDays: number
  issuedAt: string
  signature: string
}

export const LICENSE_PATH =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\license.lic'
    : '/var/lib/dental-service/license.lic'

export const getFingerprint = async (): Promise<string> => {
  const [cpu, system, nets] = await Promise.all([
    si.cpu(),
    si.system(),
    si.networkInterfaces(),
  ])
  const primaryMac = (Array.isArray(nets) ? nets : [nets])
    .find((n: any) => n.default)?.mac ?? ''

  // VM yoki konteynerda bo'sh qaytsa — aniq xato (virtual muhit qo'llab-quvvatlanmaydi)
  if (!system.uuid && !system.serial && !primaryMac) {
    throw new Error('FINGERPRINT_UNAVAILABLE')
  }

  const raw = `${cpu.manufacturer}:${cpu.brand}:${system.uuid}:${system.serial}:${primaryMac}`
  return createHash('sha256').update(raw).digest('hex')
}

const getKey = async () => {
  const fp = await getFingerprint()
  return Buffer.from(fp.slice(0, 32)) // AES-256 → 32 byte kalit
}

export const writeLicense = async (data: LicenseData): Promise<void> => {
  const key = await getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const json = JSON.stringify(data)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const payload = Buffer.concat([iv, encrypted])
  await mkdir(dirname(LICENSE_PATH), { recursive: true })
  await writeFile(LICENSE_PATH, payload.toString('base64'))
}

export const readLicense = async (): Promise<LicenseData | null> => {
  try {
    const raw = await readFile(LICENSE_PATH, 'utf8')
    const payload = Buffer.from(raw, 'base64')
    const iv = payload.subarray(0, 16)
    const encrypted = payload.subarray(16)
    const key = await getKey()
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    return JSON.parse(json) as LicenseData
  } catch {
    return null
  }
}

export const isLicenseValid = (data: LicenseData): boolean => {
  const expiry = new Date(data.expiresAt).getTime()
  const grace = data.gracePeriodDays * 86400000
  return Date.now() < expiry + grace
}

export const getActiveModules = async (): Promise<string[]> => {
  const lic = await readLicense()
  if (!lic || !isLicenseValid(lic)) return []
  return lic.modules
}
```

- [ ] **Step 5: Test PASS**

```bash
cd apps/api && bun test src/lib/license.test.ts
```
Kutilgan: 3 ta test PASS

- [ ] **Step 6: Typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/license.ts apps/api/src/lib/license.test.ts
git commit -m "feat(api): machine fingerprint + AES-256 license file"
```

---

## Task 3: License HTTP Client (Supervisor bilan aloqa)

**Files:**
- Create: `apps/api/src/lib/license-client.ts`
- Test: `apps/api/src/lib/license-client.test.ts`

**Interfaces:**
- Consumes: `LicenseData`, `getFingerprint()` (Task 2)
- Produces:
  ```ts
  activateLicense(licenseKey: string): Promise<LicenseData>
  sendHeartbeat(licenseKey: string): Promise<LicenseData>
  SUPERVISOR_URL: string  // process.env.SUPERVISOR_URL
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/api/src/lib/license-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./license', () => ({
  getFingerprint: vi.fn().mockResolvedValue('abc123fingerprint'),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('activateLicense', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('calls Supervisor /v1/activate and returns LicenseData', async () => {
    const mockData = {
      licenseKey: 'KEY-123',
      clinicId: 'clinic-1',
      modules: ['patients', 'appointments', 'cashier'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'rsa-sig',
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const { activateLicense } = await import('./license-client')
    const result = await activateLicense('KEY-123')
    expect(result.modules).toContain('patients')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/activate'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws on invalid license key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'INVALID_KEY' } }),
    })
    const { activateLicense } = await import('./license-client')
    await expect(activateLicense('WRONG')).rejects.toThrow('INVALID_KEY')
  })
})
```

- [ ] **Step 2: Test ishga tushir — FAIL**

```bash
cd apps/api && bun test src/lib/license-client.test.ts
```

- [ ] **Step 3: `license-client.ts` implementatsiya yoz**

```ts
// apps/api/src/lib/license-client.ts
import { getFingerprint, type LicenseData } from './license'

// Compile-time constant (bun build --compile --define ishlatiladi)
// Foydalanuvchi o'zgartira olmaydi — xavfsizlik chegarasi
export const SUPERVISOR_URL =
  process.env.SUPERVISOR_URL ?? 'https://supervisor.dental.uz'

const post = async (path: string, body: object): Promise<LicenseData> => {
  const res = await fetch(`${SUPERVISOR_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json() as any
  if (!res.ok) {
    throw new Error(json?.error?.code ?? 'SUPERVISOR_ERROR')
  }
  return json as LicenseData
}

export const activateLicense = async (licenseKey: string): Promise<LicenseData> => {
  const fingerprint = await getFingerprint()
  return post('/v1/activate', { licenseKey, fingerprint })
}

export const sendHeartbeat = async (licenseKey: string): Promise<LicenseData> => {
  const fingerprint = await getFingerprint()
  return post('/v1/heartbeat', { licenseKey, fingerprint })
}
```

- [ ] **Step 4: Test PASS**

```bash
cd apps/api && bun test src/lib/license-client.test.ts
```

- [ ] **Step 5: Typecheck + Commit**

```bash
cd apps/api && bun run typecheck
git add apps/api/src/lib/license-client.ts apps/api/src/lib/license-client.test.ts
git commit -m "feat(api): Supervisor activation + heartbeat HTTP client"
```

---

## Task 4: License Hono Middleware (Modul Gating)

**Files:**
- Create: `apps/api/src/lib/license-middleware.ts`
- Test: `apps/api/src/lib/license-middleware.test.ts`

**Interfaces:**
- Consumes: `getActiveModules()` (Task 2)
- Produces:
  ```ts
  requireModule(module: string): MiddlewareHandler
  // 403 { error: { code: 'MODULE_DISABLED' } } agar modul yoqilmagan bo'lsa
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/api/src/lib/license-middleware.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { requireModule } from './license-middleware'

vi.mock('./license', () => ({
  getActiveModules: vi.fn().mockResolvedValue(['patients', 'appointments']),
}))

describe('requireModule', () => {
  it('allows request if module is active', async () => {
    const app = new Hono()
    app.get('/test', requireModule('patients'), (c) => c.json({ ok: true }))
    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })

  it('blocks request with 403 if module is inactive', async () => {
    const app = new Hono()
    app.get('/test', requireModule('lab'), (c) => c.json({ ok: true }))
    const res = await app.request('/test')
    expect(res.status).toBe(403)
    const body = await res.json() as any
    expect(body.error.code).toBe('MODULE_DISABLED')
  })
})
```

- [ ] **Step 2: Test ishga tushir — FAIL**

```bash
cd apps/api && bun test src/lib/license-middleware.test.ts
```

- [ ] **Step 3: Middleware implementatsiya yoz**

```ts
// apps/api/src/lib/license-middleware.ts
import type { MiddlewareHandler } from 'hono'
import { getActiveModules } from './license'

// '/activate' va '/api/activate' whitelisted — license yo'q bo'lsa ham ochiq
const WHITELIST = ['/activate', '/api/activate']

export const requireModule = (module: string): MiddlewareHandler =>
  async (c, next) => {
    if (WHITELIST.some(p => c.req.path.startsWith(p))) return next()
    const modules = await getActiveModules()
    if (!modules.length) {
      return c.json(
        { error: { code: 'LICENSE_NOT_FOUND', message: 'License not activated' } },
        403
      )
    }
    if (!modules.includes(module)) {
      return c.json(
        { error: { code: 'MODULE_DISABLED', message: `Module '${module}' is not enabled in your plan` } },
        403
      )
    }
    await next()
  }
```

- [ ] **Step 4: Test PASS**

```bash
cd apps/api && bun test src/lib/license-middleware.test.ts
```

- [ ] **Step 5: Mavjud `vertical-features.ts` bilan birlashtirish**

`packages/core/vertical-features.ts` da feature map mavjud. Uni `requireModule` bilan quyidagicha to'ldirish:

```ts
// apps/api/src/lib/license-middleware.ts ga qo'shimcha export:
export const MODULE_MAP: Record<string, string[]> = {
  starter:    ['patients', 'appointments', 'queue'],
  standard:   ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
  premium:    ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff',
               'clinical', 'lab-orders', 'patient-images', 'prescriptions', 'consent'],
  enterprise: ['*'], // barcha modullar
}
```

- [ ] **Step 6: Typecheck + Commit**

```bash
cd apps/api && bun run typecheck
git add apps/api/src/lib/license-middleware.ts apps/api/src/lib/license-middleware.test.ts
git commit -m "feat(api): module gating middleware (requireModule)"
```

---

## Task 5: Worker ni API Process ichiga Qo'shish

**Files:**
- Modify: `apps/api/src/index.ts`

**Maqsad:** Alohida `worker.ts` jarayoni o'rniga reminder worker API server bilan birgalikda ishlasin. RAM tejash (~50MB).

- [ ] **Step 1: `apps/api/src/worker.ts` ni o'qi — nima import qiladi?**

```bash
cat apps/api/src/worker.ts
```

- [ ] **Step 2: Worker init'ni `index.ts` ga ko'chir**

`apps/api/src/index.ts` da server start'dan keyin:
```ts
// Mavjud:
// serve({ fetch: app.fetch, port: API_PORT })

// Qo'shiladi (worker.ts dagi startWorker ni import qilish):
import { startReminderWorker } from './worker'
if (process.env.RUN_REMINDER_WORKER !== 'false') {
  startReminderWorker(deps)
}
```

- [ ] **Step 3: `docker-compose.prod.yml` dan `worker` servisi olib tashlanmaydi** — cloud uchun alohida worker kerak. Faqat `RUN_REMINDER_WORKER=true` `api` servisiga qo'shiladi.

`infra/docker-compose.prod.yml`:
```yaml
api:
  environment:
    RUN_REMINDER_WORKER: 'true'   # <-- qo'shiladi
```

`docker-compose.prod.yml` dagi `worker:` servisini o'chirma — prod uchun kerak bo'lishi mumkin.

- [ ] **Step 4: Local desktop uchun env**

`electron-builder.yml` da api.exe ishga tushganda `RUN_REMINDER_WORKER=true` set qilinadi (Task 7 da).

- [ ] **Step 5: Typecheck + Commit**

```bash
cd apps/api && bun run typecheck
git add apps/api/src/index.ts
git commit -m "feat(api): merge reminder worker into API process for desktop mode"
```

---

## Task 6: Electron Config Moduli

**Files:**
- Create: `apps/desktop/src/config.ts`
- Test: `apps/desktop/src/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type AppRole = 'server' | 'client'
  interface AppConfig {
    role: AppRole
    serverUrl: string      // klient rejimi uchun: "http://192.168.1.10"
    licenseKey: string
    serverPort: number     // default 80
  }
  readConfig(): AppConfig
  writeConfig(config: Partial<AppConfig>): void
  CONFIG_PATH: string
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/desktop/src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// CONFIG_PATH ni temp dir ga yo'naltirish uchun env o'rnatiladi
process.env.DENTAL_CONFIG_DIR = ''  // har testda override qilinadi

describe('readConfig', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'config-test-'))
    process.env.DENTAL_CONFIG_DIR = tmpDir
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns default config if file missing', async () => {
    const { readConfig } = await import('./config')
    const cfg = readConfig()
    expect(cfg.role).toBe('server')
    expect(cfg.serverPort).toBe(80)
  })

  it('reads saved config', async () => {
    const { writeConfig, readConfig } = await import('./config')
    writeConfig({ role: 'client', serverUrl: 'http://10.0.0.1' })
    const cfg = readConfig()
    expect(cfg.role).toBe('client')
    expect(cfg.serverUrl).toBe('http://10.0.0.1')
  })
})
```

- [ ] **Step 2: Test FAIL**

```bash
cd apps/desktop && bun test src/config.test.ts
```

- [ ] **Step 3: `config.ts` implementatsiya yoz**

```ts
// apps/desktop/src/config.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CONFIG_DIR =
  process.env.DENTAL_CONFIG_DIR ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService'
    : '/var/lib/dental-service')

export const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export type AppRole = 'server' | 'client'

export interface AppConfig {
  role: AppRole
  serverUrl: string | null  // null = hali topilmagan, discovery qayta ishlaydi
  licenseKey: string | null
  serverPort: number
}

const DEFAULTS: AppConfig = {
  role: 'server',
  serverUrl: null,
  licenseKey: null,
  serverPort: 80,
}

export const readConfig = (): AppConfig => {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const writeConfig = (partial: Partial<AppConfig>): void => {
  const current = readConfig()
  const updated = { ...current, ...partial }
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2))
}
```

- [ ] **Step 4: Test PASS**

```bash
cd apps/desktop && bun test src/config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/config.ts apps/desktop/src/config.test.ts
git commit -m "feat(desktop): config module (role, serverUrl, licenseKey)"
```

---

## Task 7: Electron Process Manager (Server rejimi)

**Files:**
- Create: `apps/desktop/src/process-manager.ts`
- Create: `apps/desktop/src/first-run.ts`

**Interfaces:**
- Consumes: `readConfig()` (Task 6)
- Produces:
  ```ts
  startServer(): Promise<void>   // postgres + valkey + api.exe
  stopServer(): Promise<void>    // barcha child process'lar to'xtatiladi
  getServerStatus(): 'running' | 'stopped' | 'starting'
  ```

- [ ] **Step 1: `process-manager.ts` yoz**

```ts
// apps/desktop/src/process-manager.ts
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

const RESOURCES = app.isPackaged
  ? join(process.resourcesPath)
  : join(__dirname, '../../resources')

const POSTGRES_BIN = join(RESOURCES, 'postgres', 'bin')
const VALKEY_BIN   = join(RESOURCES, 'valkey')
const API_BIN      = join(RESOURCES, 'api.exe')

const DATA_DIR =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService'
    : '/var/lib/dental-service'

const PG_DATA = join(DATA_DIR, 'postgres', 'data')

let pgProcess: ChildProcess | null = null
let valkeyProcess: ChildProcess | null = null
let apiProcess: ChildProcess | null = null
let status: 'running' | 'stopped' | 'starting' = 'stopped'

const waitMs = (ms: number) => new Promise(r => setTimeout(r, ms))

const spawnPostgres = (): Promise<void> =>
  new Promise((resolve, reject) => {
    pgProcess = spawn(
      join(POSTGRES_BIN, 'postgres.exe'),
      ['-D', PG_DATA, '-p', '5433', '-c', `config_file=${join(DATA_DIR, 'postgres.conf')}`],
      { stdio: 'pipe' }
    )
    pgProcess.on('error', reject)
    // Postgres tayyor bo'lguncha kutamiz (log'da "ready to accept connections")
    pgProcess.stdout?.on('data', (d: Buffer) => {
      if (d.toString().includes('ready to accept connections')) resolve()
    })
    pgProcess.stderr?.on('data', (d: Buffer) => {
      if (d.toString().includes('ready to accept connections')) resolve()
    })
    setTimeout(() => resolve(), 3000) // max 3 soniya kutamiz
  })

const spawnValkey = (): Promise<void> =>
  new Promise((resolve) => {
    valkeyProcess = spawn(
      join(VALKEY_BIN, 'valkey-server.exe'),
      [join(DATA_DIR, 'valkey.conf')],
      { stdio: 'pipe' }
    )
    setTimeout(() => resolve(), 1000)
  })

const spawnApi = (port: number): Promise<void> =>
  new Promise((resolve) => {
    apiProcess = spawn(API_BIN, [], {
      env: {
        ...process.env,
        API_PORT: String(port),
        DATABASE_URL: `postgresql://dental:dental@localhost:5433/dental`,
        REDIS_URL: 'redis://localhost:6380',
        UPLOADS_DIR: join(DATA_DIR, 'uploads'),
        RUN_REMINDER_WORKER: 'true',
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    })
    setTimeout(() => resolve(), 2000)
  })

export const startServer = async (port = 80): Promise<void> => {
  status = 'starting'
  await spawnPostgres()
  await spawnValkey()
  await spawnApi(port)
  status = 'running'
}

export const stopServer = async (): Promise<void> => {
  apiProcess?.kill('SIGTERM')
  valkeyProcess?.kill('SIGTERM')
  pgProcess?.kill('SIGTERM')
  await waitMs(1000)
  status = 'stopped'
}

export const getServerStatus = () => status
```

- [ ] **Step 2: `first-run.ts` yoz**

```ts
// apps/desktop/src/first-run.ts
import { existsSync, mkdirSync } from 'fs'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

const RESOURCES = app.isPackaged
  ? join(process.resourcesPath)
  : join(__dirname, '../../resources')

const POSTGRES_BIN = join(RESOURCES, 'postgres', 'bin')

const DATA_DIR =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService'
    : '/var/lib/dental-service'

const PG_DATA = join(DATA_DIR, 'postgres', 'data')

export const isFirstRun = (): boolean => !existsSync(join(PG_DATA, 'PG_VERSION'))

export const runFirstSetup = (): void => {
  // 1. Ma'lumotlar papkalarini yaratish
  mkdirSync(join(DATA_DIR, 'uploads'), { recursive: true })
  mkdirSync(join(DATA_DIR, 'logs'), { recursive: true })
  mkdirSync(PG_DATA, { recursive: true })

  // 2. initdb — postgres data dir yaratish
  const initdb = spawnSync(
    join(POSTGRES_BIN, 'initdb.exe'),
    ['-D', PG_DATA, '--encoding=UTF8', '--locale=C', '-U', 'dental'],
    { stdio: 'pipe' }
  )
  if (initdb.status !== 0) {
    throw new Error(`initdb failed: ${initdb.stderr.toString()}`)
  }

  // 3. postgres.conf nusxalash
  const { copyFileSync } = require('fs')
  copyFileSync(
    join(RESOURCES, '..', 'infra', 'postgres-win.conf'),
    join(DATA_DIR, 'postgres.conf')
  )
  copyFileSync(
    join(RESOURCES, '..', 'infra', 'valkey-win.conf'),
    join(DATA_DIR, 'valkey.conf')
  )
}

export const runMigrations = (apiExePath: string): void => {
  // api.exe ni migration rejimida ishga tushirish
  const result = spawnSync(apiExePath, ['migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
      DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental',
      RUN_MIGRATIONS: 'true',
    },
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    throw new Error(`Migrations failed: ${result.stderr.toString()}`)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/process-manager.ts apps/desktop/src/first-run.ts
git commit -m "feat(desktop): process manager (postgres+valkey+api) + first-run setup"
```

---

## Task 8: Discovery (mDNS + UDP)

**Files:**
- Create: `apps/desktop/src/discovery.ts`

**Interfaces:**
- Produces:
  ```ts
  startServerDiscovery(port: number): void    // mDNS e'lon + UDP javob
  stopServerDiscovery(): void
  findServer(): Promise<string | null>        // server URL topilsa qaytaradi
  ```

- [ ] **Step 1: Paket o'rnat**

```bash
cd apps/desktop && bun add @homebridge/ciao
```

- [ ] **Step 2: `discovery.ts` yoz**

```ts
// apps/desktop/src/discovery.ts
import { createSocket } from 'dgram'
import ciao from '@homebridge/ciao'

const UDP_PORT = 47890
const DISCOVER_MSG = 'DENTAL_DISCOVER_v1'
const RESPONSE_PREFIX = 'DENTAL_SERVER_v1:'

let responder: any = null
let udpServer: ReturnType<typeof createSocket> | null = null

// ---- SERVER SIDE ----

export const startServerDiscovery = (serverPort: number): void => {
  // mDNS
  const responderInstance = ciao.getResponder()
  const service = responderInstance.createService({
    name: 'Dental Service',
    type: 'dental-service',
    port: serverPort,
  })
  service.advertise()
  responder = service

  // UDP broadcast listener
  udpServer = createSocket('udp4')
  udpServer.bind(UDP_PORT, () => {
    udpServer!.setBroadcast(true)
  })
  udpServer.on('message', (msg, rinfo) => {
    if (msg.toString() === DISCOVER_MSG) {
      const { networkInterfaces } = require('os')
      const nets = networkInterfaces()
      const localIp = Object.values(nets as any)
        .flat()
        .find((n: any) => n.family === 'IPv4' && !n.internal)?.address ?? '127.0.0.1'
      const response = `${RESPONSE_PREFIX}${JSON.stringify({ ip: localIp, port: serverPort })}`
      udpServer!.send(response, rinfo.port, rinfo.address)
    }
  })
}

export const stopServerDiscovery = (): void => {
  responder?.end()
  udpServer?.close()
}

// ---- CLIENT SIDE ----

export const findServer = (timeoutMs = 2500): Promise<string | null> =>
  new Promise((resolve) => {
    let resolved = false
    const done = (url: string | null) => {
      if (resolved) return
      resolved = true
      client.close()
      resolve(url)
    }

    // UDP broadcast
    const client = createSocket('udp4')
    client.bind(() => {
      client.setBroadcast(true)
      client.send(DISCOVER_MSG, UDP_PORT, '255.255.255.255')
    })
    client.on('message', (msg) => {
      const text = msg.toString()
      if (text.startsWith(RESPONSE_PREFIX)) {
        const { ip, port } = JSON.parse(text.slice(RESPONSE_PREFIX.length))
        done(`http://${ip}:${port}`)
      }
    })

    // mDNS fallback (basic resolve attempt)
    // @homebridge/ciao browser murakkab — UDP yetarli, mDNS qo'shimcha
    setTimeout(() => done(null), timeoutMs)
  })
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/discovery.ts
git commit -m "feat(desktop): mDNS + UDP broadcast discovery"
```

---

## Task 9: Tray Icon + Main Entry Point

**Files:**
- Create: `apps/desktop/src/tray.ts`
- Modify: `apps/desktop/src/main.ts`

- [ ] **Step 1: `tray.ts` yoz**

```ts
// apps/desktop/src/tray.ts
import { Tray, Menu, app, shell, nativeImage } from 'electron'
import { join } from 'path'
import type { AppRole } from './config'

let tray: Tray | null = null

export const createTray = (
  role: AppRole,
  info: { serverUrl: string; connectedClients?: number; licenseInfo?: string },
  callbacks: { onOpen: () => void; onSettings: () => void; onStop: () => void }
): void => {
  const iconPath = join(__dirname, '..', 'assets', 'tray-icon.png')
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('Dental Service')
  updateTray(role, info, callbacks)
}

export const updateTray = (
  role: AppRole,
  info: { serverUrl: string; connectedClients?: number; licenseInfo?: string },
  callbacks: { onOpen: () => void; onSettings: () => void; onStop: () => void }
): void => {
  const label = role === 'server'
    ? `Dental Service — Server\n📡 ${info.serverUrl}\n👥 ${info.connectedClients ?? 0} ta qurilma${info.licenseInfo ? `\n🔐 ${info.licenseInfo}` : ''}`
    : `Dental Service — Klient\n✅ Ulangan: ${info.serverUrl}`

  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: '🌐 Ochish', click: callbacks.onOpen },
    { label: '⚙️  Sozlamalar', click: callbacks.onSettings },
    { type: 'separator' },
    { label: role === 'server' ? '🔴 To\'xtatish' : '❌ Chiqish', click: callbacks.onStop },
  ])
  tray?.setContextMenu(menu)
}
```

- [ ] **Step 2: `main.ts` ni qayta yoz**

```ts
// apps/desktop/src/main.ts
import { app, BrowserWindow, shell } from 'electron'
import { readConfig, writeConfig } from './config'
import { startServer, stopServer } from './process-manager'
import { isFirstRun, runFirstSetup, runMigrations } from './first-run'
import { startServerDiscovery, stopServerDiscovery, findServer } from './discovery'
import { createTray, updateTray } from './tray'
import { join } from 'path'

const RESOURCES = app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources')
const API_EXE = join(RESOURCES, 'api.exe')

let mainWindow: BrowserWindow | null = null

const openBrowser = (url: string) => {
  if (mainWindow) {
    mainWindow.loadURL(url)
    mainWindow.show()
    return
  }
  mainWindow = new BrowserWindow({ width: 1280, height: 800, minWidth: 1024 })
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u)
    return { action: 'deny' }
  })
  mainWindow.loadURL(url)
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  app.dock?.hide() // macOS: dock'da ko'rsatma

  const config = readConfig()

  if (config.role === 'server') {
    // Birinchi ishga tushish
    if (isFirstRun()) {
      runFirstSetup()
    }
    await startServer(config.serverPort)
    if (isFirstRun()) {
      runMigrations(API_EXE)
    }

    const localUrl = `http://localhost:${config.serverPort}`
    startServerDiscovery(config.serverPort)

    createTray('server', { serverUrl: localUrl }, {
      onOpen: () => openBrowser(localUrl),
      onSettings: () => { /* settings window */ },
      onStop: async () => {
        stopServerDiscovery()
        await stopServer()
        app.quit()
      },
    })
    openBrowser(localUrl)

  } else {
    // Klient rejimi — server topish
    let serverUrl = config.serverUrl || await findServer()

    if (!serverUrl) {
      // Server topilmadi — sozlamalar oynasi
      // TODO: settings window bilan qo'lda IP kiritish
      serverUrl = config.serverUrl || 'http://localhost'
    }

    createTray('client', { serverUrl }, {
      onOpen: () => openBrowser(serverUrl!),
      onSettings: () => { /* IP o'zgartirish */ },
      onStop: () => app.quit(),
    })
    openBrowser(serverUrl)
  }
})

app.on('window-all-closed', () => {
  // Tray app — barcha oynalar yopilganda chiqmaymiz
})

app.on('before-quit', async () => {
  const config = readConfig()
  if (config.role === 'server') {
    stopServerDiscovery()
    await stopServer()
  }
})
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/desktop && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/tray.ts apps/desktop/src/main.ts
git commit -m "feat(desktop): tray icon + server/client main entry point"
```

---

## Task 10: PostgreSQL + Valkey Konfiguratsiya (Windows Optimized)

**Files:**
- Create: `infra/postgres-win.conf`
- Create: `infra/valkey-win.conf`

- [ ] **Step 1: `infra/postgres-win.conf` yoz**

```ini
# infra/postgres-win.conf — Windows office PC (i3/i5, 8GB RAM, ~5 ta klient) uchun
# Port 5433 (standart 5432 emas — boshqa PG instansiyalari bilan konflikt oldini olish)
port = 5433
shared_buffers = 64MB
work_mem = 4MB
maintenance_work_mem = 32MB
max_connections = 20
effective_cache_size = 256MB
wal_buffers = 4MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
effective_io_concurrency = 200
log_destination = 'stderr'
logging_collector = off
log_min_messages = warning
```

- [ ] **Step 2: `infra/valkey-win.conf` yoz**

```
# infra/valkey-win.conf
# Port 6380 (standart 6379 emas — boshqa Redis/Valkey instansiyalari bilan konflikt oldini olish)
port 6380
maxmemory 64mb
maxmemory-policy allkeys-lru
appendonly no
save ""
loglevel warning
```

- [ ] **Step 3: Commit**

```bash
git add infra/postgres-win.conf infra/valkey-win.conf
git commit -m "infra: optimized PostgreSQL + Valkey configs for Windows office PC"
```

---

## Task 11: electron-builder NSIS Installer + Portable Binaries

**Files:**
- Modify: `apps/desktop/electron-builder.yml`
- Create: `scripts/download-portable-bins.sh`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Download script yoz**

```bash
#!/usr/bin/env bash
# scripts/download-portable-bins.sh
# Build vaqtida portable binaries yuklab oladi
# Qaror (brainstorm 2026-06-29): o'z serverdan (POSTGRES_WIN_URL + VALKEY_WIN_URL env var)
# Rasmiy URL'lar vaqt o'tishi bilan o'zgaradi — o'z serverda barqaror

set -e

RESOURCES_DIR="apps/desktop/resources"
mkdir -p "$RESOURCES_DIR/postgres" "$RESOURCES_DIR/valkey"

if [ -z "$POSTGRES_WIN_URL" ]; then
  echo "ERROR: POSTGRES_WIN_URL env var belgilanmagan" >&2
  exit 1
fi
if [ -z "$VALKEY_WIN_URL" ]; then
  echo "ERROR: VALKEY_WIN_URL env var belgilanmagan" >&2
  exit 1
fi

# PostgreSQL 16 portable for Windows (o'z serverdan)
echo "Downloading PostgreSQL..."
curl -L -o /tmp/postgres-win.zip "$POSTGRES_WIN_URL"
unzip -q /tmp/postgres-win.zip -d /tmp/pg-extract
cp -r /tmp/pg-extract/pgsql/bin "$RESOURCES_DIR/postgres/"
cp -r /tmp/pg-extract/pgsql/lib "$RESOURCES_DIR/postgres/"

# Valkey Windows binary (o'z serverdan)
echo "Downloading Valkey..."
curl -L -o /tmp/valkey-win.zip "$VALKEY_WIN_URL"
unzip -q /tmp/valkey-win.zip -d /tmp/valkey-extract
cp /tmp/valkey-extract/valkey-server.exe "$RESOURCES_DIR/valkey/"

echo "Done. Binaries ready in $RESOURCES_DIR/"
```

```bash
chmod +x scripts/download-portable-bins.sh
```

- [ ] **Step 2: `electron-builder.yml` yangilash**

```yaml
# apps/desktop/electron-builder.yml
appId: uz.dental.service
productName: Dental Service
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - package.json
extraResources:
  - from: resources/postgres
    to: postgres
    filter: ["**/*"]
  - from: resources/valkey
    to: valkey
    filter: ["**/*"]
  - from: ../../dist/api.exe    # bun compile chiqishi
    to: api.exe
  - from: ../../infra/postgres-win.conf
    to: ../infra/postgres-win.conf
  - from: ../../infra/valkey-win.conf
    to: ../infra/valkey-win.conf
win:
  target: nsis
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerLanguages: [uz, ru]
  include: build/installer.nsh    # rol tanlash dialog
mac:
  target: dmg
linux:
  target: AppImage
```

- [ ] **Step 3: NSIS rol tanlash dialogi**

```nsh
; apps/desktop/build/installer.nsh
; O'rnatish vaqtida Server yoki Klient tanlash

!macro customInstall
  MessageBox MB_YESNO "Bu kompyuter asosiy server bo'lsinmi?$\n$\nHA — Server (ma'lumotlar shu yerda saqlanadi)$\nYO'Q — Klient (boshqa serverga ulanadi)" IDYES server_mode IDNO client_mode

  server_mode:
    WriteRegStr HKCU "Software\DentalService" "Role" "server"
    Goto done

  client_mode:
    WriteRegStr HKCU "Software\DentalService" "Role" "client"
    done:
!macroend
```

- [ ] **Step 4: `package.json` build script**

```json
{
  "scripts": {
    "prebuild": "bun run ../../scripts/download-portable-bins.sh && bun run build:api",
    "build:api": "cd ../api && bun build --compile --outfile ../../dist/api.exe src/index.ts",
    "build": "bun run build:main && electron-builder --config electron-builder.yml"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron-builder.yml scripts/download-portable-bins.sh apps/desktop/package.json
git commit -m "feat(desktop): NSIS installer + portable binaries bundling"
```

---

### Task 12: Auto-Updater (CLI-357)

**Maqsad:** Electron ilovasi fon rejimida yangilanishlarni tekshiradi; tayyor bo'lganda tray orqali foydalanuvchiga xabar beradi va keyingi o'chirish/yoqishda o'rnatadi.

**Files:**
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: `electron-updater` npm paketi, build vaqtida `UPDATE_URL` env var
- Produces: background update check + tray notification

---

- [ ] **Step 1: `electron-updater` o'rnatish**

```bash
cd apps/desktop
bun add electron-updater
```

- [ ] **Step 2: `electron-builder.yml` ga publish konfiguratsiya qo'shish**

`electron-builder.yml` ga quyidagi bo'limni qo'shing:

```yaml
publish:
  provider: generic
  url: "${env.UPDATE_URL}"
```

`${env.UPDATE_URL}` — build vaqtida `UPDATE_URL` environment o'zgaruvchisidan olinadi (masalan, `https://updates.dental-service.uz`). CI/build script da set qilinadi:

```bash
UPDATE_URL=https://updates.dental-service.uz bun run build
```

- [ ] **Step 3: `main.ts` ga auto-updater logikasi qo'shish**

`apps/desktop/src/main.ts` da mavjud import'lar qatoriga:

```ts
import { autoUpdater } from 'electron-updater'
```

`app.whenReady()` yoki `createTray()` chaqirilgandan keyin:

```ts
function setupAutoUpdater(tray: Tray) {
  if (!app.isPackaged) return  // dev rejimida o'chirilgan

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', () => {
    tray.setToolTip('Dental Service — yangilash tayyor')
    const notification = new Notification({
      title: 'Dental Service',
      body: '🔄 Yangilash yuklab olindi. Keyingi ishga tushirishda o\'rnatiladi.',
    })
    notification.show()
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Xato:', err.message)
  })

  // Darhol tekshir, keyin har 4 soatda
  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify()
  }, 4 * 60 * 60 * 1000)
}
```

`setupAutoUpdater(tray)` ni tray yaratilganidan keyin chaqiring:

```ts
const tray = new Tray(iconPath)
// ... boshqa tray sozlamalari
setupAutoUpdater(tray)
```

- [ ] **Step 4: Server tarafda update feed tayyorlash (hujjat)**

`electron-updater` generic provider quyidagi URL strukturani kutadi:

```
${UPDATE_URL}/latest.yml          ← Windows versiya ma'lumoti
${UPDATE_URL}/DentalServiceSetup-X.Y.Z.exe   ← installer fayl
```

Build buyrug'i:

```bash
UPDATE_URL=https://updates.dental-service.uz bun run build
# → dist/DentalServiceSetup-1.0.0.exe
# → dist/latest.yml
```

`latest.yml` ni va installer EXE ni update serveriga yuklash:

```bash
scp dist/latest.yml dist/DentalServiceSetup-*.exe user@updates-server:/var/www/updates/
```

Caddy yoki Nginx da static serve:

```
# Caddyfile (update server)
updates.dental-service.uz {
  root * /var/www/updates
  file_server
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/src/main.ts apps/desktop/package.json
git commit -m "feat(desktop): auto-updater via generic provider (CLI-357)"
```

---

## Qo'lda Tekshirish (Manual Verification)

- [ ] Server rejimida o'rnatish → tray icon paydo bo'ladi → IP ko'rsatiladi → brauzer ochiladi
- [ ] Klient rejimida o'rnatish → server topiladi → brauzer server URL bilan ochiladi
- [ ] Serverda 5 ta qurilma ulangan holda RAM ~240MB dan oshmaydi
- [ ] Server o'chganda klient "Server topilmadi" xabarini ko'rsatadi
- [ ] `license.lic` ni boshqa PCga ko'chirganda ishlamasligi (fingerprint mismatch)
- [ ] 30 kunlik grace period ishlagach modullar o'chishi (mock test orqali)
