import { describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from './role-templates.ts';

/**
 * CLI-412 (C1) — M5 klinik permissionlari (`prescription.*`, `consent.*`,
 * `lab_order.*`, `patient_image.*`) hech qanday rol shablonida yo'q edi.
 *
 * Tasdiqlangan rol→permission matritsasi (foydalanuvchi bilan kelishilgan):
 *
 * | Rol                | Qo'shiladigan permissionlar                                     |
 * |--------------------|------------------------------------------------------------------|
 * | Tenant Admin       | hammasi (8 ta)                                                    |
 * | Branch Manager     | faqat *.view (4 ta) — manage/upload YO'Q                          |
 * | Doctor             | hammasi (8 ta)                                                    |
 * | Doctor + Assistant | hammasi (8 ta)                                                    |
 * | Nurse              | *.view + patient_image.upload (5 ta) — manage YO'Q                |
 * | Receptionist       | qo'shilmaydi                                                      |
 * | Accountant         | qo'shilmaydi                                                      |
 * | Technician         | faqat lab_order.view + lab_order.manage (2 ta)                    |
 *
 * Backfill YO'Q (faqat yangi tenantlarga ta'sir qiladi — auth.service.ts seed).
 */

const M5_PERMISSIONS = [
  'prescription.view',
  'prescription.manage',
  'consent.view',
  'consent.manage',
  'lab_order.view',
  'lab_order.manage',
  'patient_image.view',
  'patient_image.upload',
] as const;

const permsFor = (templateKey: string): readonly string[] => {
  const template = ROLE_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!template) throw new Error(`template not found: ${templateKey}`);
  return template.permissions;
};

describe('CLI-412 — M5 klinik permissionlar rol shablonlarida', () => {
  test('Tenant Admin — barcha 8 ta M5 permission', () => {
    const perms = permsFor('tenant_admin');
    for (const p of M5_PERMISSIONS) expect(perms).toContain(p);
  });

  test('Doctor — barcha 8 ta M5 permission', () => {
    const perms = permsFor('doctor');
    for (const p of M5_PERMISSIONS) expect(perms).toContain(p);
  });

  test('Doctor + Assistant — barcha 8 ta M5 permission', () => {
    const perms = permsFor('doctor_assistant');
    for (const p of M5_PERMISSIONS) expect(perms).toContain(p);
  });

  test('Branch Manager — FU-41: barcha M5 permission (filial shablonlari birlashmasi)', () => {
    const perms = permsFor('branch_manager');
    for (const p of M5_PERMISSIONS) expect(perms).toContain(p);
  });

  test('Nurse — *.view + patient_image.upload (manage YO‘Q)', () => {
    const perms = permsFor('nurse');
    expect(perms).toContain('prescription.view');
    expect(perms).toContain('consent.view');
    expect(perms).toContain('lab_order.view');
    expect(perms).toContain('patient_image.view');
    expect(perms).toContain('patient_image.upload');
    expect(perms).not.toContain('prescription.manage');
    expect(perms).not.toContain('consent.manage');
    expect(perms).not.toContain('lab_order.manage');
  });

  test('Technician — faqat lab_order.view + lab_order.manage', () => {
    const perms = permsFor('technician');
    expect(perms).toContain('lab_order.view');
    expect(perms).toContain('lab_order.manage');
    expect(perms).not.toContain('prescription.view');
    expect(perms).not.toContain('prescription.manage');
    expect(perms).not.toContain('consent.view');
    expect(perms).not.toContain('consent.manage');
    expect(perms).not.toContain('patient_image.view');
    expect(perms).not.toContain('patient_image.upload');
  });

  test('Receptionist — M5 permission qo‘shilmagan', () => {
    const perms = permsFor('receptionist');
    for (const p of M5_PERMISSIONS) expect(perms).not.toContain(p);
  });

  test('Accountant — M5 permission qo‘shilmagan', () => {
    const perms = permsFor('accountant');
    for (const p of M5_PERMISSIONS) expect(perms).not.toContain(p);
  });
});

/**
 * FU-41 — Branch Manager = barcha filial-darajali shablonlar birlashmasi (+ hozirgi BM).
 * P5 (assertCanGrant) qoidasi yumshatilmaydi: BM Tenant Admin'ning tenant-darajali
 * huquqlarini OLMAYDI, shuning uchun Tenant Admin'ni bera olmaydi.
 */
describe('FU-41 — Branch Manager superset', () => {
  const BRANCH_TEMPLATES = [
    'receptionist',
    'doctor',
    'doctor_assistant',
    'nurse',
    'accountant',
    'technician',
  ] as const;

  for (const key of BRANCH_TEMPLATES) {
    test(`BM ⊇ ${key}`, () => {
      const bm = new Set(permsFor('branch_manager'));
      for (const p of permsFor(key)) expect(bm.has(p)).toBe(true);
    });
  }

  test('BM ⊉ Tenant Admin (tenant-darajali huquqlar yo‘q)', () => {
    const bm = new Set(permsFor('branch_manager'));
    const missing = permsFor('tenant_admin').filter((p) => !bm.has(p));
    expect(missing.length).toBeGreaterThan(0);
    for (const p of [
      'role.manage',
      'role.view',
      'user.manage',
      'tenant.edit',
      'tenant_settings.edit',
    ]) {
      expect(bm.has(p)).toBe(false);
    }
  });

  test('is_practitioner faqat Doctor va Doctor + Assistant shablonlarida', () => {
    const flagged = ROLE_TEMPLATES.filter(
      (t) => 'isPractitioner' in t && (t as { isPractitioner?: boolean }).isPractitioner,
    ).map((t) => t.templateKey);
    expect([...flagged].sort()).toEqual(['doctor', 'doctor_assistant']);
  });
});
