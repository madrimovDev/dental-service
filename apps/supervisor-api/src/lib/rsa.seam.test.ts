/**
 * CROSS-APP SEAM testi — Supervisor imzolaydi, klinika (`packages/core`)
 * tekshiradi.
 *
 * `rsa.ts` (bu yerda) va `packages/core/src/license-signature.ts` — QO'LDA
 * lockstep'da saqlanadigan ikki nusxa (ikkala app alohida deploy unit, orasida
 * workspace bog'liqlik qirrasi YO'Q — RFC/spec qaroriga qarang). Nusxalar
 * divergensiya qilsa, prod'da aktivatsiya imzo tekshiruvida yiqiladi va buni
 * har ikki tomonning O'Z testlari HECH QACHON ushlamaydi — ular faqat o'z
 * nusxasini sinaydi.
 *
 * Shu sababli bu YAGONA joy `packages/core`ni nisbiy yo'l orqali import qiladi.
 * Bu FAQAT test bog'liqligi — prod kodida bunday import YO'Q va bo'lmasligi
 * kerak (`package.json`ga `@dental/core` QO'SHILMAYDI).
 *
 * Kalitlar bu yerda har safar yangi generatsiya qilinadi — test kod
 * mosligini sinaydi, muayyan muhitning kalit juftligini emas (lokal `.env`
 * dagi `RSA_PRIVATE_KEY` prod public key bilan juft bo'lmasligi mumkin;
 * bu boshqa muammo va bu test uchun ahamiyatsiz).
 */
import { describe, expect, it } from 'bun:test';
import { verifyLicenseSignature } from '../../../../packages/core/src/license-signature';
import { generateKeyPair, signLicense } from './rsa';

const { privateKey, publicKey } = generateKeyPair();

// `licenses.service.ts` `buildResponse` payloadining aynan shakli
const licensePayload = {
  licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
  clinicId: '11111111-1111-1111-1111-111111111111',
  modules: ['patients', 'appointments', 'queue'],
  expiresAt: '2027-01-01T00:00:00.000Z',
  gracePeriodDays: 30,
  issuedAt: '2026-08-04T00:00:00.000Z',
  fingerprint: 'a'.repeat(64),
};

// `licenses.service.ts` `buildProvisioning` blokining aynan shakli — 11 tekis
// string maydon, bo'shlari `''` (undefined EMAS: JSON.stringify undefined
// kalitni tashlaydi va imzo mos kelmay qoladi)
const provisioning = {
  licenseKey: licensePayload.licenseKey,
  clinicId: licensePayload.clinicId,
  issuedAt: licensePayload.issuedAt,
  tenantName: 'Test klinika',
  defaultLanguage: 'uz',
  ownerFullName: 'Ali Valiyev',
  ownerPhone: '+998901234567',
  ownerPassword: 'AbCdEfGh2345',
  branchName: 'Bosh filial',
  branchAddress: '',
  branchPhone: '',
};

describe('cross-app imzo seam (supervisor imzolaydi → core tekshiradi)', () => {
  it('litsenziya payloadi klinika tomonida tekshiruvdan o‘tadi', () => {
    const sig = signLicense(licensePayload, privateKey);
    expect(verifyLicenseSignature(licensePayload, sig, publicKey)).toBe(true);
  });

  it('provisioning bloki klinika tomonida tekshiruvdan o‘tadi', () => {
    const sig = signLicense(provisioning, privateKey);
    expect(verifyLicenseSignature(provisioning, sig, publicKey)).toBe(true);
  });

  it('buzilgan provisioning bloki klinika tomonida RAD etiladi', () => {
    const sig = signLicense(provisioning, privateKey);
    const tampered = { ...provisioning, ownerPhone: '+998900000000' };
    expect(verifyLicenseSignature(tampered, sig, publicKey)).toBe(false);
  });

  it('maydon tushib qolsa (undefined → kalit yo‘qoladi) imzo mos kelmaydi', () => {
    const sig = signLicense(provisioning, privateKey);
    const { branchAddress: _drop, ...missing } = provisioning;
    expect(verifyLicenseSignature(missing, sig, publicKey)).toBe(false);
  });

  it('ikkala nusxa nested payloadni bir xil rad etadi', () => {
    const nested = { a: 'x', nested: { b: 'y' } };
    expect(() => signLicense(nested, privateKey)).toThrow('SIGNATURE_PAYLOAD_NOT_FLAT');
    // core tomonida guard `try` ichida — `false` qaytaradi (fail-closed)
    expect(verifyLicenseSignature(nested, 'ff'.repeat(32), publicKey)).toBe(false);
  });
});
