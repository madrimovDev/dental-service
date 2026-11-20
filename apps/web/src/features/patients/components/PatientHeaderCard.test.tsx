import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientHeaderCard } from './PatientHeaderCard';

const patient = {
  fullName: 'Ali Valiyev',
  phone: '+998901234567',
  age: 30,
  genderLabel: 'Erkak',
  tags: [],
  source: null,
};

describe('PatientHeaderCard', () => {
  // CLI-468: avval `Math.abs(balance).toLocaleString('ru-RU')` — formatCurrency'ni
  // chetlab o'tardi (space-grouping bor, lekin valyuta suffiksi yo'q edi).
  it("balansni formatCurrency orqali (valyuta suffiksi bilan) ko'rsatadi", () => {
    renderApp(<PatientHeaderCard patient={patient} balance={1234567} />);
    // to'liq matn bitta elementda: guruhlangan raqam + " so'm" (phone raqami bilan
    // aralashmasligi uchun suffiksni ham talab qilamiz).
    expect(screen.getByText(/1.?234.?567.?so'm/)).toBeInTheDocument();
  });

  it('manfiy balans (kredit) uchun ham musbat (abs) formatlangan summa ko‘rsatadi', () => {
    renderApp(<PatientHeaderCard patient={patient} balance={-50000} />);
    expect(screen.getByText(/50.?000.?so'm/)).toBeInTheDocument();
  });

  it('balance=undefined bo‘lsa balans bloki ko‘rsatilmaydi', () => {
    renderApp(<PatientHeaderCard patient={patient} />);
    expect(screen.queryByText(/so'm/)).not.toBeInTheDocument();
  });

  it("FT-04.3: doimiy chegirma bo'lsa sarlavhada «Chegirma 10%» belgisi", () => {
    renderApp(<PatientHeaderCard patient={{ ...patient, defaultDiscountPercent: 10 }} />);
    expect(screen.getByTestId('patient-discount-badge')).toHaveTextContent('Chegirma 10%');
  });

  it("FT-04.3: chegirma yo'q (null/0) — belgi ko'rinmaydi", () => {
    renderApp(<PatientHeaderCard patient={{ ...patient, defaultDiscountPercent: null }} />);
    expect(screen.queryByTestId('patient-discount-badge')).not.toBeInTheDocument();
    renderApp(<PatientHeaderCard patient={{ ...patient, defaultDiscountPercent: 0 }} />);
    expect(screen.queryByTestId('patient-discount-badge')).not.toBeInTheDocument();
  });
});
