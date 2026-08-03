import { describe, expect, it } from 'bun:test';
import { createSign } from 'node:crypto';
import { assertFlatSignaturePayload, generateKeyPair, signLicense, verifySignature } from './rsa';

describe('RSA license signing', () => {
  it('sign + verify round-trip', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const data = {
      clinicId: 'abc',
      expiresAt: '2027-01-01',
      modules: ['patients'],
    };
    const sig = signLicense(data, privateKey);
    expect(verifySignature(data, sig, publicKey)).toBe(true);
  });

  it('rejects tampered data', () => {
    const { privateKey, publicKey } = generateKeyPair();
    const data = { clinicId: 'abc', modules: ['patients'] };
    const sig = signLicense(data, privateKey);
    const tampered = { clinicId: 'abc', modules: ['patients', 'lab'] };
    expect(verifySignature(tampered, sig, publicKey)).toBe(false);
  });
});

describe('rsa flat-payload guard', () => {
  const { privateKey, publicKey } = generateKeyPair();

  it('tekis payload imzolanadi va tekshiriladi', () => {
    const payload = {
      licenseKey: 'K',
      modules: ['patients'],
      issuedAt: '2026-08-03T00:00:00.000Z',
    };
    const sig = signLicense(payload, privateKey);
    expect(verifySignature(payload, sig, publicKey)).toBe(true);
  });

  it('nested payload imzolashda xato beradi', () => {
    expect(() => signLicense({ a: 'x', nested: { b: 'y' } }, privateKey)).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it("obyektlar massivi bo'lgan payload ham imzolanmaydi", () => {
    expect(() => signLicense({ a: [{ b: 'y' }] }, privateKey)).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it('nested payload tekshiruvi throw emas, false qaytaradi', () => {
    const data = { clinicId: 'abc', provisioning: { ownerPassword: 'maxfiy' } };
    // Guard'gacha yozilgan imzo — `signLicense`ni chetlab, guard'siz imzolaymiz.
    // Bu imzo guard'siz `true` bo'lardi (canonicalize nested kalitlarni tashlab
    // `{"clinicId":"abc","provisioning":{}}` beradi) — endi fail-closed `false`.
    const sign = createSign('SHA256');
    sign.update(JSON.stringify(data, Object.keys(data).sort()));
    const sig = sign.sign(privateKey, 'hex');
    expect(() => verifySignature(data, sig, publicKey)).not.toThrow();
    expect(verifySignature(data, sig, publicKey)).toBe(false);
  });
});

// Lockstep pariteti: aynan shu holatlar `packages/core/src/license-signature.test.ts`
// dagi `assertFlatSignaturePayload` bloki bilan bir xil. Ikki nusxa xulqi ajralib
// ketsa (masalan biri `null`ni rad eta boshlasa) shu yerda ushlanadi.
describe('assertFlatSignaturePayload (core nusxasi bilan parite)', () => {
  it('tekis obyektni qabul qiladi (string, number, boolean, string[])', () => {
    expect(() =>
      assertFlatSignaturePayload({ a: 'x', b: 1, c: true, d: ['p', 'q'] }),
    ).not.toThrow();
  });

  it('nested obyektda xato beradi', () => {
    expect(() => assertFlatSignaturePayload({ a: 'x', nested: { b: 'y' } })).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it('obyektlar massivida ham xato beradi', () => {
    expect(() => assertFlatSignaturePayload({ a: [{ b: 'y' }] })).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it('null qiymatga ruxsat beradi', () => {
    expect(() => assertFlatSignaturePayload({ a: null })).not.toThrow();
  });
});
