import { describe, expect, it } from 'vitest';
import { isSelfPractitioner, resolveClinicalAuthor } from './clinical-author';

const T = 't1';

describe('FX-155 isSelfPractitioner', () => {
  it('joriy tenantda is_practitioner tayinlov → true; boshqa tenantdagisi hisoblanmaydi', () => {
    const me = {
      assignments: [
        { tenantId: 'other', isPractitioner: true },
        { tenantId: T, isPractitioner: false },
      ],
      ownerTenants: [],
    };
    expect(isSelfPractitioner(me, T)).toBe(false);
    expect(isSelfPractitioner(me, 'other')).toBe(true);
  });

  it('tenant egasi (assignmentsiz) → true; ma’lumot yo‘q yoki bayroq yo‘q → false', () => {
    expect(isSelfPractitioner({ assignments: [], ownerTenants: [{ tenantId: T }] }, T)).toBe(true);
    expect(isSelfPractitioner(undefined, T)).toBe(false);
    expect(isSelfPractitioner({ assignments: [{ tenantId: T }] }, T)).toBe(false);
    expect(isSelfPractitioner({ assignments: [{ tenantId: T, isPractitioner: true }] }, null)).toBe(
      false,
    );
  });
});

describe('FX-155 resolveClinicalAuthor', () => {
  const doctors = [
    { id: 'me', name: 'Men (ro‘yxatda)' },
    { id: 'd1', name: 'Doc 1' },
  ];

  it('Branch Manager: shifokor emas, on_behalf yo‘q → yozuv yaratib bo‘lmaydi', () => {
    const r = resolveClinicalAuthor({
      userId: 'me',
      selfLabel: 'Men',
      canSelf: false,
      canOnBehalf: false,
      doctors,
    });
    expect(r.canAuthor).toBe(false);
    expect(r.options).toEqual([]);
    expect(r.defaultDoctorId).toBeNull();
  });

  it('Doctor: o‘z nomidan, tanlagichsiz', () => {
    const r = resolveClinicalAuthor({
      userId: 'me',
      selfLabel: 'Men',
      canSelf: true,
      canOnBehalf: false,
      doctors: undefined,
    });
    expect(r).toMatchObject({ canAuthor: true, showPicker: false, defaultDoctorId: 'me' });
  });

  it('Tenant Admin (on_behalf, shifokor emas): tanlagich, standart yo‘q (o‘zi variant emas)', () => {
    const r = resolveClinicalAuthor({
      userId: 'ta',
      selfLabel: 'Admin',
      canSelf: false,
      canOnBehalf: true,
      doctors,
    });
    expect(r.options.map((o) => o.value)).toEqual(['me', 'd1']);
    expect(r).toMatchObject({ canAuthor: true, showPicker: true, defaultDoctorId: null });
  });

  it('Tenant Admin, yagona shifokor → tanlagich ko‘rinadi, standart = o‘sha shifokor', () => {
    const r = resolveClinicalAuthor({
      userId: 'ta',
      selfLabel: 'Admin',
      canSelf: false,
      canOnBehalf: true,
      doctors: [{ id: 'd1', name: 'Doc 1' }],
    });
    expect(r).toMatchObject({ showPicker: true, defaultDoctorId: 'd1' });
  });

  it('Owner (o‘zi + on_behalf): o‘zi birinchi va standart, ro‘yxatda takrorlanmaydi', () => {
    const r = resolveClinicalAuthor({
      userId: 'me',
      selfLabel: 'Men',
      canSelf: true,
      canOnBehalf: true,
      doctors,
    });
    expect(r.options).toEqual([
      { value: 'me', label: 'Men' },
      { value: 'd1', label: 'Doc 1' },
    ]);
    expect(r).toMatchObject({ showPicker: true, defaultDoctorId: 'me' });
  });

  it('on_behalf bor, lekin shifokorlar ro‘yxati bo‘sh va o‘zi shifokor emas → yaratib bo‘lmaydi', () => {
    const r = resolveClinicalAuthor({
      userId: 'ta',
      selfLabel: 'Admin',
      canSelf: false,
      canOnBehalf: true,
      doctors: [],
    });
    expect(r.canAuthor).toBe(false);
  });
});
