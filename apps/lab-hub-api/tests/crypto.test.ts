import { describe, expect, it } from 'bun:test';
import { randomBytes } from 'node:crypto';
import {
  decryptBuffer,
  decryptString,
  encryptBuffer,
  encryptString,
  generateDek,
  loadKek,
  unwrapDek,
  wrapDek,
} from '../src/lib/crypto';

const kek = loadKek(randomBytes(32).toString('base64'));

describe('loadKek', () => {
  it("KEK yo'q bo'lsa throw qiladi", () => {
    expect(() => loadKek(undefined)).toThrow(/LAB_HUB_KEK/);
    expect(() => loadKek('')).toThrow(/LAB_HUB_KEK/);
  });

  it('32 baytdan farqli KEK rad etiladi', () => {
    expect(() => loadKek(randomBytes(16).toString('base64'))).toThrow(/32/);
    expect(() => loadKek('not-base64-%%%')).toThrow();
  });
});

describe('DEK konverti', () => {
  it("wrap/unwrap round-trip, labId AAD sifatida bog'langan", () => {
    const dek = generateDek();
    const wrapped = wrapDek(kek, dek, 'lab-a');
    expect(wrapped.startsWith('v1:')).toBe(true);
    expect(unwrapDek(kek, wrapped, 'lab-a').equals(dek)).toBe(true);
    // boshqa lab nomi bilan ochib bo'lmaydi
    expect(() => unwrapDek(kek, wrapped, 'lab-b')).toThrow();
  });

  it('boshqa KEK bilan ochilmaydi', () => {
    const wrapped = wrapDek(kek, generateDek(), 'lab-a');
    const other = loadKek(randomBytes(32).toString('base64'));
    expect(() => unwrapDek(other, wrapped, 'lab-a')).toThrow();
  });
});

describe('maydon shifrlash', () => {
  const dek = generateDek();

  it('round-trip (unicode)', () => {
    const ct = encryptString(dek, "Aliyev Vali G'ani o'g'li — Ўзбек");
    expect(ct).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(ct).not.toContain('Aliyev');
    expect(decryptString(dek, ct)).toBe("Aliyev Vali G'ani o'g'li — Ўзбек");
  });

  it('har shifrlashda IV yangi (bir xil matn — har xil shifr)', () => {
    expect(encryptString(dek, 'x')).not.toBe(encryptString(dek, 'x'));
  });

  it('buzilgan tag rad etiladi', () => {
    const ct = encryptString(dek, 'secret');
    const [v, iv, tag, body] = ct.split(':') as [string, string, string, string];
    const badTag = Buffer.from(tag, 'base64');
    badTag[0] = (badTag[0] ?? 0) ^ 0xff;
    expect(() => decryptString(dek, [v, iv, badTag.toString('base64'), body].join(':'))).toThrow();
    const badBody = Buffer.from(body, 'base64');
    badBody[0] = (badBody[0] ?? 0) ^ 0x01;
    expect(() => decryptString(dek, [v, iv, tag, badBody.toString('base64')].join(':'))).toThrow();
  });

  it("noma'lum versiya rad etiladi", () => {
    expect(() => decryptString(dek, 'v9:a:b:c')).toThrow();
  });
});

describe('fayl shifrlash', () => {
  it('round-trip, ochiq bayt shifrda yo‘q', () => {
    const dek = generateDek();
    const plain = Buffer.from('solid STL PATIENT-MARKER '.repeat(100));
    const enc = encryptBuffer(dek, plain);
    expect(enc.includes(Buffer.from('PATIENT-MARKER'))).toBe(false);
    expect(decryptBuffer(dek, enc).equals(plain)).toBe(true);
    const tampered = Buffer.from(enc);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
    expect(() => decryptBuffer(dek, tampered)).toThrow();
  });
});
