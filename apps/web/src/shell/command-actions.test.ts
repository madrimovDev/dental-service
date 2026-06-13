import { describe, expect, it, vi } from 'vitest';
import { buildPatientActions, buildQuickActions, buildStaffActions } from './command-actions';

const t = (k: string) => k;
const noop = () => {};

describe('buildQuickActions', () => {
  it("permission yo'q bo'lsa amal tushadi", () => {
    const actions = buildQuickActions({ t, navigate: noop, has: () => false });
    expect(actions.find((a) => a.id === 'new-patient')).toBeUndefined();
  });
  it("permission bor bo'lsa amal qoladi", () => {
    const actions = buildQuickActions({ t, navigate: noop, has: (p) => p === 'patient.create' });
    expect(actions.find((a) => a.id === 'new-patient')).toBeDefined();
  });
});

describe('buildPatientActions (CLI-163)', () => {
  it("bemorni amal sifatida map qiladi (id/nom/telefon/detal yo'li)", () => {
    const nav = vi.fn();
    const actions = buildPatientActions(
      [{ id: 'p1', fullName: 'Salimova Dilnoza', phone: '+998900000000' }],
      'salim',
      nav,
    );
    expect(actions[0]).toMatchObject({
      id: 'patient-p1',
      label: 'Salimova Dilnoza',
      description: '+998900000000',
      keywords: 'salim',
    });
    actions[0]?.onClick();
    expect(nav).toHaveBeenCalledWith('/patients/p1');
  });

  it("telefonsiz bemor description'siz", () => {
    const actions = buildPatientActions([{ id: 'p2', fullName: 'Anon', phone: null }], 'an', noop);
    expect(actions[0]?.description).toBeUndefined();
  });
});

describe('buildStaffActions (CLI-163)', () => {
  it("xodimni map qiladi va /settings/users ga yo'naltiradi", () => {
    const nav = vi.fn();
    const actions = buildStaffActions(
      [{ userId: 'u1', userFullName: 'Doktor Salimov', userPhone: '+998901112233' }],
      nav,
    );
    expect(actions[0]).toMatchObject({
      id: 'staff-u1',
      label: 'Doktor Salimov',
      description: '+998901112233',
    });
    actions[0]?.onClick();
    expect(nav).toHaveBeenCalledWith('/settings/users');
  });

  it("userId bo'yicha dedupe qiladi (bir xodim bir necha filialda)", () => {
    const actions = buildStaffActions(
      [
        { userId: 'u1', userFullName: 'Doktor Salimov', userPhone: '+998901112233' },
        { userId: 'u1', userFullName: 'Doktor Salimov', userPhone: '+998901112233' },
        { userId: 'u2', userFullName: 'Hamshira Aziza', userPhone: '+998902223344' },
      ],
      noop,
    );
    expect(actions.map((a) => a.id)).toEqual(['staff-u1', 'staff-u2']);
  });

  it("ismsiz xodim uchun telefon label bo'ladi", () => {
    const actions = buildStaffActions(
      [{ userId: 'u3', userFullName: null, userPhone: '+998903334455' }],
      noop,
    );
    expect(actions[0]?.label).toBe('+998903334455');
  });
});
