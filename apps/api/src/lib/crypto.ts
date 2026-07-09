import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from './env.ts';

// 32-byte AES-256 key. Cloud: MESSAGING_SECRET env (hex/utf8, >=32 chars).
// Desktop: persisted file in dataDir (jwt-secret.txt pattern) — machine-local.

const getSecretPath = (): string =>
  process.env.MESSAGING_SECRET_PATH ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\messaging-secret.txt'
    : `${process.env.DENTAL_DATA_DIR ?? '/var/lib/dental-service'}/messaging-secret.txt`);

export const getOrCreateMessagingSecret = (): Buffer => {
  const fromEnv = env.MESSAGING_SECRET;
  if (fromEnv) {
    // Set but too short — this is a misconfiguration, not the legitimate
    // "unset" desktop path. Silently falling through to the file key here
    // would let a cloud deploy with a bad MESSAGING_SECRET regenerate a new
    // file key on every redeploy (ephemeral container, no persistent volume),
    // orphaning every previously encrypted credential without any signal.
    if (fromEnv.length < 32) {
      throw new Error('MESSAGING_SECRET must be >=32 chars');
    }
    return Buffer.from(fromEnv).subarray(0, 32);
  }
  const path = getSecretPath();
  let hex: string;
  if (existsSync(path)) {
    hex = readFileSync(path, 'utf8').trim();
  } else {
    hex = randomBytes(32).toString('hex');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, hex, { mode: 0o600 });
  }
  return Buffer.from(hex, 'hex').subarray(0, 32);
};

export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getOrCreateMessagingSecret(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
};

export const decryptSecret = (enc: string): string => {
  const [ivB64, tagB64, ctB64] = enc.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getOrCreateMessagingSecret(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
    'utf8',
  );
};
