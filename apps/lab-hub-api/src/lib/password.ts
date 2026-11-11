import { randomBytes } from 'node:crypto';

// Bun.password — argon2id (default). Vaqtinchalik parol: chalkashadigan belgilarsiz, 16 belgi.
export const hashPassword = (plain: string) => Bun.password.hash(plain);
export const verifyPassword = (plain: string, hash: string) => Bun.password.verify(plain, hash);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const generateTempPassword = (): string =>
  Array.from(randomBytes(16), (b) => ALPHABET[b % ALPHABET.length]).join('');

export const MIN_PASSWORD_LENGTH = 12;
