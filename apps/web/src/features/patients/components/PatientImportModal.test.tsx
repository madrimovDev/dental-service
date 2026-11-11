import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientImportModal } from './PatientImportModal';

const mutateAsync = vi.fn();
vi.mock('../patients.api', () => ({
  useImportPatients: () => ({ mutateAsync, isPending: false, reset: vi.fn() }),
}));
const readSpreadsheet = vi.fn();
vi.mock('../patient-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../patient-import')>();
  return { ...actual, readSpreadsheet: (f: File) => readSpreadsheet(f) };
});

const TABLE = [
  ['F.I.Sh.', 'Telefon', "Tug'ilgan sana"],
  ['Ali Valiyev', '90 123 45 67', '01.05.1990'],
  ['X', '123', ''],
];

const pickFile = async () => {
  readSpreadsheet.mockResolvedValue(TABLE);
  const input = screen.getByLabelText('Faylni tanlang');
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'bemorlar.xlsx')] },
  });
  await screen.findByText(/bemorlar\.xlsx/);
};

describe('FU-24 PatientImportModal', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    readSpreadsheet.mockReset();
  });

  it('fayl → ustun moslash → oldindan ko‘rish (dryRun) → import (dryRun:false)', async () => {
    mutateAsync
      .mockResolvedValueOnce({
        dryRun: true,
        created: 1,
        skippedDuplicate: 0,
        errorCount: 1,
        results: [
          { row: 1, status: 'created' },
          { row: 2, status: 'error', code: 'invalid_name' },
        ],
      })
      .mockResolvedValueOnce({
        dryRun: false,
        created: 1,
        skippedDuplicate: 0,
        errorCount: 1,
        results: [],
      });
    renderApp(<PatientImportModal opened onClose={() => {}} />);
    await pickFile();

    fireEvent.click(screen.getByRole('button', { name: "Oldindan ko'rish" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const first = mutateAsync.mock.calls[0]?.[0];
    expect(first.dryRun).toBe(true);
    // Sarlavhalar avtomatik moslandi, sana kanonik shaklga keltirildi.
    expect(first.rows[0]).toEqual({
      fullName: 'Ali Valiyev',
      phone: '90 123 45 67',
      dateOfBirth: '1990-05-01',
    });
    // Xato sababi + asl fayl qator raqami (sarlavha = 1 → 3-qator).
    expect(await screen.findByText("Qator 3: Ism juda qisqa yoki yo'q")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import qilish (1 ta)' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1]?.[0].dryRun).toBe(false);
    expect(await screen.findByText('Import tugadi')).toBeInTheDocument();
  });

  it('ism ustuni moslanmasa «Oldindan ko‘rish» o‘chiq', async () => {
    readSpreadsheet.mockResolvedValue([
      ['Telefon', 'Boshqa'],
      ['901234567', 'x'],
    ]);
    renderApp(<PatientImportModal opened onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Faylni tanlang'), {
      target: { files: [new File(['x'], 'a.csv')] },
    });
    await screen.findByText(/a\.csv/);
    expect(screen.getByRole('button', { name: "Oldindan ko'rish" })).toBeDisabled();
  });

  it('o‘qib bo‘lmaydigan fayl — aniq xabar, keyingi bosqichga o‘tmaydi', async () => {
    const { ImportFileError } = await import('../patient-import');
    readSpreadsheet.mockRejectedValue(new ImportFileError('too_big'));
    renderApp(<PatientImportModal opened onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Faylni tanlang'), {
      target: { files: [new File(['x'], 'big.xlsx')] },
    });
    expect(await screen.findByText('Fayl 5 MB dan katta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Oldindan ko'rish" })).not.toBeInTheDocument();
  });
});
