import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';

const canonicalize = (data: object): string =>
  JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());

export const generateKeyPair = (): { privateKey: string; publicKey: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
};

export const signLicense = (data: object, privateKeyPem: string): string => {
  const sign = createSign('SHA256');
  sign.update(canonicalize(data));
  return sign.sign(privateKeyPem, 'hex');
};

export const verifySignature = (data: object, signature: string, publicKeyPem: string): boolean => {
  try {
    const verify = createVerify('SHA256');
    verify.update(canonicalize(data));
    return verify.verify(publicKeyPem, signature, 'hex');
  } catch {
    return false;
  }
};
