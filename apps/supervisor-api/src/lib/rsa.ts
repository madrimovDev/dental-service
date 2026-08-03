import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';

const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());

/**
 * `canonicalize`ning replacer massivi (`Object.keys(data).sort()`) JSON.stringify
 * tomonidan BARCHA ichki darajalarga qo'llanadi — nested obyekt kalitlari
 * ro'yxatda bo'lmagani uchun butunlay tushib qoladi va imzo ularni HIMOYA
 * QILMAYDI (`{"provisioning":{}}`). Shuning uchun imzolanadigan payload qat'iy
 * tekis bo'lishi shart. Tekis payload uchun canonicalize chiqishi o'zgarmaydi —
 * mavjud `.lic` fayllari va imzolar buzilmaydi.
 *
 * Verify-only duplicate — see packages/core/src/license-signature.ts. Klinika
 * (`apps/api`) va Supervisor alohida deploy unit, ular orasida workspace import
 * qirrasi YO'Q — ikkala nusxa QO'LDA LOCKSTEP saqlanadi.
 */
export const assertFlatSignaturePayload = (data: object): void => {
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      if (value.some((item) => typeof item === 'object' && item !== null)) {
        throw new Error('SIGNATURE_PAYLOAD_NOT_FLAT');
      }
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      throw new Error('SIGNATURE_PAYLOAD_NOT_FLAT');
    }
  }
};

export const generateKeyPair = (): { privateKey: string; publicKey: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
};

export const signLicense = (data: object, privateKeyPem: string): string => {
  // Ataylab USHLANMAYDI — noto'g'ri (nested) payload hech qachon imzolanmasin.
  assertFlatSignaturePayload(data);
  const sign = createSign('SHA256');
  sign.update(canonicalize(data));
  return sign.sign(privateKeyPem, 'hex');
};

export const verifySignature = (data: object, signature: string, publicKeyPem: string): boolean => {
  try {
    // Nested payload imzo bilan himoyalanmagan — `false` (fail-closed).
    assertFlatSignaturePayload(data);
    const verify = createVerify('SHA256');
    verify.update(canonicalize(data));
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
};
