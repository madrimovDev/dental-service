import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { VisitNotesTab } from './VisitNotesTab';

let canAuthor = true;

vi.mock('../../clinical.api', () => ({
  useVisitNotes: () => ({ data: [], isLoading: false, isError: false }),
  useDiagnoses: () => ({ data: [] }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));
vi.mock('../../clinical-author', () => ({
  useClinicalAuthor: () => ({ canAuthor }),
}));

describe('VisitNotesTab — FX-155 yaratish tugmasi', () => {
  beforeEach(() => {
    canAuthor = true;
  });

  it('muallif bo‘la oladi (shifokor / on_behalf) → «Yangi vizit» ko‘rinadi', () => {
    renderApp(<VisitNotesTab patientId="p1" />);
    expect(screen.getByRole('button', { name: /vizit/i })).toBeInTheDocument();
  });

  it('medical_record.edit bor, lekin shifokor emas va on_behalf yo‘q → tugma yo‘q', () => {
    canAuthor = false;
    renderApp(<VisitNotesTab patientId="p1" />);
    expect(screen.queryByRole('button', { name: /vizit/i })).toBeNull();
  });
});
