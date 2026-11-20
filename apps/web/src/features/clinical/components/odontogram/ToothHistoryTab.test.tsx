import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { ToothHistoryTab } from './ToothHistoryTab';

const toothImageCalls: Array<{ tooth: number; enabled: boolean }> = [];
let perms = new Set<string>(['patient_image.view', 'patient_image.upload', 'medical_record.view']);

vi.mock('../../clinical.api', () => ({
  usePatientToothImages: (_p: string, tooth: number, enabled: boolean) => {
    toothImageCalls.push({ tooth, enabled });
    return {
      data: enabled
        ? [
            {
              id: 'img1',
              tenantId: 't',
              patientId: 'p1',
              uploadedByUserId: null,
              type: 'xray_periapical',
              objectKey: 'k',
              originalFilename: 'rentgen16.jpg',
              contentType: 'application/dicom',
              sizeBytes: 10,
              title: 'Rentgen 16',
              description: null,
              toothNumbers: [16],
              takenDate: null,
              visitNoteId: null,
              createdAt: '2026-02-02T00:00:00Z',
              url: '/uploads/k',
            },
          ]
        : undefined,
      isLoading: false,
      isError: false,
    };
  },
  useVisitNotes: (_p: string, enabled: boolean) => ({
    data: enabled
      ? [
          {
            id: 'v1',
            stageId: 's1',
            toothNumbers: null,
            visitDate: '2026-02-01T10:00:00Z',
            subjective: 'Og‘riq kechasi',
            signedAt: '2026-02-01T11:00:00Z',
          },
          {
            id: 'v2',
            stageId: null,
            toothNumbers: [26],
            visitDate: '2026-02-04T10:00:00Z',
            subjective: 'Boshqa tish',
            signedAt: null,
          },
        ]
      : undefined,
    isLoading: false,
  }),
  useUploadPatientImage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { hasPermission: (p: string) => perms.has(p) };
    return sel ? sel(state) : state;
  },
}));

const plans = [
  {
    id: 'p1',
    title: 'Reja A',
    status: 'in_progress',
    createdAt: '2026-01-01T00:00:00Z',
    stages: [
      {
        id: 's1',
        serviceName: 'Plomba (kompozit)',
        toothNumbers: [16],
        status: 'completed',
        completedAt: '2026-02-01T00:00:00Z',
        cost: '250000.00',
      },
      {
        id: 's9',
        serviceName: 'Toj 26',
        toothNumbers: [26],
        status: 'pending',
        completedAt: null,
        cost: '900000.00',
      },
    ],
  },
] as never;

const snapshots = [
  {
    chartId: 'c1',
    createdAt: '2026-01-15T00:00:00Z',
    state: 'caries' as const,
    diagnosisId: null,
    surfaces: ['O' as const],
  },
];

const renderTab = () =>
  renderApp(
    <ToothHistoryTab
      patientId="p1"
      tooth={16}
      snapshots={snapshots}
      plans={plans}
      diagnosisById={new Map()}
      lang="uz"
      chair={false}
    />,
  );

describe('ToothHistoryTab (FT-01.4, CF-10)', () => {
  beforeEach(() => {
    toothImageCalls.length = 0;
    perms = new Set(['patient_image.view', 'patient_image.upload', 'medical_record.view']);
  });

  it('holat snapshoti, shu tishli bosqich (reja/holat/narx), vizit va rasmni ko‘rsatadi', () => {
    renderTab();
    expect(toothImageCalls.at(-1)).toEqual({ tooth: 16, enabled: true });
    // Snapshot
    expect(screen.getByText(/Kariyes · O/i)).toBeTruthy();
    // Bosqich: faqat 16-tishli (26 emas)
    expect(screen.getByText('Plomba (kompozit)')).toBeTruthy();
    expect(screen.queryByText('Toj 26')).toBeNull();
    expect(screen.getByText(/Reja A/)).toBeTruthy();
    expect(screen.getByText(/250\s000/)).toBeTruthy();
    // Vizit: bosqich orqali bog'langan (v1), boshqa tishli (v2) yo'q
    expect(screen.getByText(/Og‘riq kechasi/)).toBeTruthy();
    expect(screen.queryByText(/Boshqa tish/)).toBeNull();
    // Rasm
    expect(screen.getByText('Rentgen 16')).toBeTruthy();
  });

  it('patient_image.view / medical_record.view yo‘q → rasm/vizit so‘rovi yuborilmaydi', () => {
    perms = new Set();
    renderTab();
    expect(toothImageCalls.at(-1)).toEqual({ tooth: 16, enabled: false });
    expect(screen.queryByText('Rentgen 16')).toBeNull();
    expect(screen.queryByText(/Og‘riq kechasi/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Rasm yuklash/i })).toBeNull();
    // Bosqich (reja) baribir ko'rinadi
    expect(screen.getByText('Plomba (kompozit)')).toBeTruthy();
  });

  it('«Rasm yuklash» → modal tish raqami oldindan to‘ldirilgan holda ochiladi', async () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Rasm yuklash/i }));
    expect(await screen.findByDisplayValue('16')).toBeTruthy();
  });
});
