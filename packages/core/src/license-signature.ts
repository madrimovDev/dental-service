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
