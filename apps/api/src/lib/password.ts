/**
 * Password hashing va verifikatsiya.
 * Bun native `Bun.password` argon2id ishlatadi (NIST + OWASP zamonaviy tavsiyasi).
 *
 * Hash output format: `$argon2id$v=19$m=...$t=...$p=...$<salt>$<hash>`
 * Salt avtomatik generate qilinadi, alohida saqlash kerak emas.
 */

export const hashPassword = (plain: string): Promise<string> =>
  Bun.password.hash(plain, { algorithm: 'argon2id' });

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  Bun.password.verify(plain, hash);
