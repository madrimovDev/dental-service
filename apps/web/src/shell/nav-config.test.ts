import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, visibleGroups } from './nav-config';

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

  it("FUTURE (disabled) element hamma uchun ko'rinadi", () => {
    const groups = visibleGroups(() => false);
    const items = groups.flatMap((g) => g.items);
    const payroll = items.find((i) => i.key === 'payroll');
    expect(payroll).toBeDefined();
    expect(payroll?.disabled).toBe(true);
  });

  it("bo'sh guruh yashirin", () => {
    // hech qanday ruxsat yo'q; "Bemorlar" guruhida faqat LIVE permission element bor
    // (patients=patient.view, patient-new=patient.create) → ikkalasi yashirin → guruh yo'q
    const groups = visibleGroups(() => false);
    expect(groups.find((g) => g.labelKey === 'nav.group.patients')).toBeUndefined();
  });

  it("@owner hamma LIVE elementni ko'radi", () => {
    const groups = visibleGroups((_p) => true); // owner: hasPermission har doim true
    const items = groups.flatMap((g) => g.items);
    expect(items.find((i) => i.key === 'roles')).toBeDefined();
  });
});

// referenced to satisfy lint; NAV_GROUPS is the data source for visibleGroups
void NAV_GROUPS;
