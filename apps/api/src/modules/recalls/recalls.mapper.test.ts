import { describe, expect, it } from 'bun:test';
import { type RecallWithPatient, toRecallDto } from './recalls.mapper.ts';

// Minimal row — mapper faqat shu fieldlarni o'qiydi; qolganini cast bilan to'ldiramiz.
const row = {
  id: 'r1',
  tenantId: 't1',
  branchId: 'b1',
  patientId: 'p1',
  patientName: 'Ali Valiyev',
  patientPhone: '+998901234567',
  reason: 'preventive',
  status: 'pending',
  source: 'auto',
  dueDate: '2026-07-01',
  intervalMonths: 6,
  sourceStageId: null,
  treatmentPlanId: null,
  scheduledAppointmentId: null,
  assignedDoctorId: null,
  lastContactedAt: null,
  contactAttempts: 0,
  notes: null,
  createdBy: null,
  closedBy: null,
  closedAt: null,
  createdAt: new Date('2026-06-21T00:00:00Z'),
  updatedAt: new Date('2026-06-21T00:00:00Z'),
} as unknown as RecallWithPatient;

describe('toRecallDto — PII masking', () => {
  it('telefon toʼliq koʼrinadi maskPhone=false (default)', () => {
    expect(toRecallDto(row).patientPhone).toBe('+998901234567');
    expect(toRecallDto(row, false).patientPhone).toBe('+998901234567');
  });

  it('telefon masklanadi maskPhone=true (oxirgi 4 raqam qoladi)', () => {
    const dto = toRecallDto(row, true);
    expect(dto.patientPhone).toBe('*********4567');
    expect(dto.patientPhone).not.toContain('99890123');
  });

  it('telefon null boʼlsa null qaytadi (mask boʼlsa ham)', () => {
    const noPhone = { ...row, patientPhone: null } as RecallWithPatient;
    expect(toRecallDto(noPhone, true).patientPhone).toBeNull();
    expect(toRecallDto(noPhone, false).patientPhone).toBeNull();
  });
});
