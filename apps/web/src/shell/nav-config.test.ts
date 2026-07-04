import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, visibleGroups } from './nav-config';

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
