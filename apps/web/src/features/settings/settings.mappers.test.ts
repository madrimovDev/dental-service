import type { PermissionDef, UserAssignment } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { filterAssignments, groupPermissionsByResource } from './settings.mappers';

function perm(code: string): PermissionDef {
  const [, action] = code.split('.');
  return {
    id: code,
    code,
    category: 'misc',
    descriptionUz: `uz:${action}`,
    descriptionRu: `ru:${action}`,
  };
}

function assignment(over: Partial<UserAssignment> = {}): UserAssignment {
  return {
    assignmentId: 'a1',
    userId: 'u1',
    userEmail: null,
    userPhone: '+998901234567',
    userFullName: 'Ali Valiyev',
    branchId: 'b1',
    branchName: 'Asosiy',
    roleId: 'r1',
    roleName: 'Doctor',
    validFrom: '2026-01-01',
    validTo: null,
    isActive: true,
    ...over,
  };
}

describe('groupPermissionsByResource', () => {
  it("kod prefiksi bo'yicha guruhlaydi, guruhlar alfabit tartibda", () => {
    const groups = groupPermissionsByResource([
      perm('patient.view'),
      perm('cashier.refund'),
      perm('patient.create'),
      perm('appointment.view'),
    ]);
    expect(groups.map((g) => g.resource)).toEqual(['appointment', 'cashier', 'patient']);
  });

  it("guruh ichida permission code bo'yicha alfabit", () => {
    const groups = groupPermissionsByResource([perm('patient.view'), perm('patient.create')]);
    const patient = groups.find((g) => g.resource === 'patient');
    expect(patient?.permissions.map((p) => p.code)).toEqual(['patient.create', 'patient.view']);
  });

  it("bo'sh kirish → bo'sh massiv", () => {
    expect(groupPermissionsByResource([])).toEqual([]);
  });
});

describe('filterAssignments', () => {
  const data = [
    assignment({ assignmentId: 'a1', userFullName: 'Ali Valiyev', userPhone: '+998901112233' }),
    assignment({
      assignmentId: 'a2',
      userFullName: 'Vali Aliyev',
      userPhone: '+998935556677',
      branchId: 'b2',
      branchName: 'Filial 2',
      roleId: 'r2',
      roleName: 'Nurse',
    }),
  ];

  it("ism bo'yicha (case-insensitive)", () => {
    expect(
      filterAssignments(data, { search: 'vali a', branchId: null, roleId: null }),
    ).toHaveLength(1);
    expect(
      filterAssignments(data, { search: 'vali a', branchId: null, roleId: null })[0]?.assignmentId,
    ).toBe('a2');
  });

  it("telefon bo'yicha", () => {
    const out = filterAssignments(data, { search: '1112233', branchId: null, roleId: null });
    expect(out).toHaveLength(1);
    expect(out[0]?.assignmentId).toBe('a1');
  });

  it('branch + rol filter', () => {
    expect(filterAssignments(data, { search: '', branchId: 'b2', roleId: null })).toHaveLength(1);
    expect(filterAssignments(data, { search: '', branchId: null, roleId: 'r1' })).toHaveLength(1);
    expect(filterAssignments(data, { search: '', branchId: 'b1', roleId: 'r2' })).toHaveLength(0);
  });

  it("bo'sh filter → barchasi", () => {
    expect(filterAssignments(data, { search: '', branchId: null, roleId: null })).toHaveLength(2);
  });
});
