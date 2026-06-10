import type { Patient } from '@dental/api-client';
import type { PatientDetail, PatientListItem } from './patients.types';

type TFn = (key: string) => string;

export function calcAge(dob: string | null, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function genderLabel(g: Patient['gender'], t: TFn): string {
  return g ? t(`patients.gender.${g}`) : '';
}

export function toPatientListItem(p: Patient, t: TFn): PatientListItem {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    age: calcAge(p.dateOfBirth),
    genderLabel: genderLabel(p.gender, t),
    tags: p.tags ?? [],
  };
}

export function toPatientDetail(p: Patient, t: TFn): PatientDetail {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    phoneSecondary: p.phoneSecondary,
    dateOfBirthFormatted: formatDate(p.dateOfBirth),
    age: calcAge(p.dateOfBirth),
    genderLabel: genderLabel(p.gender, t),
    passport: p.passport,
    address: p.address,
    notes: p.notes,
    tags: p.tags ?? [],
    source: p.source,
    insurance: p.insurance,
    archived: p.archivedAt != null,
  };
}
