import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardRouter } from './DashboardRouter';

// Child dashboard'larni sentinel bilan mock qilamiz — router faqat marshrutlash
// qiladi, data hook'larini transitiv ravishda tortmasligi uchun.
vi.mock('./components/ManagerDashboard', () => ({
  ManagerDashboard: () => <div>manager-dash</div>,
}));
vi.mock('./components/DoctorDashboard', () => ({
  DoctorDashboard: () => <div>doctor-dash</div>,
}));
vi.mock('./components/ReceptionistDashboard', () => ({
  ReceptionistDashboard: () => <div>receptionist-dash</div>,
}));
vi.mock('./components/AccountantDashboard', () => ({
  AccountantDashboard: () => <div>accountant-dash</div>,
}));
vi.mock('./components/AssistantDashboard', () => ({
  AssistantDashboard: () => <div>assistant-dash</div>,
}));
vi.mock('./components/TechnicianDashboard', () => ({
  TechnicianDashboard: () => <div>technician-dash</div>,
}));
vi.mock('./components/GenericDashboard', () => ({
  GenericDashboard: () => <div>generic-dash</div>,
}));

const mockAuth = vi.fn();
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => mockAuth(),
}));

describe('DashboardRouter', () => {
  it('@owner perm → ManagerDashboard', () => {
    mockAuth.mockReturnValue({ roleKey: null, permissions: ['@owner'] });
    render(<DashboardRouter />);
    expect(screen.getByText('manager-dash')).toBeInTheDocument();
  });

  it("roleKey='doctor' → DoctorDashboard", () => {
    mockAuth.mockReturnValue({ roleKey: 'doctor', permissions: ['patient.view'] });
    render(<DashboardRouter />);
    expect(screen.getByText('doctor-dash')).toBeInTheDocument();
  });

  it("roleKey='receptionist' → ReceptionistDashboard", () => {
    mockAuth.mockReturnValue({ roleKey: 'receptionist', permissions: [] });
    render(<DashboardRouter />);
    expect(screen.getByText('receptionist-dash')).toBeInTheDocument();
  });

  it("noma'lum roleKey → GenericDashboard", () => {
    mockAuth.mockReturnValue({ roleKey: 'unknown_role', permissions: [] });
    render(<DashboardRouter />);
    expect(screen.getByText('generic-dash')).toBeInTheDocument();
  });

  it('roleKey null va owner emas → GenericDashboard', () => {
    mockAuth.mockReturnValue({ roleKey: null, permissions: ['patient.view'] });
    render(<DashboardRouter />);
    expect(screen.getByText('generic-dash')).toBeInTheDocument();
  });
});
