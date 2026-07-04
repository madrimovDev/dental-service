# CLI-362 — `.lic` RSA Signature Verifikatsiyasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/api/src/lib/license.ts`'s `isLicenseValid()` currently only checks `expiresAt` + `gracePeriodDays`, never `LicenseData.signature` — a local admin can call the (non-secret) `getFingerprint()`, derive the AES key, and rewrite `.lic` with arbitrary `modules`/`expiresAt` to bypass `requireModule` module-gating entirely. Supervisor already RSA-signs every license response (`apps/supervisor-api/src/lib/rsa.ts`); this plan wires signature verification into the client side so any tampered/forged `.lic` is rejected.

**Architecture:** Verification logic is duplicated (not imported) into `packages/core` because `apps/api` has no dependency edge to `apps/supervisor-api` (`apps/supervisor-api` is `"private": true`, no `exports` field, and is intentionally a separate product per project convention — see spec §2.3 for the full investigation). `packages/core/src/license-signature.ts` holds a verify-only copy of `apps/supervisor-api/src/lib/rsa.ts`'s `canonicalize` + `verifySignature`; `packages/core/src/supervisor-public-key.ts` holds the PEM constant `isLicenseValid()` verifies against.

**Tech Stack:** Bun, `node:crypto` (`createVerify`, `generateKeyPairSync` in tests), `apps/api/src/lib/license.ts`, `apps/supervisor-api/src/lib/rsa.ts` (reference only, not modified), `packages/core`.

## Global Constraints

- Signature check must run **before** (or in addition to, order doesn't matter for correctness but do it first) the expiry check — any signature mismatch → `isLicenseValid()` returns `false`, full stop, regardless of `expiresAt`.
- Verification must **fail closed**: an unparseable/invalid public key or signature must produce `false`, never throw (mirror `apps/supervisor-api/src/lib/rsa.ts`'s `try { ... } catch { return false; }` pattern exactly).
- Do not modify `apps/supervisor-api/src/lib/rsa.ts`, `rsa.test.ts`, or `licenses.service.ts` — Supervisor's signing side is out of scope and already correct.
- Do not add a workspace dependency from `apps/api` → `apps/supervisor-api` (or vice versa) — see spec §2.3. The shared verify logic lives only in `packages/core`.
- Existing tests that use placeholder signature strings (`'mock-signature'`, `'sig'`, `'rsa-sig'`) in `apps/api/src/lib/license.test.ts`, `license-client.test.ts`, `activate.test.ts`, `license-middleware.test.ts` must all remain green unchanged — none of them call `isLicenseValid()` with a non-expired fixture that would newly fail (confirmed in spec §3.3). Only `license.test.ts` gets a new describe block.
- `packages/core/src/supervisor-public-key.ts` ships with a **fail-closed placeholder** (not a real key — the real Supervisor production public key does not exist yet as an artifact anywhere; see spec §2.2 open question). This is intentional: until an operator manually embeds the real PEM, `isLicenseValid()` always returns `false` for any real (non-mocked) `.lic`, which is the safe default. New/modified tests must mock `SUPERVISOR_PUBLIC_KEY_PEM` (via `mock.module('@dental/core/supervisor-public-key', ...)`) rather than depend on the placeholder.
- Import the two new `packages/core` modules in `apps/api/src/lib/license.ts` via **subpath** (`@dental/core/license-signature`, `@dental/core/supervisor-public-key`), not the barrel `@dental/core` — this lets tests mock just the public-key module without spreading/re-exporting the rest of `@dental/core`'s surface (`fail`, `ok`, `permissions`, etc.), avoiding the cross-test-file `mock.module` interference documented in `license-middleware.test.ts`'s comments.

---

### Task 1: `packages/core/src/license-signature.ts` — verify-only RSA signature check

**Files:**
- Create: `packages/core/src/license-signature.ts`
- Create: `packages/core/src/license-signature.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './license-signature.ts';`)

**Interfaces:**
- Consumes: `node:crypto`'s `createVerify` (built-in, no new dependency). Canonicalization logic is a **verify-only duplicate** of `apps/supervisor-api/src/lib/rsa.ts`'s `canonicalize` (`JSON.stringify(data, Object.keys(data).sort())`) — not imported (see Global Constraints / spec §2.3).
- Produces: `export const verifyLicenseSignature = (data: object, signature: string, publicKeyPem: string): boolean => { ... }` — same signature shape as `apps/supervisor-api/src/lib/rsa.ts`'s `verifySignature`, renamed to avoid ambiguity with the Supervisor-side function of the same concept living in a different package.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/license-signature.test.ts
import { describe, expect, it } from 'bun:test';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { verifyLicenseSignature } from './license-signature';

const generateKeyPair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
};

// Test-local sign helper — mirrors apps/supervisor-api/src/lib/rsa.ts's
// signLicense exactly (canonicalize + SHA256 sign), inlined here because
// apps/core cannot and should not depend on apps/supervisor-api.
// NOTE: `createSign` is imported at the top (ESM, `packages/core` is
// `"type": "module"`) — do NOT use `require('node:crypto')` inline, it is
// inconsistent with the rest of the file and will snag on lint/biome.
const signForTest = (data: object, privateKeyPem: string): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(privateKeyPem, 'hex');
};

describe('verifyLicenseSignature', () => {
  it('accepts a signature produced for the exact same payload', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const data = { clinicId: 'abc', modules: ['patients'], expiresAt: '2027-01-01' };
    const sig = signForTest(data, privateKey);
    expect(verifyLicenseSignature(data, sig, publicKey)).toBe(true);
  });

  it('rejects a signature when the payload has been tampered with', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const data = { clinicId: 'abc', modules: ['patients'] };
    const sig = signForTest(data, privateKey);
    const tampered = { clinicId: 'abc', modules: ['patients', 'lab'] };
    expect(verifyLicenseSignature(tampered, sig, publicKey)).toBe(false);
  });

  it('fails closed on a malformed public key instead of throwing', () => {
    const { privateKey } = generateKeyPair();
    const data = { clinicId: 'abc' };
    const sig = signForTest(data, privateKey);
    expect(() => verifyLicenseSignature(data, sig, 'not-a-real-pem')).not.toThrow();
    expect(verifyLicenseSignature(data, sig, 'not-a-real-pem')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test src/license-signature.test.ts
```

Expect a module-resolution error (`license-signature.ts` doesn't exist yet) or an import failure — confirms the test actually exercises new code.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/license-signature.ts
import { createVerify } from 'node:crypto';

// Verify-only duplicate of apps/supervisor-api/src/lib/rsa.ts's
// `canonicalize` + `verifySignature`. Intentionally NOT imported from
// apps/supervisor-api — see docs/superpowers/specs/2026-07-04-cli-362-*
// §2.3 (no workspace dependency edge between apps/api and
// apps/supervisor-api; they are separate deploy units). If Supervisor's
// signing algorithm ever changes (e.g. SHA256 -> SHA384), this file must
// be updated in lockstep by hand.
const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());

export const verifyLicenseSignature = (
  data: object,
  signature: string,
  publicKeyPem: string,
): boolean => {
  try {
    const verify = createVerify('SHA256');
    verify.update(canonicalize(data));
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
};
```

Also add to `packages/core/src/index.ts`:

```ts
export * from './license-signature.ts';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && bun test src/license-signature.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/license-signature.ts packages/core/src/license-signature.test.ts packages/core/src/index.ts
git commit -m "feat(core): add verify-only RSA license signature check"
```

---

### Task 2: `packages/core/src/supervisor-public-key.ts` — public key constant (fail-closed placeholder)

**Files:**
- Create: `packages/core/src/supervisor-public-key.ts`
- Create: `packages/core/src/supervisor-public-key.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './supervisor-public-key.ts';`)

**Interfaces:**
- Consumes: nothing (static string constant).
- Produces: `export const SUPERVISOR_PUBLIC_KEY_PEM: string`.

> **Note on TDD spirit here:** this task ships a data constant, not behavior — there is no meaningful "red" state to drive out via a failing assertion on logic. The test below instead locks the **shape contract** (`isLicenseValid()`/`verifyLicenseSignature()` callers can rely on it being a non-empty string) so a future accidental empty-string edit is caught. Treat Steps 1-2 as a shape-contract test, not a behavior-TDD cycle.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/supervisor-public-key.test.ts
import { describe, expect, it } from 'bun:test';
import { SUPERVISOR_PUBLIC_KEY_PEM } from './supervisor-public-key';

describe('SUPERVISOR_PUBLIC_KEY_PEM', () => {
  it('is exported as a non-empty string', () => {
    expect(typeof SUPERVISOR_PUBLIC_KEY_PEM).toBe('string');
    expect(SUPERVISOR_PUBLIC_KEY_PEM.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test src/supervisor-public-key.test.ts
```

Expect failure — module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/supervisor-public-key.ts
// Supervisor's RSA public key — verifies `.lic` signatures offline.
// The matching private key lives ONLY in the Supervisor VPS's
// `.env.production` (`RSA_PRIVATE_KEY`), never in this repo. This file is
// filled in by hand (copy-paste), per infra/supervisor/README.md
// "RSA keypair generation".
//
// ⚠️ OPEN QUESTION (docs/superpowers/specs/2026-07-04-cli-362-* §2.2):
// no real production keypair has been generated/persisted yet as of this
// writing — only a locally-generated dev RSA_PRIVATE_KEY exists in the
// gitignored apps/supervisor-api/.env, with no corresponding public-key
// artifact saved anywhere. An operator must decide (a) treat that dev key
// as the permanent root of trust and derive its public half via
// `crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' })`,
// or (b) generate a fresh production keypair via the README snippet —
// then paste the resulting PEM below, replacing this placeholder.
//
// Until replaced, this is NOT a valid PEM: `verifyLicenseSignature()` will
// fail closed (return false) for every real `.lic` file. This is the
// intended safe default — no license silently verifies against a
// placeholder.
export const SUPERVISOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
REPLACE_ME_BEFORE_PRODUCTION_DEPLOY_SEE_COMMENT_ABOVE
-----END PUBLIC KEY-----
`;
```

Also add to `packages/core/src/index.ts`:

```ts
export * from './supervisor-public-key.ts';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && bun test src/supervisor-public-key.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/supervisor-public-key.ts packages/core/src/supervisor-public-key.test.ts packages/core/src/index.ts
git commit -m "feat(core): add Supervisor public key constant (fail-closed placeholder)"
```

---

### Task 3: Wire signature verification into `isLicenseValid()`

**Files:**
- Modify: `apps/api/src/lib/license.ts:78-90` (removes the `TODO(security)` comment block, adds the check)
- Test: `apps/api/src/lib/license.test.ts` (exists already — see `Read` in investigation; adds a new `describe('isLicenseValid — signature verification')` block, does not touch existing describes)

**Interfaces:**
- Consumes: `verifyLicenseSignature(data: object, signature: string, publicKeyPem: string): boolean` and `SUPERVISOR_PUBLIC_KEY_PEM: string` from `packages/core` (Tasks 1-2). **Investigated and confirmed:** `apps/supervisor-api/src/lib/rsa.ts`'s own `verifySignature` cannot be imported directly by `apps/api` — `apps/api/package.json` has no `@supervisor/api` dependency, and `apps/supervisor-api/package.json` has `"private": true` with no `exports` field (it's a standalone app, not a consumable package). Hence the duplicated `packages/core` copy from Task 1 is used instead (see spec §2.3 for the full reasoning).
- Produces: `isLicenseValid(data: LicenseData): boolean` — same public signature as today, now additionally signature-checked.

- [ ] **Step 1: Write the failing test**

**Critical ordering requirement:** the existing describe blocks in this file (`getFingerprint`, `writeLicense + readLicense`, `isLicenseValid`) already `await import('./license')` before any new code runs. Once `./license` is imported anywhere in the file, it (and its static import of `@dental/core/supervisor-public-key`) is cached by the module system — a `mock.module('@dental/core/supervisor-public-key', ...)` call registered *after* that first import is not guaranteed to retroactively change what the already-evaluated `./license` module sees. This mirrors exactly why the file's existing `mock.module('systeminformation', ...)` is registered at **top level**, before any describe block. Do the same here: register the public-key mock and generate the test keypair once, at module scope, alongside the existing top-level `mock.module('systeminformation', ...)` call — do not put `mock.module` calls inside individual `test()`/`it()` bodies for this file.

```ts
// Add near the TOP of apps/api/src/lib/license.test.ts, alongside the
// existing top-level `mock.module('systeminformation', ...)` call (must
// run before any `await import('./license')` in the file, including the
// existing describe blocks below).
import { createSign, generateKeyPairSync } from 'node:crypto';

const testKeypair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

mock.module('@dental/core/supervisor-public-key', () => ({
  SUPERVISOR_PUBLIC_KEY_PEM: testKeypair.publicKey,
}));

const signForTest = (data: object): string => {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  const sign = createSign('SHA256');
  sign.update(canonical);
  return sign.sign(testKeypair.privateKey, 'hex');
};
```

```ts
// Append to apps/api/src/lib/license.test.ts (after the existing
// `describe('isLicenseValid', ...)` block — do not modify the existing block)

describe('isLicenseValid — signature verification (CLI-362)', () => {
  test('accepts a non-expired license whose signature matches the (mocked) public key', async () => {
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), // 30 kun keyin
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
    };
    const signature = signForTest(payload);

    const { isLicenseValid } = await import('./license');
    expect(isLicenseValid({ ...payload, signature })).toBe(true);
  });

  test('rejects the same license after modules/expiresAt are tampered with (fingerprint-forge scenario)', async () => {
    const payload = {
      licenseKey: 'K',
      clinicId: 'c',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      gracePeriodDays: 0,
      issuedAt: new Date().toISOString(),
    };
    const signature = signForTest(payload);

    // A local admin who knows getFingerprint()'s output (non-secret) could
    // rewrite the .lic file with this exact mutation using the old code.
    const forged = {
      ...payload,
      modules: ['patients', 'lab-orders', 'clinical'], // enable modules not licensed
      expiresAt: new Date(Date.now() + 86400000 * 3650).toISOString(), // extend 10 years
      signature, // stale signature, no longer matches the mutated payload
    };

    const { isLicenseValid } = await import('./license');
    expect(isLicenseValid(forged)).toBe(false);
  });
});
```

Both tests share the single module-scope `testKeypair` and `signForTest` helper — no per-test keypair generation, no per-test `mock.module` calls. This also does not break the existing `isLicenseValid` expiry test: that fixture's `signature: 'sig'` fails the new signature check regardless (it was never signed by `testKeypair`), and its expiry is already in the past, so `expect(isLicenseValid(expired)).toBe(false)` still holds — false via two independent reasons now instead of one.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun test --env-file=../../.env src/lib/license.test.ts
```

Expect the new tests to fail: `isLicenseValid` today ignores `signature` entirely, so the "accepts a non-expired license..." test should already pass trivially (false positive — expiry-only logic happens to return `true`), while the "rejects... tampered" test should **fail** (current code returns `true` for `forged` since only expiry is checked and the forged expiry is even further in the future). This asymmetry is expected and exactly demonstrates the vulnerability: confirm the tampered-rejection test is the one failing before proceeding.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/license.ts
// Replace the import block at the top (add):
import { verifyLicenseSignature } from '@dental/core/license-signature';
import { SUPERVISOR_PUBLIC_KEY_PEM } from '@dental/core/supervisor-public-key';

// Replace lines 78-90 (the TODO(security) comment + old isLicenseValid) with:
export const isLicenseValid = (data: LicenseData): boolean => {
  const { signature, ...payload } = data;
  if (!verifyLicenseSignature(payload, signature, SUPERVISOR_PUBLIC_KEY_PEM)) {
    return false;
  }
  const expiry = new Date(data.expiresAt).getTime();
  const grace = data.gracePeriodDays * 86400000;
  return Date.now() < expiry + grace;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun test --env-file=../../.env src/lib/license.test.ts
```

Then run the full regression set to confirm no other file broke (Global Constraints — these must stay green unchanged):

```bash
cd apps/api && bun test --env-file=../../.env src/lib/license.test.ts src/lib/license-client.test.ts src/lib/license-middleware.test.ts src/routes/activate.test.ts
```

Then typecheck both touched packages:

```bash
cd apps/api && bun run typecheck
cd packages/core && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/license.ts apps/api/src/lib/license.test.ts
git commit -m "fix(api): verify RSA signature in isLicenseValid (CLI-362)"
```

---

## Manual Follow-up (outside TDD scope — operator action, not agentic)

`packages/core/src/supervisor-public-key.ts` ships with a fail-closed placeholder (Task 2). Before this protection has any real-world effect against a genuinely signed Supervisor license, an operator must:

1. Decide between the two options in spec §2.2 (reuse the existing dev `RSA_PRIVATE_KEY` in `apps/supervisor-api/.env` as the permanent root of trust, vs. generate a fresh production keypair per `infra/supervisor/README.md`).
2. Derive/obtain the matching public key PEM.
3. Replace the placeholder string in `packages/core/src/supervisor-public-key.ts` with the real PEM.
4. Open a follow-up Linear ticket if this isn't done immediately (do not silently leave this plan's completion implying the real key is in place — Tasks 1-3 make the code correct and fully tested against a *test* keypair; the production key swap is a separate, deliberately manual, non-automatable step).

---

## Self-review (placeholders / type-consistency check)

- No `TODO`/`<placeholder>` remains in any code sample above except the **intentional** fail-closed PEM placeholder in Task 2 (which is the documented, deliberate design — not an oversight) and the inline `<OPERATOR: ...>` marker in the spec doc (not the plan's implementation code).
- `LicenseData` field set used in Task 3's test payload (`licenseKey`, `clinicId`, `modules`, `expiresAt`, `gracePeriodDays`, `issuedAt`, `signature`) matches the interface exactly as read from `apps/api/src/lib/license.ts:6-14`.
- `verifyLicenseSignature`'s signature (`(data: object, signature: string, publicKeyPem: string): boolean`) is consistent between its Task 1 definition and its Task 3 call site.
- `payload` destructuring (`const { signature, ...payload } = data`) in Task 3 produces exactly the 6-field object shape that `apps/supervisor-api/src/modules/licenses/licenses.service.ts`'s `buildResponse` signs — verified field-by-field in spec §2.1/§3.2.
- Import paths (`@dental/core/license-signature`, `@dental/core/supervisor-public-key`) rely on `packages/core/package.json`'s existing `"./*": "./src/*"` exports map (confirmed present, no `package.json` change needed).
- Test file commands use `bun test` for `packages/core` (matches its `package.json` `"test": "bun test"`) and `bun test --env-file=../../.env` for `apps/api` (matches project convention noted in memory / `apps/api/package.json`'s own `"test": "bun test"` run from the `apps/api` directory where `../../.env` resolves to the repo root `.env`).
- Flagged, not invented: the real Supervisor production public key's existence/location (spec §2.2) — this plan does not fabricate a key or guess where one might already live beyond what was actually found (`apps/supervisor-api/.env`, dev-only, gitignored, no public-half artifact).
- Task 3's test mocks (`mock.module('@dental/core/supervisor-public-key', ...)`) are registered at **module top level** in `license.test.ts`, generated once via a shared `testKeypair`/`signForTest` helper — not per-`test()` — because the file's existing describe blocks already `await import('./license')` before any new code runs, and a post-hoc `mock.module` call cannot be relied on to retroactively rewire an already-evaluated module's static import (same reasoning that makes the file's existing `systeminformation` mock top-level). Confirmed this doesn't regress the existing expiry test: `signature: 'sig'` fails the new check independently of the (still-past) expiry, so `toBe(false)` holds either way.
- `packages/core/src/license-signature.test.ts`'s `signForTest` helper imports `createSign` at the top (ESM) rather than `require('node:crypto')` inline — consistent with the file's other top-level `node:crypto` imports and avoids a CJS `require` in a `"type": "module"` package.
