# Supervisor Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ✅ **Monorepo ichida (2026-07-02 qaror bilan yangilandi)** — `apps/supervisor-api` + `apps/supervisor-admin`, `dental-service` bilan **bitta repo**, `@supervisor/*` npm scope (`@dental/*`dan qasddan farqli — Supervisor mustaqil mahsulot, lekin bir repoda). Birinchi urinish (`supervisor-service/` alohida repo sifatida) chala qolib ketgani va root `package.json`/`turbo.json`ni buzib qo'ygani sababli bekor qilindi va butunlay o'chirildi — quyidagi Task 1 shu sababli yangilandi. To'liq kontekst: `/home/madrimov/.claude/plans/hozir-supervisor-service-va-asosiy-iterative-teacup.md`.
>
> **Muhim tuzatishlar (eski qismlarni o'qiganda yodda tuting):**
> - Backend testlari **`bun:test`** bilan yoziladi, **`vitest` emas** (import manbai `'bun:test'`, API shakli bir xil — `describe/it/expect`). `vi.mock(...)` bun:test'da yo'q — Task 3 testlari haqiqiy (integratsion) DB'ga qarshi yoziladi, mock emas.
> - Admin JWT — **`jose`** kutubxonasi (`apps/api` bilan bir xil), **`hono/jwt` emas**.
> - Har joyda `supervisor-service/apps/api/...` → `apps/supervisor-api/...`, `supervisor-service/apps/admin/...` → `apps/supervisor-admin/...` deb o'qing.
> - `db/index.ts` nomi endi **`db/client.ts`** (`apps/api` konvensiyasiga mos) va **`drizzle(client, { schema })`** — `schema` parametri MAJBURIY (bu — birinchi urinishning asosiy bugi edi: `db.query.*` schema'siz ishlamaydi).

**Goal:** Developer boshqaradigan central Supervisor service — klinikalar litsenziyasini boshqarish, modul gating, grace period sozlash, reactivation.

**Architecture:** Hono API (VPS'da Docker + Caddy), React admin panel. Dental Service har 24 soatda `/v1/heartbeat` chaqiradi. RSA imzo bilan `.lic` fayllari imzolanadi. VPS'da PostgreSQL + Caddy (TLS).

**Tech Stack:** Bun + Hono, Drizzle + PostgreSQL, React + Vite + Mantine, Docker + Caddy (VPS), Node built-in `crypto` (RSA — node-forge EMAS), bun:test (API) + Vitest (admin panel)

## Global Constraints

- TypeScript strict mode
- Bun runtime
- Drizzle ORM (PostgreSQL)
- Biome lint
- Testlar: `bun:test` (supervisor-api), Vitest (supervisor-admin) — apps/api/apps/web konvensiyasiga mos
- Hono factory DI pattern (CLAUDE.md §3.5)
- Barcha API endpoint HTTPS only (production)

---

## Fayl xaritasi (dental-service monorepo ichida, apps/ ostida)

```
apps/
├── supervisor-api/             # Hono backend (@supervisor/api)
│   ├── Dockerfile
│   ├── drizzle.config.ts
│   ├── drizzle/                # generatsiya qilingan migratsiyalar
│   ├── package.json
│   ├── tsconfig.json           # extends ../../tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts            # Entry point (Bun.serve)
│       ├── db/
│       │   ├── schema.ts       # Drizzle schema
│       │   ├── client.ts       # drizzle(client, { schema }) — schema MAJBURIY
│       │   ├── migrate.ts
│       │   └── seed.ts
│       ├── lib/
│       │   ├── rsa.ts          # RSA imzolash (node:crypto)
│       │   └── jwt.ts          # admin JWT (jose)
│       └── modules/
│           ├── clinics/        # Klinika CRUD + modul toggle
│           ├── licenses/       # Activate, heartbeat, reactivate
│           └── auth/           # Admin login (JWT)
└── supervisor-admin/           # React admin panel (@supervisor/admin)
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── vitest.config.ts
    └── src/
        ├── main.tsx
        ├── lib/api.ts           # authFetch helper
        └── features/
            ├── auth/            # LoginPage
            └── clinics/         # ClinicsPage, ClinicDetailPage

infra/
├── docker-compose.yml          # dental-service dev stack — postgres'ga
│                                # supervisor DB init-script qo'shiladi (Task 1)
├── postgres-init-supervisor.sql
└── supervisor/                 # Supervisor'ning PROD orkestratsiyasi (Task 6)
    ├── docker-compose.prod.yml # bitta markaziy VPS'da (klinika VPS'ida EMAS)
    ├── Caddyfile
    └── README.md
```

Root `package.json` (`workspaces: ["apps/*", "packages/*"]`) va root `turbo.json` — **o'zgarishsiz** qoladi, `apps/*` glob avtomatik qamrab oladi.

---

## Task 1: Monorepo Scaffolding + DB Schema + Client (bug-fix task)

**Files:**
- Create: `apps/supervisor-api/package.json`, `tsconfig.json`, `drizzle.config.ts`
- Create: `apps/supervisor-api/src/db/schema.ts`, `db/client.ts`, `db/migrate.ts`
- Create: `infra/postgres-init-supervisor.sql`, mount qatori `infra/docker-compose.yml`ga
- Create: `apps/supervisor-api/.env.example`

**Qarorlar (brainstorm 2026-06-29 + monorepo qarori 2026-07-02):**
- `clinics → branches → licenses` (har filialga alohida litsenziya, alohida to'lov)
- `plan` hardcoded enum (`starter|standard|premium|enterprise`), `modules` jsonb override
- Admin auth: username+password → JWT (faqat `x-admin-token` emas), kutubxona **`jose`**
- `admin_users` jadval qo'shildi
- Alohida repo/root `package.json`/`turbo.json`/`infra/docker-compose.yml` yaratish **YO'Q** — mavjud dental-service monorepo strukturasidan foydalaniladi (pastga qarang)

- [ ] **Step 1: Papka strukturasi (mavjud dental-service ichida, YANGI repo YO'Q)**

```bash
# dental-service repo root'ida (git init QILINMAYDI — mavjud repo ichida)
mkdir -p apps/supervisor-api/src/db apps/supervisor-api/src/lib
mkdir -p apps/supervisor-api/src/modules/clinics apps/supervisor-api/src/modules/licenses apps/supervisor-api/src/modules/auth
mkdir -p apps/supervisor-admin/src
```

Root `package.json` (`workspaces: ["apps/*", "packages/*"]`) va root `turbo.json` — **tegilmaydi**, `apps/*` glob yangi ikkala papkani avtomatik qamrab oladi.

- [ ] **Step 2: `apps/supervisor-api/package.json`**

```json
{
  "name": "@supervisor/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --env-file=.env --hot run src/index.ts",
    "start:prod": "bun run src/index.ts",
    "build": "tsc --noEmit",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "db:generate": "bun --env-file=.env x drizzle-kit generate",
    "db:migrate": "bun --env-file=.env run src/db/migrate.ts",
    "db:migrate:prod": "bun run src/db/migrate.ts"
  },
  "dependencies": {
    "hono": "^4.5.0",
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4.5",
    "zod": "^3.23.0",
    "jose": "^6.2.3",
    "bcryptjs": "^2.4.0"
  },
  "devDependencies": {
    "@hono/zod-validator": "^0.3.0",
    "drizzle-kit": "^0.31.10",
    "bun-types": "latest"
  }
}
```

`--env-file=.env` (o'z fayli, `apps/api`dagi `--env-file=../../.env` EMAS) — ikkala app'ning dev konfiguratsiyasi chalkashmasligi uchun ataylab shunday.

- [ ] **Step 3: `apps/supervisor-api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": true,
    "lib": ["ESNext"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "drizzle.config.ts"]
}
```

- [ ] **Step 4: DB Schema yoz**

```ts
// apps/supervisor-api/src/db/schema.ts
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core'

export const clinics = pgTable('clinics', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export const branches = pgTable('branches', {
  id:        uuid('id').primaryKey().defaultRandom(),
  clinicId:  uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  address:   text('address'),
  phone:     text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const licenses = pgTable('licenses', {
  id:               uuid('id').primaryKey().defaultRandom(),
  clinicId:         uuid('clinic_id').notNull().references(() => clinics.id, { onDelete: 'cascade' }),   // denorm
  branchId:         uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
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
  licenseId:   uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  event:       text('event').notNull(), // 'activated'|'heartbeat'|'reactivated'|'deactivated'
  fingerprint: text('fingerprint'),
  metadata:    jsonb('metadata'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// Admin foydalanuvchilar (Supervisor panel uchun)
export const adminUsers = pgTable('admin_users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

export type Clinics = typeof clinics.$inferSelect
export type Branches = typeof branches.$inferSelect
export type Licenses = typeof licenses.$inferSelect
export type LicenseEvents = typeof licenseEvents.$inferSelect
export type AdminUsers = typeof adminUsers.$inferSelect
```

- [ ] **Step 5: DB client yoz (asosiy bug-fix — `schema` MAJBURIY)**

Birinchi urinishning asl bugi: `drizzle(client)` ga `schema` berilmagan edi, shuning uchun `db.query.*` (`db.query.adminUsers.findFirst(...)` kabi) runtime'da `DrizzleTypeError` bilan yiqilardi. Bu yerda avval **failing test** yoziladi (`db.test.ts` — haqiqiy `supervisor` bazasiga ulanib `db.query.adminUsers.findMany()` chaqiradi, natija array bo'lishini kutadi), keyin implementatsiya:

```ts
// apps/supervisor-api/src/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

export const client = postgres(databaseUrl, { max: 10 })
export const db = drizzle(client, { schema })   // <-- schema MAJBURIY
export type Database = typeof db
```

- [ ] **Step 6: Migrate yoz**

```ts
// apps/supervisor-api/src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { seedAdminUser } from './seed'

const sql = postgres(process.env.DATABASE_URL!)
const db = drizzle(sql)

try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations done')
  await seedAdminUser()
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}
```

`seed.ts` implementatsiyasi Task 6'da yoziladi, lekin `migrate.ts` uni **shu yerdan chaqiradi** — birinchi urinishning ikkinchi bugi shu edi (seed yozilgan, lekin hech qayerdan chaqirilmagan).

- [ ] **Step 7: Migration generatsiya**

```bash
cd apps/supervisor-api && bun run db:generate
```

- [ ] **Step 8: Dev DB — umumiy `dental-postgres` container, 2-baza (YANGI CONTAINER YO'Q)**

`infra/postgres-init-supervisor.sql` (yangi fayl):

```sql
-- Dev-only: umumiy dental-postgres container'da 'supervisor' nomli 2-baza
-- yaratadi. Supervisor kichik, bitta-tenant admin tool — dental_app/RLS split
-- takrorlanmaydi, mavjud 'dental' superuser orqali ulanadi.
SELECT 'CREATE DATABASE supervisor OWNER dental'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'supervisor')\gexec
```

`infra/docker-compose.yml`dagi mavjud `postgres` service'ga bitta qatop qo'shiladi (yangi service/port YO'Q):

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./postgres-init-supervisor.sql:/docker-entrypoint-initdb.d/02-init-supervisor.sql:ro
```

⚠️ `docker-entrypoint-initdb.d` skriptlari faqat **yangi** volume'da ishga tushadi. Mavjud `postgres_data` bo'lsa: `docker compose -f infra/docker-compose.yml down -v` + qayta up (dev-only, destructive), yoki qo'lda `docker exec -it dental-postgres createdb -U dental supervisor`.

`apps/supervisor-api/.env.example` (yangi, commit qilinadi):

```
DATABASE_URL=postgres://dental:dental_local_dev@localhost:5432/supervisor
JWT_SECRET=change_me_supervisor_dev_min_32_chars
RSA_PRIVATE_KEY=
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=change_me
API_PORT=3101
```

- [ ] **Step 9: Commit**

```bash
git add apps/supervisor-api/ infra/postgres-init-supervisor.sql infra/docker-compose.yml
git commit -m "feat(supervisor-api): scaffold + DB schema + client (schema-fixed)"
```

---

## Task 2: RSA Imzolash

**Files:**
- Create: `apps/supervisor-api/src/lib/rsa.ts`
- Test: `apps/supervisor-api/src/lib/rsa.test.ts`

**Interfaces:**
- Produces:
  ```ts
  generateKeyPair(): { privateKey: string; publicKey: string }
  signLicense(data: object, privateKey: string): string   // hex signature
  verifySignature(data: object, signature: string, publicKey: string): boolean
  ```

- [ ] **Step 1: Failing test yoz**

```ts
// apps/supervisor-api/src/lib/rsa.test.ts
import { describe, it, expect } from 'bun:test'
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
cd apps/supervisor-api && bun test src/lib/rsa.test.ts
```

**Qarorlar (brainstorm 2026-06-29):**
- `node-forge` O'RNIGA Node.js built-in `crypto` (zero dependency)
- RSA 2048 bit, SHA-256
- Private key VPS `.env` + zaxira (parol menejeri)
- Public key `packages/core/supervisor-public-key.ts` ga (dental-service repo — endi bir xil monorepo, oddiy copy-paste, keyinchalik avtomatlashtirish mumkin)

- [ ] **Step 3: `rsa.ts` implementatsiya (built-in crypto)**

```ts
// apps/supervisor-api/src/lib/rsa.ts
import { generateKeyPairSync, createSign, createVerify } from 'crypto'

const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort())

export const generateKeyPair = (): { privateKey: string; publicKey: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  })
  return { privateKey, publicKey }
}

export const signLicense = (data: object, privateKeyPem: string): string => {
  const sign = createSign('SHA256')
  sign.update(canonicalize(data))
  return sign.sign(privateKeyPem, 'hex')
}

export const verifySignature = (
  data: object,
  signature: string,
  publicKeyPem: string
): boolean => {
  try {
    const verify = createVerify('SHA256')
    verify.update(canonicalize(data))
    return verify.verify(publicKeyPem, signature, 'hex')
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Test PASS**

```bash
cd apps/supervisor-api && bun test src/lib/rsa.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/supervisor-api/src/lib/rsa.ts apps/supervisor-api/src/lib/rsa.test.ts
git commit -m "feat(supervisor-api): RSA license signing + verification"
```

---

## Task 3: License API (Activate + Heartbeat + Reactivate)

**Files:**
- Create: `apps/supervisor-api/src/modules/licenses/licenses.routes.ts`
- Create: `apps/supervisor-api/src/modules/licenses/licenses.service.ts`
- Test: `apps/supervisor-api/src/modules/licenses/licenses.test.ts`

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

- [ ] **Step 1: Failing test yoz (bun:test, haqiqiy `supervisor` test DB'ga qarshi — mock EMAS)**

```ts
// apps/supervisor-api/src/modules/licenses/licenses.test.ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { clinics, branches, licenses } from '../../db/schema'
import { createApp } from '../../app'   // Hono instansiyasini quradigan factory (index.ts Bun.serve'siz)

const app = createApp()

let licenseKey: string

beforeEach(async () => {
  const [clinic] = await db.insert(clinics).values({ name: 'Test Clinic' }).returning()
  const [branch] = await db.insert(branches).values({ clinicId: clinic.id, name: 'Main' }).returning()
  licenseKey = `TEST-${crypto.randomUUID()}`
  await db.insert(licenses).values({
    clinicId: clinic.id,
    branchId: branch.id,
    licenseKey,
    plan: 'standard',
    modules: ['patients', 'appointments', 'cashier'],
    gracePeriodDays: 30,
    expiresAt: new Date(Date.now() + 86400000 * 365),
    isActive: true,
  })
})

describe('POST /v1/activate', () => {
  it('activates a valid license key va fingerprint bog\'laydi', async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.modules).toContain('patients')
    expect(body.signature).toBeTruthy()

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) })
    expect(lic?.fingerprint).toBe('fp-abc')
  })

  it('returns 403 for unknown key', async () => {
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'WRONG-KEY', fingerprint: 'fp' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 403 for fingerprint mismatch (allaqachon boshqa qurilmaga bog\'langan)', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-first' }),
    })
    const res = await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-different' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('POST /v1/heartbeat', () => {
  it('lastHeartbeatAt yangilaydi va joriy modullarni qaytaradi', async () => {
    await app.request('/v1/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    })
    const res = await app.request('/v1/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-abc' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.gracePeriodDays).toBe(30)
  })
})

describe('POST /v1/reactivate', () => {
  it('admin JWT bo\'lmasa 401', async () => {
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    })
    expect(res.status).toBe(401)
  })

  it('valid admin JWT bilan fingerprint qayta bog\'lanadi', async () => {
    const token = await signAdminTestToken()   // test helper — Task 4'dagi jwt.ts bilan bir xil secret
    const res = await app.request('/v1/reactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licenseKey, fingerprint: 'fp-new' }),
    })
    expect(res.status).toBe(200)
    const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) })
    expect(lic?.fingerprint).toBe('fp-new')
  })
})
```

`signAdminTestToken()` — testlar uchun kichik yordamchi (`apps/supervisor-api/src/lib/test-helpers.ts`), Task 4'dagi `jose`+`JWT_SECRET` bilan bir xil sxema orqali test tokeni yasaydi. Testlar `apps/supervisor-api/.env` orqali `DATABASE_URL`ni (dev `supervisor` bazasi) va `RSA_PRIVATE_KEY`ni o'qiydi (Task 2'da generatsiya qilingan). CI'da esa Phase G'dagi `supervisor` bazasi provisioning kerak bo'ladi.

- [ ] **Step 2: Test FAIL**

```bash
cd apps/supervisor-api && bun test src/modules/licenses/licenses.test.ts
```

- [ ] **Step 3: Service yoz**

```ts
// apps/supervisor-api/src/modules/licenses/licenses.service.ts
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
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

- [ ] **Step 4: JWT middleware (reactivate shu yerda kerak — auth.routes.ts login'i Task 4'da qo'shiladi, middleware esa shu yerda)**

```ts
// apps/supervisor-api/src/modules/auth/jwt.middleware.ts
import type { MiddlewareHandler } from 'hono'
import { jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!)

export const adminJwtMiddleware: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401)
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), secret())
    c.set('adminUserId', payload.sub)
    await next()
  } catch {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401)
  }
}
```

- [ ] **Step 5: Routes yoz (reactivate — admin JWT talab qiladi, `x-admin-token` YO'Q)**

```ts
// apps/supervisor-api/src/modules/licenses/licenses.routes.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createLicenseService } from './licenses.service'
import { adminJwtMiddleware } from '../auth/jwt.middleware'

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

  // Admin JWT talab qiladi (login: POST /v1/admin/auth/login — Task 4)
  app.post('/reactivate', adminJwtMiddleware, zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json')
      const data = await service.reactivate(licenseKey, fingerprint)
      return c.json(data)
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500)
    }
  })

  return app
}
```

- [ ] **Step 6: Test PASS**

```bash
cd apps/supervisor-api && bun test src/modules/licenses/licenses.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/supervisor-api/src/modules/licenses/
git commit -m "feat(api): license activate + heartbeat + reactivate endpoints"
```

---

## Task 4: Admin Auth + Clinic + Module Management API

**Files:**
- Create: `apps/supervisor-api/src/modules/auth/auth.routes.ts`
- Create: `apps/supervisor-api/src/modules/clinics/clinics.routes.ts`
- Create: `apps/supervisor-api/src/modules/modules/modules.routes.ts`
- (`apps/supervisor-api/src/modules/auth/jwt.middleware.ts` — Task 3'da allaqachon yaratilgan, `/v1/reactivate` shu middleware'ni ishlatadi)

**Admin auth:** Email + password → JWT (brainstorm qaror "B"), **`jose`** kutubxonasi (`apps/api`dagi `lib/env.ts`+JWT konvensiyasiga mos). `JWT_SECRET` env vardan.

**Qarorlar (brainstorm 2026-06-29):** JWT auth (email/password login → 7 kunlik token). `x-admin-token` ishlatilmaydi.

- [ ] **Step 1: Failing test + auth route (login)**

```ts
// apps/supervisor-api/src/modules/auth/auth.routes.ts
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { db } from '../../db/client'
import { adminUsers } from '../../db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!)

export const authRoutes = () => {
  const app = new Hono()

  app.post('/login', zValidator('json', z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })), async (c) => {
    const { email, password } = c.req.valid('json')
    const user = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return c.json({ error: { code: 'INVALID_CREDENTIALS' } }, 401)
    }
    const token = await new SignJWT({ sub: user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret())
    return c.json({ token })
  })

  return app
}
```

`jwt.middleware.ts` (Task 3'da `licenses.routes.ts`ning `/reactivate`si uchun yaratilgan) shu bilan bir xil `jose`+`JWT_SECRET`ni ishlatadi — qayta yozilmaydi, faqat import qilinadi (`clinics.routes.ts` va `modules.routes.ts`da).

- [ ] **Step 2: Clinics CRUD yoz**

```ts
// apps/supervisor-api/src/modules/clinics/clinics.routes.ts
import { Hono } from 'hono'
import { db } from '../../db/client'
import { clinics, branches, licenses } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { adminJwtMiddleware } from '../auth/jwt.middleware'
import crypto from 'crypto'

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
  app.use('*', adminJwtMiddleware)

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
// apps/supervisor-api/src/modules/modules/modules.routes.ts
import { Hono } from 'hono'
import { db } from '../../db/client'
import { licenses } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { adminJwtMiddleware } from '../auth/jwt.middleware'

const updateModulesSchema = z.object({
  modules: z.array(z.string()),
  gracePeriodDays: z.number().int().optional(),
})

export const modulesRoutes = () => {
  const app = new Hono()
  app.use('*', adminJwtMiddleware)

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

- [ ] **Step 3: `app.ts` (Hono instansiyasi, Bun.serve'siz — testlar shuni import qiladi) + `index.ts` (entry)**

`apps/api`ning `app.ts`/`index.ts` split konvensiyasiga mos — `app.ts` sinaladigan `Hono` instansiyasini quradi, `index.ts` uni `Bun.serve`ga ulaydi. Task 3'dagi `licenses.test.ts` allaqachon `createApp` importini kutgan edi.

```ts
// apps/supervisor-api/src/app.ts
import { Hono } from 'hono'
import { licensesRoutes } from './modules/licenses/licenses.routes'
import { clinicsRoutes } from './modules/clinics/clinics.routes'
import { modulesRoutes } from './modules/modules/modules.routes'
import { authRoutes } from './modules/auth/auth.routes'

export const createApp = () => {
  const app = new Hono()

  app.route('/v1', licensesRoutes())
  app.route('/v1/admin/auth', authRoutes())
  app.route('/v1/admin/clinics', clinicsRoutes())
  app.route('/v1/admin', modulesRoutes())

  app.get('/health', (c) => c.json({ ok: true }))

  return app
}
```

```ts
// apps/supervisor-api/src/index.ts
import { createApp } from './app'

const app = createApp()
const port = Number(process.env.API_PORT ?? 3101)
Bun.serve({ fetch: app.fetch, port })
console.log(`Supervisor API running on :${port}`)
```

- [ ] **Step 4: Commit**

```bash
git add apps/supervisor-api/src/modules/ apps/supervisor-api/src/app.ts apps/supervisor-api/src/index.ts
git commit -m "feat(supervisor-api): clinic + module management admin routes"
```

---

## Task 5: Admin Panel (React)

**Files:**
- Create: `apps/supervisor-admin/index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`
- Create: `apps/supervisor-admin/src/main.tsx`, `App.tsx`, `test-setup.ts`
- Create: `apps/supervisor-admin/src/features/auth/LoginPage.tsx`
- Create: `apps/supervisor-admin/src/features/clinics/` (list + detail)
- Create: `apps/supervisor-admin/package.json`

`apps/web`ning vite/vitest konvensiyasiga mos (jsdom + `@testing-library/react`), lekin `@dental/*` paketlarsiz (mustaqil mahsulot — faqat versiyalarni `apps/web/package.json`dan nusxa oling, workspace bog'liqlik YO'Q).

- [ ] **Step 1: `apps/supervisor-admin/package.json`**

```json
{
  "name": "@supervisor/admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@mantine/core": "^7.15.2",
    "@mantine/hooks": "^7.15.2",
    "@mantine/form": "^7.15.2",
    "@tanstack/react-query": "^5.62.10",
    "react-router-dom": "^6.28.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "postcss-preset-mantine": "^1.17.0",
    "postcss-simple-vars": "^7.0.1",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: `index.html` + `vite.config.ts` + `tsconfig.json` + `main.tsx`/`App.tsx` (router skeleton)**

```html
<!-- apps/supervisor-admin/index.html -->
<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Supervisor Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// apps/supervisor-admin/vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 3102, strictPort: true },
})
```

```json
// apps/supervisor-admin/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "noEmit": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

```tsx
// apps/supervisor-admin/src/main.tsx
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MantineProvider>
      <App />
    </MantineProvider>
  </React.StrictMode>,
)
```

```tsx
// apps/supervisor-admin/src/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { ClinicDetailPage } from './features/clinics/ClinicDetailPage'
import { ClinicsPage } from './features/clinics/ClinicsPage'

const queryClient = new QueryClient()

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ClinicsPage />} />
        <Route path="/clinics/:id" element={<ClinicDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)
```

- [ ] **Step 3: Login sahifasi**

```tsx
// apps/supervisor-admin/src/features/auth/LoginPage.tsx
import { TextInput, PasswordInput, Button, Paper, Title, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL ?? ''

export const LoginPage = () => {
  const navigate = useNavigate()
  const form = useForm({ initialValues: { email: '', password: '' } })

  const login = useMutation({
    mutationFn: async (values: { email: string; password: string }) => {
      const res = await fetch(`${API}/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error('Login failed')
      return res.json() as Promise<{ token: string }>
    },
    onSuccess: ({ token }) => {
      localStorage.setItem('admin_token', token)
      navigate('/')
    },
  })

  return (
    <Paper maw={400} mx="auto" mt={100} p="xl" withBorder>
      <Title order={2} mb="md">Supervisor Admin</Title>
      <form onSubmit={form.onSubmit((v) => login.mutate(v))}>
        <Stack>
          <TextInput label="Email" type="email" {...form.getInputProps('email')} />
          <PasswordInput label="Parol" {...form.getInputProps('password')} />
          <Button type="submit" loading={login.isPending}>Kirish</Button>
          {login.isError && <span style={{ color: 'red' }}>Login yoki parol noto'g'ri</span>}
        </Stack>
      </form>
    </Paper>
  )
}
```

**Token management helper:**
```ts
// apps/supervisor-admin/src/lib/api.ts
const API = import.meta.env.VITE_API_URL ?? ''

export const authFetch = (path: string, init?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}`,
      'Content-Type': 'application/json',
    },
  })
```

- [ ] **Step 4: Clinics sahifasi (list)**

```tsx
// apps/supervisor-admin/src/features/clinics/ClinicsPage.tsx
import { Table, Button, Badge, Title, Group } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { authFetch } from '../../lib/api'

const fetchClinics = async () => {
  const res = await authFetch('/v1/admin/clinics')
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

- [ ] **Step 5: Klinika detail + modul toggle**

```tsx
// apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Title, Switch, Stack, Text, Paper, Group, Button } from '@mantine/core'
import { authFetch } from '../../lib/api'

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
      const res = await authFetch(`/v1/admin/clinics/${id}`)
      return res.json()
    },
  })

  const updateModules = useMutation({
    mutationFn: async (modules: string[]) => {
      await authFetch(`/v1/admin/licenses/${data.license.licenseKey}/modules`, {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic', id] }),
  })

  const reactivate = useMutation({
    mutationFn: async () => {
      const fp = prompt('Yangi fingerprint kiriting:')
      if (!fp) return
      await authFetch('/v1/reactivate', {
        method: 'POST',
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

- [ ] **Step 6: Commit**

```bash
git add apps/supervisor-admin/
git commit -m "feat(admin): clinics list + detail + module toggle UI"
```

---

## Task 6: VPS Deployment (bitta markaziy Supervisor VPS — klinika VPS'lariga HECH QACHON qo'shilmaydi)

**Files:**
- Create: `infra/supervisor/docker-compose.prod.yml`
- Create: `infra/supervisor/Caddyfile`
- Create: `infra/supervisor/README.md`
- Create: `apps/supervisor-api/Dockerfile`, `apps/supervisor-admin/Dockerfile`
- Create: `apps/supervisor-api/src/db/seed.ts`

⚠️ Bu fayllar dental-service'ning per-klinika `infra/docker-compose.prod.yml`/`infra/Caddyfile`siga **HECH QACHON qo'shilmaydi** — Supervisor vendor'ning o'z VPS'ida, bitta marta ishga tushadi.

- [ ] **Step 1: `apps/supervisor-api/Dockerfile`** (apps/api/Dockerfile'ning soddaroq varianti — `@dental/*` paketlar kerak emas)

```dockerfile
# syntax=docker/dockerfile:1
FROM oven/bun:1.2.21-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/supervisor-api/package.json apps/supervisor-api/
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.21-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY apps/supervisor-api ./apps/supervisor-api
WORKDIR /app/apps/supervisor-api
USER bun
EXPOSE 3101
CMD ["bun", "run", "src/index.ts"]
```

Build context — repo ROOT (bun workspace lockfile kerak): `docker build -f apps/supervisor-api/Dockerfile -t supervisor-api .`

- [ ] **Step 2: `apps/supervisor-admin/Dockerfile`** (Caddy static-serve, `infra/Caddyfile.web` SPA-fallback namunasida)

```dockerfile
FROM oven/bun:1.2.21-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/supervisor-admin/package.json apps/supervisor-admin/
RUN bun install --frozen-lockfile
COPY apps/supervisor-admin ./apps/supervisor-admin
WORKDIR /app/apps/supervisor-admin
RUN bun run build

FROM caddy:2-alpine
COPY --from=build /app/apps/supervisor-admin/dist /usr/share/caddy
# SPA fallback — barcha noma'lum yo'llar index.html'ga (client-side routing uchun)
RUN printf ':80 {\n\troot * /usr/share/caddy\n\tfile_server\n\ttry_files {path} /index.html\n}\n' > /etc/caddy/Caddyfile
```

- [ ] **Step 3: `infra/supervisor/docker-compose.prod.yml`** (build context `../..` — repo root, `infra/supervisor/`dan 2 daraja yuqori)

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
      context: ../..
      dockerfile: apps/supervisor-api/Dockerfile
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL:?}
      RSA_PRIVATE_KEY: ${RSA_PRIVATE_KEY:?}
      JWT_SECRET: ${JWT_SECRET:?}
      ADMIN_SEED_EMAIL: ${ADMIN_SEED_EMAIL:?}
      ADMIN_SEED_PASSWORD: ${ADMIN_SEED_PASSWORD:?}
      API_PORT: 3101
    depends_on: [postgres]
    networks: [internal]

  migrate:
    image: supervisor-api:latest
    build:
      context: ../..
      dockerfile: apps/supervisor-api/Dockerfile
    command: ['bun', 'run', 'src/db/migrate.ts']
    restart: 'no'
    environment:
      DATABASE_URL: ${DATABASE_URL:?}
      ADMIN_SEED_EMAIL: ${ADMIN_SEED_EMAIL:?}
      ADMIN_SEED_PASSWORD: ${ADMIN_SEED_PASSWORD:?}
    depends_on: [postgres]
    networks: [internal]

  admin:
    image: supervisor-admin:latest
    build:
      context: ../..
      dockerfile: apps/supervisor-admin/Dockerfile
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

- [ ] **Step 4: `infra/supervisor/Caddyfile`**

```
{env.DOMAIN} {
  tls {env.ACME_EMAIL}

  handle /v1/* {
    reverse_proxy api:3101
  }

  handle {
    reverse_proxy admin:80
  }
}
```

`infra/supervisor/README.md` — bir qatorli eslatma: *"Bu papka faqat vendor'ning o'z markaziy Supervisor VPS'ida deploy qilinadi. Klinika VPS deploy'iga (root `infra/docker-compose.prod.yml`) HECH QACHON qo'shilmaydi."*

- [ ] **Step 5: Seed admin foydalanuvchi**

**Qaror (brainstorm 2026-06-29):** `ADMIN_SEED_EMAIL` + `ADMIN_SEED_PASSWORD` env vardan — `migrate.ts` (Task 1'da yozilgan) startup'da bir marta chaqiradi, mavjud bo'lsa skip.

```ts
// apps/supervisor-api/src/db/seed.ts
import { db } from './client'
import { adminUsers } from './schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export const seedAdminUser = async () => {
  const email = process.env.ADMIN_SEED_EMAIL
  const password = process.env.ADMIN_SEED_PASSWORD
  if (!email || !password) return

  const existing = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) })
  if (existing) return

  const passwordHash = await bcrypt.hash(password, 12)
  await db.insert(adminUsers).values({ email, passwordHash })
  console.log(`[seed] Admin user yaratildi: ${email}`)
}
```

(`migrate.ts` allaqachon Task 1 Step 6'da `seedAdminUser()`ni chaqiradi — bu yerda qayta yozilmaydi.)

- [ ] **Step 6: RSA key pair generatsiya (bir marta)**

```bash
# Lokal muhitda bir marta ishlatiladi, PRIVATE_KEY .env ga qo'yiladi
cd apps/supervisor-api && bun -e "
const { generateKeyPair } = await import('./src/lib/rsa.ts')
const { privateKey, publicKey } = generateKeyPair()
console.log('PRIVATE:', privateKey)
console.log('PUBLIC:', publicKey)
"
```

`RSA_PRIVATE_KEY` VPS `.env` fayliga qo'shiladi.
`publicKey` → `packages/core/supervisor-public-key.ts` (endi bir xil monorepo — oddiy copy-paste) — `.lic` verificatsiya uchun.

**`apps/supervisor-api/.env.production` namuna:**
```
POSTGRES_USER=supervisor
POSTGRES_PASSWORD=<strong-random>
DATABASE_URL=postgres://supervisor:<pw>@postgres:5432/supervisor
RSA_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_SECRET=<64-char-random>
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=<strong-password>
DOMAIN=supervisor.yoursite.uz
ACME_EMAIL=you@example.com
```

- [ ] **Step 7: Commit**

```bash
git add infra/supervisor/ apps/supervisor-api/Dockerfile apps/supervisor-admin/Dockerfile apps/supervisor-api/src/db/seed.ts
git commit -m "infra(supervisor): VPS Docker + Caddy + admin seed migration"
```

---

## Qo'lda Tekshirish

- [ ] `POST /v1/admin/auth/login` — email/parol bilan JWT token keladi
- [ ] `POST /v1/activate` — yangi litsenziya faollashadi, RSA imzoli javob keladi
- [ ] `POST /v1/heartbeat` — modullar yangilanadi, grace period ko'rinadi
- [ ] `POST /v1/reactivate` — JWT token bilan yangi fingerprint bog'lanadi
- [ ] Admin panel: login sahifasi ko'rinadi, kirish ishlaydi
- [ ] Admin panel: klinikalar ro'yxati ko'rinadi
- [ ] Admin panel: modul toggle → keyingi heartbeat'da dental-service modullar o'zgaradi
- [ ] VPS'da HTTPS ishlaydi (`https://${DOMAIN}`)
