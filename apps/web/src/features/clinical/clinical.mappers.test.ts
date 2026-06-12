import type {
  ConsentForm,
  Diagnosis,
  LabOrder,
  PatientImage,
  Prescription,
  ToothChartWithStates,
  TreatmentPlan,
  TreatmentStage,
  VisitNote,
} from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  draftStatesToCreateInput,
  formatBytes,
  labOrderStatusToTone,
  parseToothNumbers,
  planStatusToTone,
  stageStatusToTone,
  templateBodyForLang,
  toConsentFormVM,
  toDiagnosisOptions,
  toLabOrderVM,
  toPatientImageVM,
  toPlanCardVM,
  toPrescriptionVM,
  toStageRowVM,
  toToothStateMap,
  toVisitNoteVM,
} from './clinical.mappers';

// ---- A: tooth chart ----
describe('toToothStateMap / draftStatesToCreateInput', () => {
  it('faqat surface "whole" ni Map ga oladi', () => {
    const chart = {
      states: [
        { toothNumber: 11, surface: 'whole', state: 'caries' },
        { toothNumber: 12, surface: 'M', state: 'filling' },
      ],
    } as unknown as ToothChartWithStates;
    const map = toToothStateMap(chart);
    expect(map.get(11)).toBe('caries');
    expect(map.has(12)).toBe(false);
  });

  it('draftStatesToCreateInput Map ni CreateToothStateInput[] shakliga', () => {
    const map = new Map<number, 'caries' | 'healthy'>([[11, 'caries']]) as Map<
      number,
      import('@dental/api-client').ToothState
    >;
    const states = draftStatesToCreateInput(map);
    expect(states).toEqual([{ toothNumber: 11, state: 'caries', surface: 'whole' }]);
  });
});

// ---- A: tooth CSV parse ----
describe('parseToothNumbers', () => {
  it('"11, 12, 36" -> [11,12,36], NaN tashlanadi', () => {
    expect(parseToothNumbers('11, 12, 36')).toEqual([11, 12, 36]);
    expect(parseToothNumbers('11, x, 13')).toEqual([11, 13]);
    expect(parseToothNumbers('')).toEqual([]);
  });
});

// ---- A: treatment plan ----
function stage(over: Partial<TreatmentStage> = {}): TreatmentStage {
  return {
    id: 's1',
    treatmentPlanId: 'pl1',
    sequence: 1,
    serviceId: null,
    serviceName: 'Plomba',
    toothNumbers: [11, 12],
    estimatedVisits: 1,
    estimatedDurationMinutes: null,
    cost: '150000',
    status: 'pending',
    notes: null,
    completedAt: null,
    ...over,
  };
}

describe('toPlanCardVM / toStageRowVM', () => {
  it('plan status -> tone + labelKey; cost format', () => {
    const plan = {
      id: 'pl1',
      title: 'Reja A',
      status: 'in_progress',
      totalCost: '1500000',
      totalVisits: 3,
    } as unknown as TreatmentPlan;
    const vm = toPlanCardVM(plan);
    expect(vm.statusTone).toBe('warning');
    expect(vm.statusLabelKey).toBe('treatment_plan.status_in_progress');
    expect(vm.totalCostText).toBe((1500000).toLocaleString());
    expect(vm.totalVisits).toBe(3);
  });

  it('stage status completed -> success; toothNumbers fallback []', () => {
    const vm = toStageRowVM(stage({ status: 'completed', toothNumbers: null }));
    expect(vm.statusTone).toBe('success');
    expect(vm.statusLabelKey).toBe('treatment_plan.stage_status_completed');
    expect(vm.toothNumbers).toEqual([]);
    expect(vm.costText).toBe((150000).toLocaleString());
  });

  it('planStatusToTone / stageStatusToTone barcha holatlar', () => {
    expect(planStatusToTone('draft')).toBe('neutral');
    expect(planStatusToTone('presented')).toBe('info');
    expect(planStatusToTone('accepted')).toBe('accent');
    expect(planStatusToTone('completed')).toBe('success');
    expect(planStatusToTone('cancelled')).toBe('danger');
    expect(stageStatusToTone('pending')).toBe('neutral');
    expect(stageStatusToTone('skipped')).toBe('danger');
  });
});

// ---- A: visit note ----
describe('toVisitNoteVM / toDiagnosisOptions', () => {
  const dxMap = new Map<string, Diagnosis>([
    [
      'd1',
      {
        id: 'd1',
        code: 'K02.1',
        nameUz: 'Kariyes',
        nameRu: 'Кариес',
        category: null,
        descriptionUz: null,
        descriptionRu: null,
      },
    ],
  ]);

  it('dx id -> "code — name" (uz); topilmasa id fallback; bo\'sh SOAP null', () => {
    const note = {
      id: 'n1',
      visitDate: '2026-06-11T05:00:00Z',
      subjective: "Og'riq",
      objective: null,
      assessmentDiagnoses: ['d1', 'unknown'],
      plan: null,
      freeNotes: null,
    } as unknown as VisitNote;
    const vm = toVisitNoteVM(note, dxMap, 'uz');
    expect(vm.diagnoses).toEqual(['K02.1 — Kariyes', 'unknown']);
    expect(vm.subjective).toBe("Og'riq");
    expect(vm.objective).toBeNull();
  });

  it('toDiagnosisOptions ru tilida nameRu tanlaydi', () => {
    const opts = toDiagnosisOptions([...dxMap.values()], 'ru');
    expect(opts[0]).toEqual({ value: 'd1', label: 'K02.1 — Кариес' });
  });
});

// ---- B: prescription ----
describe('toPrescriptionVM', () => {
  it("issued date + item shakli (durationDays null bo'lishi mumkin)", () => {
    const rx = {
      id: 'rx1',
      issuedDate: '2026-06-11T00:00:00Z',
      diagnosis: 'K02',
      notes: null,
      items: [
        { medicationName: 'Amoxicillin', dosage: '500mg', frequency: '3x', durationDays: 7 },
        { medicationName: 'Ibuprofen', dosage: '200mg', frequency: '2x' },
      ],
    } as unknown as Prescription;
    const vm = toPrescriptionVM(rx);
    expect(vm.items[0]?.durationDays).toBe(7);
    expect(vm.items[1]?.durationDays).toBeNull();
    expect(vm.items[1]?.instructions).toBeNull();
  });
});

// ---- B: lab order ----
function labOrder(over: Partial<LabOrder> = {}): LabOrder {
  return {
    id: 'lo1',
    tenantId: 't',
    patientId: 'p',
    doctorId: 'd',
    orderNumber: 1,
    labName: 'Lab X',
    orderType: 'crown',
    status: 'sent',
    items: [{ description: 'Koronka', toothNumbers: [26, 27], quantity: 2 }],
    sentDate: '2026-06-10T00:00:00Z',
    expectedDate: null,
    deliveredDate: null,
    cost: '500000',
    currency: 'UZS',
    notes: null,
    createdAt: '2026-06-10T00:00:00Z',
    updatedAt: '2026-06-10T00:00:00Z',
    ...over,
  };
}

describe('toLabOrderVM / labOrderStatusToTone', () => {
  it('status -> tone/labelKey har 6 holat', () => {
    expect(labOrderStatusToTone('draft')).toBe('neutral');
    expect(labOrderStatusToTone('sent')).toBe('info');
    expect(labOrderStatusToTone('in_progress')).toBe('warning');
    expect(labOrderStatusToTone('ready')).toBe('success');
    expect(labOrderStatusToTone('delivered')).toBe('accent');
    expect(labOrderStatusToTone('cancelled')).toBe('danger');
  });

  it('costText format + currency saqlanadi; item toothNumbers fallback', () => {
    const vm = toLabOrderVM(labOrder());
    expect(vm.statusTone).toBe('info');
    expect(vm.statusLabelKey).toBe('lab_order.status_sent');
    expect(vm.typeLabelKey).toBe('lab_order.type_crown');
    expect(vm.costText).toBe((500000).toLocaleString());
    expect(vm.currency).toBe('UZS');
    expect(vm.items[0]?.toothNumbers).toEqual([26, 27]);
    expect(vm.sentDateText).not.toBeNull();
  });

  it('cost null -> costText null', () => {
    expect(toLabOrderVM(labOrder({ cost: null })).costText).toBeNull();
  });
});

// ---- B: consent ----
describe('toConsentFormVM', () => {
  it('240 qisqartirish + til upper + sana + tur labelKey', () => {
    const longBody = 'a'.repeat(300);
    const form = {
      id: 'c1',
      title: 'Rozilik',
      type: 'treatment',
      bodyText: longBody,
      language: 'uz',
      signedAt: '2026-06-11T00:00:00Z',
      patientSignatureName: 'Ali',
    } as unknown as ConsentForm;
    const vm = toConsentFormVM(form);
    expect(vm.languageUpper).toBe('UZ');
    expect(vm.typeLabelKey).toBe('consent.type_treatment');
    expect(vm.bodyPreview).toBe(`${'a'.repeat(240)}...`);
    expect(vm.signerName).toBe('Ali');
  });

  it('qisqa body -> "..." yo\'q', () => {
    const form = {
      id: 'c2',
      title: 'T',
      type: 'other',
      bodyText: 'qisqa',
      language: 'ru',
      signedAt: '2026-06-11T00:00:00Z',
      patientSignatureName: null,
    } as unknown as ConsentForm;
    const vm = toConsentFormVM(form);
    expect(vm.bodyPreview).toBe('qisqa');
    expect(vm.languageUpper).toBe('RU');
  });
});

// ---- C: images ----
describe('formatBytes / toPatientImageVM', () => {
  it('formatBytes B/KB/MB chegaralari', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });

  it("displayTitle fallback originalFilename; isImage contentType bo'yicha", () => {
    const base = {
      id: 'i1',
      type: 'intraoral_photo',
      url: 'http://x/i1',
      contentType: 'image/png',
      sizeBytes: 2048,
      title: null,
      originalFilename: 'foto.png',
      description: null,
      toothNumbers: [11],
      takenDate: null,
      createdAt: '2026-06-11T00:00:00Z',
    } as unknown as PatientImage;
    const vm = toPatientImageVM(base);
    expect(vm.displayTitle).toBe('foto.png');
    expect(vm.isImage).toBe(true);
    expect(vm.sizeLabel).toBe('2.0 KB');
    expect(vm.typeLabelKey).toBe('image.type_intraoral_photo');

    const dicom = toPatientImageVM({
      ...base,
      title: 'CBCT',
      contentType: 'application/dicom',
    } as unknown as PatientImage);
    expect(dicom.displayTitle).toBe('CBCT');
    expect(dicom.isImage).toBe(false);
  });
});

// ---- B: consent template body for lang ----
describe('templateBodyForLang', () => {
  const tpl = {
    bodyUz: 'UZ matn',
    bodyRu: 'RU matn',
  } as import('@dental/api-client').ConsentTemplate;
  it("ru bo'lsa bodyRu, yo'q bo'lsa bodyUz", () => {
    expect(templateBodyForLang(tpl, 'ru')).toBe('RU matn');
    expect(templateBodyForLang({ ...tpl, bodyRu: null } as never, 'ru')).toBe('UZ matn');
    expect(templateBodyForLang(tpl, 'uz')).toBe('UZ matn');
  });
});
