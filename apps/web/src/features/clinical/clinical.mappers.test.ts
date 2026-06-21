import type {
  ConsentForm,
  Diagnosis,
  LabOrder,
  PatientImage,
  Prescription,
  ServicePrice,
  ToothChartWithStates,
  TreatmentPlan,
  TreatmentPlanEstimate,
  TreatmentStage,
  VisitNote,
} from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { formatNumber } from '@/lib/format.ts';
import {
  diagnosisSearchIndex,
  draftMapToCreateInput,
  draftMapToStateMap,
  draftStatesToCreateInput,
  findActivePrice,
  formatBytes,
  labOrderStatusToTone,
  normalizeSearch,
  parseToothNumbers,
  planStatusToTone,
  stageAcceptanceToTone,
  stageStatusToTone,
  templateBodyForLang,
  toConsentFormVM,
  toDiagnosisOptions,
  toEstimateVM,
  toLabOrderVM,
  toPatientImageVM,
  toPlanCardVM,
  toPrescriptionVM,
  toStageRowVM,
  toToothDraftMap,
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

// ---- CLI-189: per-surface + diagnosis draft round-trip ----
describe('toToothDraftMap / draftMapToCreateInput (CLI-189)', () => {
  it('non-whole surface va diagnosisId round-trip da yo‘qolmaydi', () => {
    const chart = {
      states: [
        { toothNumber: 16, surface: 'O', state: 'filling', diagnosisId: 'dx-1' },
        { toothNumber: 21, surface: 'M', state: 'caries', diagnosisId: null },
      ],
    } as unknown as ToothChartWithStates;
    const draft = toToothDraftMap(chart);
    expect(draft.get(16)).toEqual({ state: 'filling', surface: 'O', diagnosisId: 'dx-1' });
    expect(draft.get(21)).toEqual({ state: 'caries', surface: 'M', diagnosisId: null });

    const input = draftMapToCreateInput(draft);
    expect(input).toContainEqual({
      toothNumber: 16,
      state: 'filling',
      surface: 'O',
      diagnosisId: 'dx-1',
    });
    // diagnosisId null → input'da undefined (optional)
    expect(input).toContainEqual({
      toothNumber: 21,
      state: 'caries',
      surface: 'M',
      diagnosisId: undefined,
    });
  });

  it("'whole' yozuvi bir xil tish uchun afzal", () => {
    const chart = {
      states: [
        { toothNumber: 16, surface: 'O', state: 'filling', diagnosisId: null },
        { toothNumber: 16, surface: 'whole', state: 'crown', diagnosisId: 'dx-2' },
      ],
    } as unknown as ToothChartWithStates;
    const draft = toToothDraftMap(chart);
    expect(draft.get(16)).toEqual({ state: 'crown', surface: 'whole', diagnosisId: 'dx-2' });
  });

  it('draftMapToStateMap odontogram uchun tish→holat', () => {
    const draft = new Map([
      [16, { state: 'filling' as const, surface: 'O' as const, diagnosisId: null }],
    ]);
    expect(draftMapToStateMap(draft).get(16)).toBe('filling');
  });
});

// ---- CLI-188: findActivePrice ----
describe('findActivePrice (CLI-188)', () => {
  const price = (over: Partial<ServicePrice> = {}): ServicePrice => ({
    id: 'p1',
    serviceId: 'svc1',
    branchId: 'b1',
    price: '50000',
    currency: 'UZS',
    validFrom: '2026-01-01T00:00:00Z',
    validTo: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  });

  it('filial mos + validTo===null → Number(price)', () => {
    expect(findActivePrice([price({ price: '50000' })], 'b1')).toBe(50000);
  });
  it('boshqa filial → null (fallback)', () => {
    expect(findActivePrice([price({ branchId: 'b2' })], 'b1')).toBeNull();
  });
  it('validTo set → null', () => {
    expect(findActivePrice([price({ validTo: '2026-05-01T00:00:00Z' })], 'b1')).toBeNull();
  });
  it('bir nechta active → eng oxirgi validFrom', () => {
    const top = findActivePrice(
      [
        price({ id: 'a', price: '40000', validFrom: '2026-01-01T00:00:00Z' }),
        price({ id: 'b', price: '60000', validFrom: '2026-03-01T00:00:00Z' }),
      ],
      'b1',
    );
    expect(top).toBe(60000);
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
    acceptance: 'proposed',
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

  // CLI-224: acceptance — status'dan alohida o'q.
  it('stage acceptance -> tone + labelKey (proposed/accepted/rejected)', () => {
    expect(toStageRowVM(stage({ acceptance: 'proposed' })).acceptanceTone).toBe('info');
    expect(toStageRowVM(stage({ acceptance: 'accepted' })).acceptanceLabelKey).toBe(
      'treatment_plan.acceptance_accepted',
    );
    expect(stageAcceptanceToTone('rejected')).toBe('danger');
    expect(stageAcceptanceToTone('accepted')).toBe('success');
  });
});

// ---- A: treatment plan estimate (smeta — CLI-223/224) ----
describe('toEstimateVM', () => {
  function estimate(over: Partial<TreatmentPlanEstimate> = {}): TreatmentPlanEstimate {
    return {
      planId: 'pl1',
      status: 'accepted',
      totalProposed: 0,
      totalAccepted: 500000,
      totalCost: 650000,
      totalPaid: 200000,
      balance: 300000,
      stages: [
        {
          stageId: 's1',
          serviceName: 'Plomba',
          cost: 500000,
          status: 'pending',
          acceptance: 'accepted',
          paid: 200000,
          debtEligible: true,
        },
        {
          stageId: 's2',
          serviceName: 'Tozalash',
          cost: 150000,
          status: 'skipped',
          acceptance: 'accepted',
          paid: 0,
          debtEligible: false,
        },
      ],
      ...over,
    } as TreatmentPlanEstimate;
  }

  it('per-stage cost/status/acceptance/paid + debtEligible mapped', () => {
    const vm = toEstimateVM(estimate());
    expect(vm.stages).toHaveLength(2);
    const [s1, s2] = vm.stages;
    expect(s1?.serviceName).toBe('Plomba');
    expect(s1?.costText).toBe(formatNumber(500000));
    expect(s1?.paidText).toBe(formatNumber(200000));
    expect(s1?.statusLabelKey).toBe('treatment_plan.stage_status_pending');
    expect(s1?.acceptanceLabelKey).toBe('treatment_plan.acceptance_accepted');
    expect(s1?.acceptanceTone).toBe('success');
    expect(s1?.debtEligible).toBe(true);
    expect(s2?.debtEligible).toBe(false);
  });

  it('totals are independent subtotals; balance is authoritative', () => {
    const vm = toEstimateVM(estimate());
    expect(vm.totalProposedText).toBe(formatNumber(0));
    expect(vm.totalAcceptedText).toBe(formatNumber(500000));
    expect(vm.totalCostText).toBe(formatNumber(650000));
    expect(vm.totalPaidText).toBe(formatNumber(200000));
    expect(vm.balanceText).toBe(formatNumber(300000));
    expect(vm.balance).toBe(300000);
    // skipped-but-accepted stage is in totalCost only, not in totalAccepted subtotal
    expect(vm.totalAcceptedText).not.toBe(vm.totalCostText);
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

// ---- ICD-10 qidiruv indeksi (CLI-152) ----
describe('diagnosisSearchIndex / normalizeSearch', () => {
  const dx = [
    {
      id: 'd1',
      code: 'K02.0',
      nameUz: 'Emal kariyesi',
      nameRu: 'Кариес эмали',
    },
  ] as unknown as Diagnosis[];
  const idx = diagnosisSearchIndex(dx);
  const entry = idx.get('d1') ?? '';

  it("nomning bir qismi (uz) bo'yicha topadi — 'kariyes'", () => {
    expect(entry.includes(normalizeSearch('kariyes'))).toBe(true);
  });

  it("kod bo'yicha topadi — 'k02'", () => {
    expect(entry.includes(normalizeSearch('K02'))).toBe(true);
  });

  it('UI tili uz bo\'lsa ham ruscha nom bo\'yicha topadi — "кариес" (cross-language)', () => {
    expect(entry.includes(normalizeSearch('Кариес'))).toBe(true);
  });

  it("transliteratsiya qamralmaydi (hujjatlangan cheklov) — 'karies' (y'siz) topmaydi", () => {
    expect(entry.includes(normalizeSearch('karies'))).toBe(false);
  });
});
