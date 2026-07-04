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
