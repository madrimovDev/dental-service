import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Klinika Hub kaliti: 256-bit tasodifiy; Hub'da faqat SHA-256 saqlanadi. */
export const generateHubKey = () => `lhk_${randomBytes(32).toString('base64url')}`;
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(sha256Hex(a), 'hex');
  const bb = Buffer.from(sha256Hex(b), 'hex');
  return timingSafeEqual(ab, bb);
};

export const bearer = (header: string | undefined): string | null =>
  header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
