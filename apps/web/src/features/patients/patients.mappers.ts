import type { Patient, PatientListItem as PatientListItemDto } from '@dental/api-client';
import type { PatientDetail, PatientFlags, PatientListItem } from './patients.types';

type TFn = (key: string) => string;

export function calcAge(dob: string | null, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

function genderLabel(g: Patient['gender'], t: TFn): string {
  return g ? t(`patients.gender.${g}`) : '';
}

/**
 * `flags` backend'da UI-R6 bilan qo'shildi; api-client regenerate qilinmaguncha generated
 * tipda yo'q — shuning uchun tor kengaytirma. Eski javobda yo'q bo'lsa, `balance`/strike'dan
 * kelib chiqadigan xavfsiz default.
 */
type WithFlags = PatientListItemDto & {
  flags?: PatientFlags;
  /** FU-24: generate:contract'dan keyin generated tipga o'tadi. */
  nextAppointmentAt?: string | null;
};

export function toPatientListItem(p: WithFlags, t: TFn): PatientListItem {
  return {
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
    age: calcAge(p.dateOfBirth),
    genderLabel: genderLabel(p.gender, t),
    tags: p.tags ?? [],
    balance: p.balance,
    nextAppointmentAt: p.nextAppointmentAt ?? null,
    noShowStrikes: p.noShowStrikes,
    flagged: p.flagged,
    flags: p.flags ?? {
      allergy: false,
      debt: p.balance > 0,
      noShows: p.noShowStrikes,
      telegram: false,
    },
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
    insuranceStatus: p.insuranceStatus,
    archived: p.archivedAt != null,
  };
}
