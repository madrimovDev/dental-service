import { describe, expect, it } from 'vitest';
import { clinicalKeys } from './clinical.keys';

describe('clinicalKeys', () => {
  it('A: tooth-chart / plans / planDetail / visitNotes', () => {
    expect(clinicalKeys.toothChartLatest('p1')).toEqual(['clinical', 'tooth-chart-latest', 'p1']);
    expect(clinicalKeys.plans('p1')).toEqual(['clinical', 'plans', 'p1']);
    expect(clinicalKeys.planDetail('pl1')).toEqual(['clinical', 'plan-detail', 'pl1']);
    expect(clinicalKeys.visitNotes('p1')).toEqual(['clinical', 'visit-notes', 'p1']);
    expect(clinicalKeys.diagnoses()).toEqual(['clinical', 'diagnoses']);
    expect(clinicalKeys.appointmentsForPatient('p1')).toEqual([
      'clinical',
      'appointments-for-patient',
      'p1',
    ]);
  });

  it('B: prescriptions / labOrders(status) / consent', () => {
    expect(clinicalKeys.prescriptions('p1')).toEqual(['clinical', 'prescriptions', 'p1']);
    expect(clinicalKeys.labOrders('p1')).toEqual(['clinical', 'lab-orders', 'p1', null]);
    expect(clinicalKeys.labOrders('p1', 'sent')).toEqual(['clinical', 'lab-orders', 'p1', 'sent']);
    expect(clinicalKeys.consentForms('p1')).toEqual(['clinical', 'consent-forms', 'p1']);
    expect(clinicalKeys.consentTemplates()).toEqual(['clinical', 'consent-templates']);
  });

  it('C: images', () => {
    expect(clinicalKeys.images('p1')).toEqual(['clinical', 'images', 'p1']);
  });
});
