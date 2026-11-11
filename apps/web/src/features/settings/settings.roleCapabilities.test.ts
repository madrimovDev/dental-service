import type { PermissionDef } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { canGrantRole, summarizeRole } from './settings.roleCapabilities';

const def = (code: string, uz: string | null): PermissionDef => ({
  id: code,
  code,
  category: code.split('.')[0] ?? '',
  descriptionUz: uz,
  descriptionRu: null,
});

describe("canGrantRole (assertCanGrant ko'zgusi)", () => {
  it('owner hamma rolni bera oladi', () => {
    expect(canGrantRole(['@owner'], ['cashier.refund', 'tenant.delete'])).toBe(true);
  });
  it("o'zida yo'q ruxsatli rolni bera olmaydi", () => {
    expect(canGrantRole(['patient.view'], ['patient.view', 'cashier.refund'])).toBe(false);
  });
  it("to'liq qamrab olgan bo'lsa beradi; owner-only kodlar e'tiborsiz", () => {
    expect(canGrantRole(['patient.view'], ['patient.view', 'tenant.delete'])).toBe(true);
  });
});

describe('summarizeRole', () => {
  const catalog = [def('patient.view', "Bemorlarni ko'rish"), def('cashier.refund', null)];
  it("can/cannot ni katalogdan ajratadi, tavsif yo'q bo'lsa kod", () => {
    const r = summarizeRole(['patient.view'], catalog, 'uz');
    expect(r.can).toEqual(["Bemorlarni ko'rish"]);
    expect(r.cannot).toEqual(['cashier.refund']);
  });
});
