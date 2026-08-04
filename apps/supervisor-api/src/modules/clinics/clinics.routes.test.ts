import { describe, expect, it } from 'bun:test';
import { generateTempPassword } from './clinics.routes';

describe('generateTempPassword', () => {
  it('kamida 12 belgi (apps/api password siyosati: min(12).max(128))', () => {
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(12);
  });

  it('har chaqiruvda boshqa qiymat', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });

  it("faqat chalkashmaydigan belgilar (0/O, 1/l/I yo'q)", () => {
    expect(generateTempPassword()).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/);
  });
});
