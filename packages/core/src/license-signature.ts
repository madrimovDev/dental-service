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

/**
 * `canonicalize`ning replacer massivi (`Object.keys(data).sort()`) JSON.stringify
 * tomonidan BARCHA ichki darajalarga qo'llanadi — nested obyekt kalitlari
 * ro'yxatda bo'lmagani uchun butunlay tushib qoladi va imzo ularni HIMOYA
 * QILMAYDI (`{"provisioning":{}}`). Shuning uchun imzolanadigan payload qat'iy
 * tekis bo'lishi shart. Tekis payload uchun canonicalize chiqishi o'zgarmaydi —
 * mavjud `.lic` fayllari va imzolar buzilmaydi.
 *
 * Massivlarga ruxsat beriladi (`modules: string[]` — mavjud litsenziya payloadi),
 * lekin ichida obyekt bo'lsa rad etiladi.
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

export const verifyLicenseSignature = (
  data: object,
  signature: string,
  publicKeyPem: string,
): boolean => {
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
