import { describe, expect, it } from 'vitest';
import { visibleGroups } from './nav-config';

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

  it("FUTURE (disabled) element faqat owner uchun ko'rinadi (CLI-161)", () => {
    const asOwner = visibleGroups(() => true, 'dental', true).flatMap((g) => g.items);
    const payroll = asOwner.find((i) => i.key === 'payroll');
    expect(payroll).toBeDefined();
    expect(payroll?.disabled).toBe(true);

    // owner emas (hasPermission true bo'lsa ham) → FUTURE element butunlay yashirin
    const asNonOwner = visibleGroups(() => true, 'dental', false).flatMap((g) => g.items);
    expect(asNonOwner.find((i) => i.key === 'payroll')).toBeUndefined();
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

  // lab — FUTURE (disabled) + feature-gated; feature gatesini ajratish uchun isOwner=true
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
