import { describe, expect, it } from 'bun:test';
import { generateKeyPair, signLicense, verifySignature } from './rsa';

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
