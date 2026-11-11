import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Lab Hub saqlashdagi shifrlash (spec §3, L2) — konvert sxemasi.
 *
 *  - KEK (master kalit) faqat `LAB_HUB_KEK` env'da (base64, 32 bayt). Bazada ham,
 *    zaxirada ham yo'q. Yo'q/noto'g'ri bo'lsa `loadKek` throw qiladi → boot yiqiladi.
 *  - Har lab uchun alohida DEK (32 bayt). `labs.dek_wrapped` = KEK bilan
 *    AES-256-GCM o'ralgan DEK; labId AAD sifatida bog'lanadi (bir lab qatoriga
 *    boshqa labning o'ralgan DEK'ini ko'chirib bo'lmaydi).
 *  - Maydonlar: `v1:<iv>:<tag>:<ct>` (base64). Fayllar: `LHF1` + iv(12) + tag(16) + ct.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const FILE_MAGIC = Buffer.from('LHF1');

export type Key = Buffer;

export const loadKek = (raw: string | undefined): Key => {
  if (!raw) throw new Error('LAB_HUB_KEK is required (base64, 32 bytes)');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw.trim())) {
    throw new Error('LAB_HUB_KEK must be base64');
  }
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) throw new Error('LAB_HUB_KEK must decode to exactly 32 bytes');
  return key;
};

export const generateDek = (): Key => randomBytes(32);

const seal = (key: Key, plain: Buffer, aad?: string) => {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
};

const open = (key: Key, iv: Buffer, tag: Buffer, ct: Buffer, aad?: string): Buffer => {
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) throw new Error('crypto.malformed');
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
};

const pack = ({ iv, tag, ct }: { iv: Buffer; tag: Buffer; ct: Buffer }) =>
  `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;

const unpack = (value: string) => {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('crypto.unsupported_format');
  const [, iv, tag, ct] = parts as [string, string, string, string];
  return {
    iv: Buffer.from(iv, 'base64'),
    tag: Buffer.from(tag, 'base64'),
    ct: Buffer.from(ct, 'base64'),
  };
};

export const wrapDek = (kek: Key, dek: Key, labId: string): string =>
  pack(seal(kek, dek, `lab-dek:${labId}`));

export const unwrapDek = (kek: Key, wrapped: string, labId: string): Key => {
  const { iv, tag, ct } = unpack(wrapped);
  const dek = open(kek, iv, tag, ct, `lab-dek:${labId}`);
  if (dek.length !== 32) throw new Error('crypto.bad_dek');
  return dek;
};

export const encryptString = (dek: Key, plain: string): string =>
  pack(seal(dek, Buffer.from(plain, 'utf8')));

export const decryptString = (dek: Key, value: string): string => {
  const { iv, tag, ct } = unpack(value);
  return open(dek, iv, tag, ct).toString('utf8');
};

/** null/undefined o'tkazib yuboriladi — ixtiyoriy maydonlar uchun. */
export const encryptOptional = (dek: Key, plain: string | null | undefined): string | null =>
  plain == null || plain === '' ? null : encryptString(dek, plain);

export const decryptOptional = (dek: Key, value: string | null | undefined): string | null =>
  value == null ? null : decryptString(dek, value);

export const encryptBuffer = (dek: Key, plain: Buffer): Buffer => {
  const { iv, tag, ct } = seal(dek, plain);
  return Buffer.concat([FILE_MAGIC, iv, tag, ct]);
};

export const decryptBuffer = (dek: Key, blob: Buffer): Buffer => {
  if (blob.length < FILE_MAGIC.length + IV_LEN + TAG_LEN) throw new Error('crypto.malformed');
  if (!blob.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) {
    throw new Error('crypto.unsupported_format');
  }
  let o = FILE_MAGIC.length;
  const iv = blob.subarray(o, o + IV_LEN);
  o += IV_LEN;
  const tag = blob.subarray(o, o + TAG_LEN);
  o += TAG_LEN;
  return open(dek, iv, tag, blob.subarray(o));
};

const CANARY_AAD = 'kek-check:v1';

/** KEK kanareykasi: tasodifiy 32 bayt KEK bilan o'raladi (`lib/kek-check.ts`). */
export const sealKekCanary = (kek: Key): string => pack(seal(kek, randomBytes(32), CANARY_AAD));

/** Noto'g'ri KEK → GCM autentifikatsiya xatosi (throw). */
export const openKekCanary = (kek: Key, value: string): void => {
  const { iv, tag, ct } = unpack(value);
  open(kek, iv, tag, ct, CANARY_AAD);
};
