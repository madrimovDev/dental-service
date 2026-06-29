# Supervisor Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ **Bu alohida repo** — `supervisor-service/` (dental-service'dan mustaqil)

**Goal:** Developer boshqaradigan central Supervisor service — klinikalar litsenziyasini boshqarish, modul gating, grace period sozlash, reactivation.

**Architecture:** Hono API (VPS'da Docker + Caddy), React admin panel. Dental Service har 24 soatda `/v1/heartbeat` chaqiradi. RSA imzo bilan `.lic` fayllari imzolanadi. VPS'da PostgreSQL + Caddy (TLS).

**Tech Stack:** Bun + Hono, Drizzle + PostgreSQL, React + Vite + Mantine, Docker + Caddy (VPS), node-forge (RSA), Vitest

## Global Constraints

- TypeScript strict mode
- Bun runtime
- Drizzle ORM (PostgreSQL)
- Biome lint
- Vitest testlar
- Hono factory DI pattern (CLAUDE.md §3.5)
- Barcha API endpoint HTTPS only (production)

---

## Fayl xaritasi (yangi repo)

```
supervisor-service/
├── apps/
│   ├── api/                    # Hono backend
│   │   └── src/
│   │       ├── index.ts        # Entry point
│   │       ├── db/
│   │       │   ├── schema.ts   # Drizzle schema
│   │       │   └── migrate.ts
│   │       ├── lib/
│   │       │   └── rsa.ts      # RSA imzolash
│   │       └── modules/
│   │           ├── clinics/    # Klinika CRUD
│   │           ├── licenses/   # Activate, heartbeat, reactivate
│   │           └── modules/    # Modul on/off
│   └── admin/                  # React admin panel
│       └── src/
│           ├── main.tsx
│           ├── features/
│           │   ├── clinics/
│           │   └── licenses/
│           └── components/
├── infra/
│   ├── docker-compose.yml      # Dev
│   ├── docker-compose.prod.yml # VPS prod
│   └── Caddyfile
├── package.json
└── turbo.json
```

---

## Task 1: Repo Scaffolding + DB Schema

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `package.json`, `turbo.json`, `infra/docker-compose.yml`

- [ ] **Step 1: Yangi repo yaratish**

```bash
mkdir supervisor-service && cd supervisor-service
git init
mkdir -p apps/api/src/db apps/api/src/lib apps/api/src/modules/clinics apps/api/src/modules/licenses apps/api/src/modules/modules
mkdir -p apps/admin/src infra
```

- [ ] **Step 2: `package.json` (root)**

```json
{
  "name": "supervisor-service",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "@biomejs/biome": "^1.8.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 3: `apps/api/package.json`**

```json
{
  "name": "@supervisor/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build": "bun build --compile --outfile dist/api src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run src/db/migrate.ts"
  },
  "dependencies": {
    "hono": "^4.5.0",
    "drizzle-orm": "^0.32.0",
    "postgres": "^3.4.0",
    "node-forge": "^1.3.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@hono/zod-validator": "^0.3.0",
    "drizzle-kit": "^0.23.0",
    "vitest": "^2.0.0",
    "@types/node-forge": "^1.3.11",
    "bun-types": "latest"
  }
}
```

- [ ] **Step 4: DB Schema yoz**

```ts
// apps/api/src/db/schema.ts
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core'

export const clinics = pgTable('clinics', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const licenses = pgTable('licenses', {
  id:               uuid('id').primaryKey().defaultRandom(),
  clinicId:         uuid('clinic_id').notNull().references(() => clinics.id),
  licenseKey:       text('license_key').notNull().unique(),
  fingerprint:      text('fingerprint'),           // machine fingerprint (SHA-256)
  plan:             text('plan').notNull(),         // 'starter'|'standard'|'premium'|'enterprise'
  modules:          jsonb('modules').notNull().$type<string[]>(),
  gracePeriodDays:  integer('grace_period_days').notNull().default(30),
  expiresAt:        timestamp('expires_at').notNull(),
  isActive:         boolean('is_active').notNull().default(true),
  lastHeartbeatAt:  timestamp('last_heartbeat_at'),
  activatedAt:      timestamp('activated_at'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
})

// Litsenziya tarixi (reactivation log)
export const licenseEvents = pgTable('license_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  licenseId:   uuid('license_id').notNull().references(() => licenses.id),
  event:       text('event').notNull(), // 'activated'|'heartbeat'|'reactivated'|'deactivated'
  fingerprint: text('fingerprint'),
  metadata:    jsonb('metadata'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 5: Migrate yoz**

```ts
// apps/api/src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!)
const db = drizzle(sql)
await migrate(db, { migrationsFolder: './drizzle' })
await sql.end()
console.log('Migrations done')
```

- [ ] **Step 6: Migration generatsiya**

```bash
cd apps/api && bun run db:generate
```

- [ ] **Step 7: Dev infra**

```yaml
# infra/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: supervisor
      POSTGRES_PASSWORD: supervisor_dev
      POSTGRES_DB: supervisor
    ports: ["5433:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
volumes:
  postgres_data:
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: initial supervisor-service scaffold + DB schema"
```

---

## Task 2: RSA Imzolash

**Files:**
- Create: `apps/api/src/lib/rsa.ts`
- Test: `apps/api/src/lib/rsa.test.ts`

**Interfaces:**
- Produces:
  ```ts
  generateKeyPair(): { privateKey: string; publicKey: string }
  signLicense(data: object, privateKey: string): string   // hex signature
  verifySignature(data: object, signature: string, publicKey: string): boolean
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/api/src/lib/rsa.test.ts
import { describe, it, expect } from 'vitest'
import { generateKeyPair, signLicense, verifySignature } from './rsa'

describe('RSA license signing', () => {
  it('sign + verify round-trip', () => {
    const { privateKey, publicKey } = generateKeyPair()
    const data = { clinicId: 'abc', modules: ['patients'], expiresAt: '2027-01-01' }
    const sig = signLicense(data, privateKey)
    expect(verifySignature(data, sig, publicKey)).toBe(true)
  })

  it('rejects tampered data', () => {
    const { privateKey, publicKey } = generateKeyPair()
    const data = { clinicId: 'abc', modules: ['patients'] }
    const sig = signLicense(data, privateKey)
    const tampered = { clinicId: 'abc', modules: ['patients', 'lab'] }
    expect(verifySignature(tampered, sig, publicKey)).toBe(false)
  })
})
```

- [ ] **Step 2: Test FAIL**

```bash
cd apps/api && bun test src/lib/rsa.test.ts
```

- [ ] **Step 3: `rsa.ts` implementatsiya**

```ts
// apps/api/src/lib/rsa.ts
import forge from 'node-forge'

export const generateKeyPair = () => {
  const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 })
  return {
    privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
    publicKey:  forge.pki.publicKeyToPem(keypair.publicKey),
  }
}

const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data).sort())

export const signLicense = (data: object, privateKeyPem: string): string => {
  const key = forge.pki.privateKeyFromPem(privateKeyPem)
  const md = forge.md.sha256.create()
  md.update(canonicalize(data), 'utf8')
  return forge.util.bytesToHex(key.sign(md))
}

export const verifySignature = (
  data: object,
  signature: string,
  publicKeyPem: string
): boolean => {
  try {
    const key = forge.pki.publicKeyFromPem(publicKeyPem)
    const md = forge.md.sha256.create()
    md.update(canonicalize(data), 'utf8')
    return key.verify(md.digest().bytes(), forge.util.hexToBytes(signature))
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Test PASS**

```bash
cd apps/api && bun test src/lib/rsa.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/rsa.ts apps/api/src/lib/rsa.test.ts
git commit -m "feat(api): RSA license signing + verification"
```

---

## Task 3: License API (Activate + Heartbeat + Reactivate)

**Files:**
- Create: `apps/api/src/modules/licenses/licenses.routes.ts`
- Create: `apps/api/src/modules/licenses/licenses.service.ts`
- Test: `apps/api/src/modules/licenses/licenses.test.ts`

**Interfaces:**
- Consumes: `signLicense()` (Task 2), `licenses` DB table (Task 1)
- Produces:
  ```
  POST /v1/activate    { licenseKey, fingerprint } → LicenseResponse
  POST /v1/heartbeat   { licenseKey, fingerprint } → LicenseResponse
  POST /v1/reactivate  { licenseKey, fingerprint } → LicenseResponse  (admin auth kerak)
  ```

  ```ts
  interface LicenseResponse {
    licenseKey: string
    clinicId: string
    modules: string[]
    expiresAt: string
    gracePeriodDays: number
    issuedAt: string
    signature: string
  }
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/api/src/modules/licenses/licenses.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import app from '../../index'

// DB mock
vi.mock('../../db', () => ({
  db: {
    query: {
      licenses: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'lic-1',
          clinicId: 'clinic-1',
          licenseKey: 'VALID-KEY-123',
          fingerprint: null,
          plan: 'standard',
          modules: ['patients', 'appointments', 'cashier'],
          gracePeriodDays: 30,
          expiresAt: new Date(Date.now() + 86400000 * 365),
          isActive: true,
        }),
      },
    },
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn() }),
  },
}))

describe('POST /v1/activate', () => {
  it('activates a valid license key', async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'VALID-KEY-123', fingerprint: 'fp-abc' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.modules).toContain('patients')
    expect(body.signature).toBeTruthy()
  })

  it('returns 403 for unknown key', async () => {
    const { db } = await import('../../db')
    ;(db.query.licenses.findFirst as any).mockResolvedValueOnce(null)
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'WRONG', fingerprint: 'fp' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('POST /v1/heartbeat', () => {
  it('returns updated modules on heartbeat', async () => {
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'VALID-KEY-123', fingerprint: 'fp-abc' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.gracePeriodDays).toBe(30)
  })
})
```

- [ ] **Step 2: Test FAIL**

```bash
cd apps/api && bun test src/modules/licenses/licenses.test.ts
```

- [ ] **Step 3: Service yoz**

```ts
// apps/api/src/modules/licenses/licenses.service.ts
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { licenses, licenseEvents } from '../../db/schema'
import { signLicense } from '../../lib/rsa'

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY! // VPS env'dan

const buildResponse = (lic: typeof licenses.$inferSelect, issuedAt: string) => {
  const payload = {
    licenseKey: lic.licenseKey,
    clinicId: lic.clinicId,
    modules: lic.modules as string[],
    expiresAt: lic.expiresAt.toISOString(),
    gracePeriodDays: lic.gracePeriodDays,
    issuedAt,
  }
  return {
    ...payload,
    signature: signLicense(payload, PRIVATE_KEY),
  }
}

export const createLicenseService = () => ({
  async activate(licenseKey: string, fingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    })
    if (!lic || !lic.isActive) {
      throw Object.assign(new Error('INVALID_KEY'), { status: 403 })
    }
    // Fingerprint bog'lash (birinchi marta)
    if (!lic.fingerprint) {
      await db.update(licenses)
        .set({ fingerprint, activatedAt: new Date(), lastHeartbeatAt: new Date() })
        .where(eq(licenses.id, lic.id))
    } else if (lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 })
    }
    await db.insert(licenseEvents).values({
      licenseId: lic.id, event: 'activated', fingerprint,
    })
    const issuedAt = new Date().toISOString()
    return buildResponse({ ...lic, fingerprint }, issuedAt)
  },

  async heartbeat(licenseKey: string, fingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    })
    if (!lic || !lic.isActive) {
      throw Object.assign(new Error('INVALID_KEY'), { status: 403 })
    }
    if (lic.fingerprint && lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 })
    }
    await db.update(licenses)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(licenses.id, lic.id))
    await db.insert(licenseEvents).values({
      licenseId: lic.id, event: 'heartbeat', fingerprint,
    })
    return buildResponse(lic, new Date().toISOString())
  },

  async reactivate(licenseKey: string, newFingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    })
    if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 404 })
    await db.update(licenses)
      .set({ fingerprint: newFingerprint, lastHeartbeatAt: new Date() })
      .where(eq(licenses.id, lic.id))
    await db.insert(licenseEvents).values({
      licenseId: lic.id, event: 'reactivated', fingerprint: newFingerprint,
      metadata: { previousFingerprint: lic.fingerprint },
    })
    return buildResponse({ ...lic, fingerprint: newFingerprint }, new Date().toISOString())
  },
})
```

- [ ] **Step 4: Routes yoz**

```ts
// apps/api/src/modules/licenses/licenses.routes.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createLicenseService } from './licenses.service'

const activateSchema = z.object({
  licenseKey: z.string().min(1),
  fingerprint: z.string().min(1),
})

export const licensesRoutes = () => {
  const app = new Hono()
  const service = createLicenseService()

  app.post('/activate', zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json')
      const data = await service.activate(licenseKey, fingerprint)
      return c.json(data)
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500)
    }
  })

  app.post('/heartbeat', zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json')
      const data = await service.heartbeat(licenseKey, fingerprint)
      return c.json(data)
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500)
    }
  })

  // Faqat admin token bilan (env'dan ADMIN_TOKEN)
  app.post('/reactivate', async (c) => {
    const token = c.req.header('x-admin-token')
    if (token !== process.env.ADMIN_TOKEN) {
      return c.json({ error: { code: 'UNAUTHORIZED' } }, 401)
    }
    try {
      const { licenseKey, fingerprint } = await c.req.json()
      const data = await service.reactivate(licenseKey, fingerprint)
      return c.json(data)
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500)
    }
  })

  return app
}
```

- [ ] **Step 5: Test PASS**

```bash
cd apps/api && bun test src/modules/licenses/licenses.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/licenses/
git commit -m "feat(api): license activate + heartbeat + reactivate endpoints"
```

---

## Task 4: Clinic + Module Management API (Admin)

**Files:**
- Create: `apps/api/src/modules/clinics/clinics.routes.ts`
- Create: `apps/api/src/modules/modules/modules.routes.ts`

**Admin auth:** Har admin route `x-admin-token` header tekshiradi.

- [ ] **Step 1: Clinics CRUD yoz**

```ts
// apps/api/src/modules/clinics/clinics.routes.ts
import { Hono } from 'hono'
import { db } from '../../db'
import { clinics, licenses } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generateKeyPair } from '../../lib/rsa'
import crypto from 'crypto'

const adminAuth = async (c: any, next: any) => {
  if (c.req.header('x-admin-token') !== process.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401)
  }
  await next()
}

const createClinicSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise']),
  expiresAt: z.string(), // ISO date
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
})

const MODULE_MAP: Record<string, string[]> = {
  starter:    ['patients', 'appointments', 'queue'],
  standard:   ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff'],
  premium:    ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff',
               'clinical', 'lab-orders', 'patient-images', 'prescriptions', 'consent'],
  enterprise: ['patients', 'appointments', 'queue', 'cashier', 'reports', 'staff',
               'clinical', 'lab-orders', 'patient-images', 'prescriptions', 'consent',
               'erp', 'payroll', 'inventory', 'branches'],
}

export const clinicsRoutes = () => {
  const app = new Hono()
  app.use('*', adminAuth)

  // Klinikalar ro'yxati
  app.get('/', async (c) => {
    const rows = await db.query.clinics.findMany()
    return c.json(rows)
  })

  // Yangi klinika + litsenziya yaratish
  app.post('/', zValidator('json', createClinicSchema), async (c) => {
    const data = c.req.valid('json')
    const [clinic] = await db.insert(clinics).values({
      name: data.name,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
    }).returning()

    // License key generatsiya: 4x5 char groups
    const key = Array.from({ length: 4 }, () =>
      crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)
    ).join('-')

    const [license] = await db.insert(licenses).values({
      clinicId: clinic.id,
      licenseKey: key,
      plan: data.plan,
      modules: MODULE_MAP[data.plan],
      gracePeriodDays: data.gracePeriodDays,
      expiresAt: new Date(data.expiresAt),
      isActive: true,
    }).returning()

    return c.json({ clinic, license })
  })

  // Klinika litsenziyasi + modullar
  app.get('/:id', async (c) => {
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, c.req.param('id')) })
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    const license = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinic.id) })
    return c.json({ clinic, license })
  })

  return app
}
```

- [ ] **Step 2: Modules toggle route yoz**

```ts
// apps/api/src/modules/modules/modules.routes.ts
import { Hono } from 'hono'
import { db } from '../../db'
import { licenses } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const adminAuth = async (c: any, next: any) => {
  if (c.req.header('x-admin-token') !== process.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401)
  }
  await next()
}

const updateModulesSchema = z.object({
  modules: z.array(z.string()),
  gracePeriodDays: z.number().int().optional(),
})

export const modulesRoutes = () => {
  const app = new Hono()
  app.use('*', adminAuth)

  // Modul ro'yxatini yangilash (keyingi heartbeat'da klientga yetadi)
  app.patch('/licenses/:key/modules', zValidator('json', updateModulesSchema), async (c) => {
    const key = c.req.param('key')
    const { modules, gracePeriodDays } = c.req.valid('json')
    const update: any = { modules }
    if (gracePeriodDays !== undefined) update.gracePeriodDays = gracePeriodDays
    await db.update(licenses).set(update).where(eq(licenses.licenseKey, key))
    return c.json({ ok: true })
  })

  return app
}
```

- [ ] **Step 3: `index.ts` da routelar birlashtirish**

```ts
// apps/api/src/index.ts
import { Hono } from 'hono'
import { licensesRoutes } from './modules/licenses/licenses.routes'
import { clinicsRoutes } from './modules/clinics/clinics.routes'
import { modulesRoutes } from './modules/modules/modules.routes'

const app = new Hono()

app.route('/v1', licensesRoutes())
app.route('/v1/admin/clinics', clinicsRoutes())
app.route('/v1/admin', modulesRoutes())

app.get('/health', (c) => c.json({ ok: true }))

export default app

const port = Number(process.env.API_PORT ?? 3001)
Bun.serve({ fetch: app.fetch, port })
console.log(`Supervisor API running on :${port}`)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ apps/api/src/index.ts
git commit -m "feat(api): clinic + module management admin routes"
```

---

## Task 5: Admin Panel (React)

**Files:**
- Create: `apps/admin/src/main.tsx`
- Create: `apps/admin/src/features/clinics/` (list + detail)
- Create: `apps/admin/package.json`

- [ ] **Step 1: `apps/admin/package.json`**

```json
{
  "name": "@supervisor/admin",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@mantine/core": "^7.11.0",
    "@mantine/hooks": "^7.11.0",
    "@tanstack/react-query": "^5.50.0",
    "react-router-dom": "^6.24.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.3.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Clinics sahifasi (list)**

```tsx
// apps/admin/src/features/clinics/ClinicsPage.tsx
import { Table, Button, Badge, Title, Group } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL ?? ''
const TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? ''

const fetchClinics = async () => {
  const res = await fetch(`${API}/v1/admin/clinics`, {
    headers: { 'x-admin-token': TOKEN },
  })
  return res.json()
}

export const ClinicsPage = () => {
  const { data: clinics = [], isLoading } = useQuery({ queryKey: ['clinics'], queryFn: fetchClinics })

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Klinikalar</Title>
        <Button component={Link} to="/clinics/new">+ Yangi klinika</Button>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nomi</Table.Th>
            <Table.Th>Litsenziya</Table.Th>
            <Table.Th>Tarif</Table.Th>
            <Table.Th>Holat</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {clinics.map((c: any) => (
            <Table.Tr key={c.id}>
              <Table.Td>{c.name}</Table.Td>
              <Table.Td>{c.license?.licenseKey ?? '—'}</Table.Td>
              <Table.Td>{c.license?.plan ?? '—'}</Table.Td>
              <Table.Td>
                <Badge color={c.license?.isActive ? 'green' : 'red'}>
                  {c.license?.isActive ? 'Faol' : 'Nofaol'}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Button size="xs" variant="subtle" component={Link} to={`/clinics/${c.id}`}>
                  Ko'rish
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}
```

- [ ] **Step 3: Klinika detail + modul toggle**

```tsx
// apps/admin/src/features/clinics/ClinicDetailPage.tsx
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Title, Switch, Stack, Badge, Text, Paper, Group, Button } from '@mantine/core'

const API = import.meta.env.VITE_API_URL ?? ''
const TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? ''
const headers = { 'x-admin-token': TOKEN, 'Content-Type': 'application/json' }

const ALL_MODULES = [
  'patients', 'appointments', 'queue', 'cashier', 'reports', 'staff',
  'clinical', 'lab-orders', 'patient-images', 'prescriptions', 'consent',
  'erp', 'payroll', 'inventory', 'branches',
]

export const ClinicDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['clinic', id],
    queryFn: async () => {
      const res = await fetch(`${API}/v1/admin/clinics/${id}`, { headers })
      return res.json()
    },
  })

  const updateModules = useMutation({
    mutationFn: async (modules: string[]) => {
      await fetch(`${API}/v1/admin/licenses/${data.license.licenseKey}/modules`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ modules }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', id] }),
  })

  const reactivate = useMutation({
    mutationFn: async () => {
      const fp = prompt('Yangi fingerprint kiriting:')
      if (!fp) return
      await fetch(`${API}/v1/reactivate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ licenseKey: data.license.licenseKey, fingerprint: fp }),
      })
    },
  })

  if (!data) return null
  const activeModules: string[] = data.license?.modules ?? []

  const toggle = (mod: string) => {
    const updated = activeModules.includes(mod)
      ? activeModules.filter((m: string) => m !== mod)
      : [...activeModules, mod]
    updateModules.mutate(updated)
  }

  return (
    <>
      <Title order={2} mb="md">{data.clinic.name}</Title>
      <Paper p="md" withBorder mb="md">
        <Text fw={500}>Litsenziya: {data.license?.licenseKey}</Text>
        <Text c="dimmed">Tarif: {data.license?.plan}</Text>
        <Text c="dimmed">Amal qilish: {new Date(data.license?.expiresAt).toLocaleDateString('uz')}</Text>
        <Text c="dimmed">Grace period: {data.license?.gracePeriodDays} kun</Text>
        <Group mt="sm">
          <Button size="xs" variant="outline" onClick={() => reactivate.mutate()}>
            Reactivate
          </Button>
        </Group>
      </Paper>
      <Title order={4} mb="sm">Modullar</Title>
      <Stack gap="xs">
        {ALL_MODULES.map((mod) => (
          <Group key={mod} justify="space-between">
            <Text>{mod}</Text>
            <Switch
              checked={activeModules.includes(mod)}
              onChange={() => toggle(mod)}
            />
          </Group>
        ))}
      </Stack>
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/
git commit -m "feat(admin): clinics list + detail + module toggle UI"
```

---

## Task 6: VPS Deployment

**Files:**
- Create: `infra/docker-compose.prod.yml`
- Create: `infra/Caddyfile`
- Create: `apps/api/Dockerfile`

- [ ] **Step 1: `apps/api/Dockerfile`**

```dockerfile
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb ./
COPY apps/api/package.json apps/api/
RUN bun install --frozen-lockfile
COPY apps/api/ apps/api/
RUN cd apps/api && bun build --compile --outfile /app/dist/api src/index.ts

FROM debian:bookworm-slim
COPY --from=builder /app/dist/api /usr/local/bin/supervisor-api
EXPOSE 3001
CMD ["/usr/local/bin/supervisor-api"]
```

- [ ] **Step 2: `infra/docker-compose.prod.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}
      POSTGRES_DB: supervisor
    volumes: [postgres_data:/var/lib/postgresql/data]
    networks: [internal]

  api:
    image: supervisor-api:latest
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL:?}
      RSA_PRIVATE_KEY: ${RSA_PRIVATE_KEY:?}
      ADMIN_TOKEN: ${ADMIN_TOKEN:?}
      API_PORT: 3001
    depends_on: [postgres]
    networks: [internal]

  admin:
    image: supervisor-admin:latest
    build:
      context: ..
      dockerfile: apps/admin/Dockerfile
    restart: unless-stopped
    networks: [internal]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ['80:80', '443:443']
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    environment:
      DOMAIN: ${DOMAIN:?}
      ACME_EMAIL: ${ACME_EMAIL:?}
    depends_on: [api, admin]
    networks: [internal]

networks:
  internal:
    driver: bridge

volumes:
  postgres_data:
  caddy_data:
```

- [ ] **Step 3: `infra/Caddyfile`**

```
{env.DOMAIN} {
  tls {env.ACME_EMAIL}

  handle /v1/* {
    reverse_proxy api:3001
  }

  handle {
    reverse_proxy admin:80
  }
}
```

- [ ] **Step 4: RSA key pair generatsiya (bir marta)**

```bash
# Lokal muhitda bir marta ishlatiladi, PRIVATE_KEY .env ga qo'yiladi
cd apps/api && bun -e "
const { generateKeyPair } = await import('./src/lib/rsa.ts')
const { privateKey, publicKey } = generateKeyPair()
console.log('PRIVATE:', privateKey)
console.log('PUBLIC:', publicKey)
"
```

`RSA_PRIVATE_KEY` VPS `.env` fayliga qo'shiladi.
`publicKey` → `packages/core/supervisor-public-key.ts` (dental-service repo'siga) — `.lic` verificatsiya uchun.

- [ ] **Step 5: Commit**

```bash
git add infra/ apps/api/Dockerfile
git commit -m "infra: VPS Docker + Caddy production deployment"
```

---

## Qo'lda Tekshirish

- [ ] `POST /v1/activate` — yangi litsenziya faollashadi, RSA imzoli javob keladi
- [ ] `POST /v1/heartbeat` — modullar yangilanadi, grace period ko'rinadi
- [ ] `POST /v1/reactivate` — admin token bilan yangi fingerprint bog'lanadi
- [ ] Admin panel: klinikalar ro'yxati ko'rinadi
- [ ] Admin panel: modul toggle → keyingi heartbeat'da dental-service modullar o'zgaradi
- [ ] VPS'da HTTPS ishlaydi (`https://supervisor.dental.uz`)
