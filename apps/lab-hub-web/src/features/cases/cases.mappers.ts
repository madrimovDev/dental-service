import type { StatusMeaning } from '@dental/ui';
import type { CaseDto, CaseStatus } from './cases.types';

/** Ish holati -> @dental/ui StatusPill ma'nosi (kanvas: yangi=ko'k, qabul=yashil, ishda=sariq, remake=qizil). */
export const STATUS_MEANING: Record<CaseStatus, StatusMeaning> = {
  sent: 'planned',
  accepted: 'confirmed',
  in_progress: 'waiting',
  ready: 'active',
  delivered: 'done',
  rejected: 'failed',
  remake: 'failed',
};

export const isOpen = (c: Pick<CaseDto, 'status'>) =>
  c.status !== 'delivered' && c.status !== 'rejected';

export const workTitle = (c: Pick<CaseDto, 'workType' | 'material'>) =>
  c.material ? `${c.workType} · ${c.material}` : c.workType;

export const teethLabel = (teeth: number[]) => teeth.join(' · ');

/** Texnikka biriktirilgan ochiq ishlar soni. */
export const openLoad = (cases: CaseDto[]) => {
  const m = new Map<string, number>();
  for (const c of cases)
    if (isOpen(c) && c.assignedTechnicianId)
      m.set(c.assignedTechnicianId, (m.get(c.assignedTechnicianId) ?? 0) + 1);
  return m;
};
