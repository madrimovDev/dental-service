import { ROLE_TEMPLATES } from '@dental/core';
import { describe, expect, it } from 'vitest';
import {
  isVisible,
  layoutForRole,
  NAV_GROUPS,
  type NavItem,
  paletteNavItems,
  sidebarModel,
  visibleGroups,
} from './nav-config';

const ALL = () => true;

describe('NAV_GROUPS 3-guruh superset', () => {
  it('3 guruh: asosiy/klinika/boshqaruv', () => {
    expect(NAV_GROUPS.map((g) => g.labelKey)).toEqual([
      'nav.group.asosiy',
      'nav.group.klinika',
      'nav.group.boshqaruv',
    ]);
  });
  it('asosiy: home, appointments, queue, patients, cashier', () => {
    const g = NAV_GROUPS[0]!;
    expect(g.items.map((i) => i.key)).toEqual([
      'home',
      'appointments',
      'queue',
      'patients',
      'cashier',
    ]);
  });
  it("hech qaysi element yo'qolmadi (dublikat yo'q)", () => {
    const keys = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('recalls');
    expect(keys).toContain('payroll');
    expect(keys).toContain('audit');
    expect(new Set(keys).size).toBe(keys.length); // dublikat yo'q
  });
  it("owner barcha element + LIVE klinik ro'yxatlarni ko'radi", () => {
    const groups = visibleGroups(ALL, 'dental', true);
    const keys = groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('plans'); // DS7: LIVE, medical_record.view bilan gated
  });
});

describe('nav-config', () => {
  it('LIVE element ruxsatsiz yashirin', () => {
    const groups = visibleGroups(() => false);
    const allItems = groups.flatMap((g) => g.items);
    // ruxsatli LIVE element yo'q → faqat permissionsiz LIVE (Bosh ekran) + FUTURE disabled qoladi
    expect(allItems.find((i) => i.key === 'patients')).toBeUndefined();
    expect(allItems.find((i) => i.key === 'home')).toBeDefined(); // permissionsiz LIVE
  });

  it("LIVE element ruxsat bilan ko'rinadi", () => {
    const groups = visibleGroups((p) => p === 'patient.view');
    const items = groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'patients')).toBeDefined();
  });

  it("transactions — LIVE, cashier.view bilan gated (CLI-366: 4ce4b07 disabled:true'ni olib tashladi)", () => {
    // owner, ruxsat bor → ko'rinadi, disabled maydoni yo'q
    const asOwner = visibleGroups(() => true, 'dental', true).flatMap((g) => g.items);
    const transactions = asOwner.find((i) => i.key === 'transactions');
    expect(transactions).toBeDefined();
    expect(transactions?.disabled).toBeUndefined();

    // owner emas, lekin cashier.view bor → baribir ko'rinadi (permission-gate, owner-gate emas)
    const asNonOwnerWithPerm = visibleGroups((p) => p === 'cashier.view', 'dental', false).flatMap(
      (g) => g.items,
    );
    expect(asNonOwnerWithPerm.find((i) => i.key === 'transactions')).toBeDefined();

    // owner emas va cashier.view yo'q → yashirin
    const asNonOwnerNoPerm = visibleGroups(() => false, 'dental', false).flatMap((g) => g.items);
    expect(asNonOwnerNoPerm.find((i) => i.key === 'transactions')).toBeUndefined();
  });

  it("R4 LIVE modullar permission bilan ko'rinadi, permissionsiz yashirin", () => {
    // Accountant permset (real, @owner emas): report/expense/payroll bor; stock/audit YO'Q
    const accountantPerms = new Set(['report.view', 'expense.view', 'payroll.view']);
    const asAccountant = visibleGroups((p) => accountantPerms.has(p), 'dental', false).flatMap(
      (g) => g.items,
    );
    expect(asAccountant.find((i) => i.key === 'reports')).toBeDefined();
    expect(asAccountant.find((i) => i.key === 'expenses')).toBeDefined();
    expect(asAccountant.find((i) => i.key === 'payroll')).toBeDefined();
    // permset'da yo'q → yashirin (FUTURE emas, LIVE-permission)
    expect(asAccountant.find((i) => i.key === 'stock')).toBeUndefined();
    expect(asAccountant.find((i) => i.key === 'audit')).toBeUndefined();

    // Doctor permset: stock.view bor → ombor ko'rinadi
    const asDoctor = visibleGroups((p) => p === 'stock.view', 'dental', false).flatMap(
      (g) => g.items,
    );
    expect(asDoctor.find((i) => i.key === 'stock')).toBeDefined();
    expect(asDoctor.find((i) => i.key === 'reports')).toBeUndefined();
  });

  it("bo'sh guruh yashirin", () => {
    // hech qanday ruxsat yo'q va owner emas; "Klinika" guruhida plans/lab/schedule/recalls=
    // permission-gated LIVE (DS7'da plans/lab enable), rx=FUTURE (disabled-owner)
    // → barchasi yashirin → klinika guruhi yo'q
    const groups = visibleGroups(() => false);
    expect(groups.find((g) => g.labelKey === 'nav.group.klinika')).toBeUndefined();
  });

  it("@owner hamma LIVE elementni ko'radi", () => {
    const groups = visibleGroups((_p) => true); // owner: hasPermission har doim true
    const items = groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'roles')).toBeDefined();
  });

  // lab — LIVE (lab_order.view) + feature-gated; has=()=>true → perm o'tadi, feature gate qoladi
  it("vertical 'general' → labOrders nav element tushadi", () => {
    const items = visibleGroups(() => true, 'general', true).flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'lab')).toBeUndefined();
  });

  it("vertical 'dental' → labOrders nav element ko'rinadi", () => {
    const items = visibleGroups(() => true, 'dental', true).flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'lab')).toBeDefined();
  });

  it("vertical default 'dental' (parametr berilmasa) → lab ko'rinadi", () => {
    const items = visibleGroups(() => true, undefined, true).flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'lab')).toBeDefined();
  });
});

// CLI-161 — FUTURE (disabled) qoidasi. Sintetik element ustida sinaladi: ilgari bu
// qoida real `transactions` elementi orqali tekshirilardi va `4ce4b07` uni LIVE
// qilgach test jimgina eskirib qoldi. Nav-config tarkibiga bog'lanmasin.
describe('FUTURE (disabled) element qoidasi (CLI-161)', () => {
  const futureItem: NavItem = {
    key: '__future__',
    labelKey: 'nav.__future__',
    icon: NAV_GROUPS[0]?.items[0]?.icon as NavItem['icon'],
    path: '/__future__',
    disabled: true,
  };

  it("owner uchun ko'rinadi (ruxsati bo'lmasa ham)", () => {
    expect(isVisible(futureItem, () => false, 'dental', true)).toBe(true);
  });

  it("non-owner uchun yashirin (barcha ruxsat bo'lsa ham)", () => {
    expect(isVisible(futureItem, ALL, 'dental', false)).toBe(false);
  });
});

// UI-0 1.5 — rolga moslashuvchi menyu. Fixture'lar REAL rol shablonlari (packages/core),
// `@owner` emas (RBAC ekran<->endpoint bo'shlig'i darsi).
const permsOf = (templateKey: string): Set<string> => {
  const t = ROLE_TEMPLATES.find((r) => r.templateKey === templateKey);
  if (!t) throw new Error(`template yo'q: ${templateKey}`);
  return new Set<string>(t.permissions);
};
const hasOf = (perms: Set<string>) => (p: string) => perms.has(p);
const shape = (m: ReturnType<typeof sidebarModel>) =>
  m.groups.map((g) => [g.labelKey, g.items.map((i) => i.key)]);

describe('rolga moslashuvchi sidebar (1.5)', () => {
  it("layoutForRole: owner -> rahbar, noma'lum/custom -> null", () => {
    expect(layoutForRole(null, true)).toBe('rahbar');
    expect(layoutForRole('receptionist', false)).toBe('registrator');
    expect(layoutForRole('doctor', false)).toBe('shifokor');
    expect(layoutForRole('technician', false)).toBe('texnik');
    expect(layoutForRole('accountant', false)).toBeNull();
    expect(layoutForRole(null, false)).toBeNull();
  });

  it("Receptionist: 'Bugungi ish' + 'Bemorlar va pul', Sozlamalar menyuda YO'Q", () => {
    const m = sidebarModel({
      roleKey: 'receptionist',
      has: hasOf(permsOf('receptionist')),
    });
    expect(m.layout).toBe('registrator');
    const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(m.groups.map((g) => g.labelKey)).toEqual([
      'nav.role_group.today',
      'nav.role_group.patients_money',
    ]);
    expect(keys).toEqual(expect.arrayContaining(['home', 'appointments', 'queue', 'patients']));
    expect(keys).not.toContain('settings');
    expect(m.footer).toEqual([]);
  });

  it("Receptionist: ruxsat (tenant.view) bor -> Sozlamalar menyuda yo'q, lekin ⌘K'da bor", () => {
    const perms = permsOf('receptionist');
    expect(perms.has('tenant.view')).toBe(true); // fixture haqiqatan ruxsatli
    const m = sidebarModel({ roleKey: 'receptionist', has: hasOf(perms) });
    expect([...m.groups.flatMap((g) => g.items), ...m.footer].map((i) => i.key)).not.toContain(
      'settings',
    );
    expect(paletteNavItems(hasOf(perms)).map((i) => i.key)).toContain('settings');
  });

  it('Doctor: Mening kunim + Navbat; Davolash — Bemorlar, rejalar, laboratoriya', () => {
    const m = sidebarModel({ roleKey: 'doctor', has: hasOf(permsOf('doctor')) });
    expect(shape(m)).toEqual([
      ['nav.role_group.today', ['home', 'queue']],
      ['nav.role_group.treatment', ['patients', 'plans', 'lab']],
    ]);
    expect(m.groups[0]?.items[0]?.labelKey).toBe('nav.role.my_day');
  });

  it("Doctor, vertical 'general' -> laboratoriya tushadi", () => {
    const m = sidebarModel({
      roleKey: 'doctor',
      has: hasOf(permsOf('doctor')),
      vertical: 'general',
    });
    expect(m.groups.flatMap((g) => g.items.map((i) => i.key))).not.toContain('lab');
  });

  it('Tenant Admin: Umumiy + Boshqaruv, Sozlamalar pastda (rahbar)', () => {
    const m = sidebarModel({ roleKey: 'tenant_admin', has: hasOf(permsOf('tenant_admin')) });
    expect(m.layout).toBe('rahbar');
    expect(m.groups.map((g) => g.labelKey)).toEqual([
      'nav.role_group.general',
      'nav.group.boshqaruv',
    ]);
    const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toEqual(
      expect.arrayContaining([
        'home',
        'appointments',
        'patients',
        'cashier',
        'reports',
        'stock',
        'users',
      ]),
    );
    expect(m.footer.map((i) => i.key)).toEqual(['settings']);
  });

  it('Owner (@owner, roleKey yoq): rahbar maketi + Sozlamalar', () => {
    const m = sidebarModel({ roleKey: null, has: () => true, isOwner: true });
    expect(m.layout).toBe('rahbar');
    expect(m.footer.map((i) => i.key)).toEqual(['settings']);
  });

  it('Technician: faqat Buyurtmalar (lab)', () => {
    const m = sidebarModel({ roleKey: 'technician', has: hasOf(permsOf('technician')) });
    expect(shape(m)).toEqual([['nav.role_group.laboratory', ['lab']]]);
    expect(m.groups[0]?.items[0]?.labelKey).toBe('nav.role.lab_orders');
    expect(m.footer).toEqual([]);
  });

  it("Custom rol (roleKey yo'q, faqat patient.view + appointment.view): menyu BO'SH EMAS, 3-guruh fallback", () => {
    const m = sidebarModel({
      roleKey: null,
      has: hasOf(new Set(['patient.view', 'appointment.view'])),
    });
    expect(m.layout).toBeNull();
    const keys = m.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toEqual(expect.arrayContaining(['home', 'appointments', 'patients']));
    expect(keys).not.toContain('settings');
  });

  it('Accountant (maketsiz shablon): permission-filter fallback', () => {
    const m = sidebarModel({ roleKey: 'accountant', has: hasOf(permsOf('accountant')) });
    expect(m.layout).toBeNull();
    expect(m.groups.length).toBeGreaterThan(0);
  });

  it("maket bor, lekin hech band ruxsatli emas -> fallback (bo'sh menyu yo'q)", () => {
    const m = sidebarModel({ roleKey: 'technician', has: hasOf(new Set(['patient.view'])) });
    expect(m.layout).toBeNull();
    expect(m.groups.flatMap((g) => g.items.map((i) => i.key))).toContain('patients');
  });

  it("har rol: menyudagi har band ruxsatli (ruxsatsiz band yo'q)", () => {
    for (const t of ROLE_TEMPLATES) {
      const perms = new Set<string>(t.permissions);
      const m = sidebarModel({ roleKey: t.templateKey, has: hasOf(perms) });
      for (const i of [...m.groups.flatMap((g) => g.items), ...m.footer]) {
        const need = i.permission
          ? Array.isArray(i.permission)
            ? i.permission
            : [i.permission]
          : [];
        expect(need.length === 0 || need.some((p) => perms.has(p))).toBe(true);
      }
    }
  });

  it("⌘K: menyudagi har band paletada ham bor (topib bo'lmaydigan sahifa yo'q)", () => {
    for (const t of ROLE_TEMPLATES) {
      const has = hasOf(new Set<string>(t.permissions));
      const m = sidebarModel({ roleKey: t.templateKey, has });
      const palette = new Set(paletteNavItems(has).map((i) => i.key));
      for (const i of [...m.groups.flatMap((g) => g.items), ...m.footer]) {
        expect(palette.has(i.key)).toBe(true);
      }
    }
  });
});
