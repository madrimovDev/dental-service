import type { LabOrderStatus } from '@dental/api-client';

export const clinicalKeys = {
  all: ['clinical'] as const,
  // A — odontogram
  toothChartLatest: (patientId: string) => ['clinical', 'tooth-chart-latest', patientId] as const,
  toothCharts: (patientId: string) => ['clinical', 'tooth-charts', patientId] as const,
  // A — treatment plans
  plans: (patientId: string) => ['clinical', 'plans', patientId] as const,
  planDetail: (planId: string) => ['clinical', 'plan-detail', planId] as const,
  planEstimate: (planId: string) => ['clinical', 'plan-estimate', planId] as const,
  // A — visit notes
  visitNotes: (patientId: string) => ['clinical', 'visit-notes', patientId] as const,
  diagnoses: () => ['clinical', 'diagnoses'] as const,
  appointmentsForPatient: (patientId: string) =>
    ['clinical', 'appointments-for-patient', patientId] as const,
  // B — prescriptions / lab orders / consent
  prescriptions: (patientId: string) => ['clinical', 'prescriptions', patientId] as const,
  labOrders: (patientId: string, status?: LabOrderStatus) =>
    ['clinical', 'lab-orders', patientId, status ?? null] as const,
  consentForms: (patientId: string) => ['clinical', 'consent-forms', patientId] as const,
  consentTemplates: () => ['clinical', 'consent-templates'] as const,
  // C — images
  images: (patientId: string) => ['clinical', 'images', patientId] as const,
};
