import { ROLE_TEMPLATES } from '@dental/core';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store.ts';
import { renderApp } from '../../../test-utils';
import { OwnerAlertsPanel } from './OwnerAlertsPanel.tsx';

vi.setConfig({ testTimeout: 30_000 });

/**
 * FX-73 — filialga biriktirilgan Branch Manager butun-klinika (tenant-wide) hisobotlarni
 * (qarz, davolash rejalari) so'ramasligi kerak: server 403 `report.tenant_scope_required` beradi.
 * Haqiqiy rol shabloni permset'i + haqiqiy react-query; faqat transport kuzatiladi.
 */
const api = vi.hoisted(() => {
  const ok = (data: unknown) => vi.fn(async () => ({ success: true, data }));
  return {
    getReportBranches: ok({ branches: [{ id: 'b1', name: 'Markaz' }], allowAllBranches: false }),
    getDebtAgingReport: ok({ totalDebt: 800000, patientCount: 2, over90Count: 1, buckets: [] }),
    getPlanCompletionReport: ok({ rate: 0.6 }),
    getRevenueReport: ok({ total: 0, byBranch: [], byService: [] }),
    getAppointmentStatsReport: ok({ noShowRate: 0, slotUtilization: 0 }),
    getDoctorWorkloadReport: ok([]),
    getOwnerTodayReport: ok({
      date: '2026-06-22',
      netTotal: 0,
      refunded: 0,
      byPaymentMethod: [],
      branches: [],
      doctors: [],
    }),
    getBackupStatus: ok(null),
    getLicenseStatus: ok(null),
    listBranches: ok([]),
    listUserAssignments: ok([]),
    getTenantSettings: ok({ onboardingDismissedAt: null }),
  };
});

vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));
vi.mock('./OnboardingChecklist.tsx', () => ({ OnboardingChecklist: () => null }));
vi.mock('./widgets/TelegramRequests.tsx', () => ({ TelegramRequests: () => null }));

const permsOf = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template: ${key}`);
  return [...t.permissions];
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
  useAuthStore.setState({ permissions: permsOf('branch_manager'), activeBranchId: 'b1' });
});
afterEach(() => useAuthStore.setState({ permissions: [], activeBranchId: null }));

describe('FX-73 ManagerDashboard — filialga biriktirilgan Branch Manager', () => {
  it("precondition: shablon report.view'ga ega", () => {
    expect(permsOf('branch_manager')).toContain('report.view');
  });

  it("tenant-wide so'rovlar (debt-aging, treatment-plans) yuborilmaydi va plitka sababni aytadi", async () => {
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);
    await waitFor(() => expect(api.getReportBranches).toHaveBeenCalled());
    await waitFor(() => expect(api.getRevenueReport).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(api.getDebtAgingReport).not.toHaveBeenCalled();
    expect(api.getPlanCompletionReport).not.toHaveBeenCalled();
    // jim '—' emas: sabab matni ko'rinadi
    expect(await screen.findByText('Faqat butun klinika rahbarlari ko‘radi')).toBeInTheDocument();
  });

  it("OwnerAlertsPanel ham qarz hisobotini so'ramaydi", async () => {
    renderApp(<OwnerAlertsPanel />);
    await waitFor(() => expect(api.getReportBranches).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(api.getDebtAgingReport).not.toHaveBeenCalled();
  });

  it("klinika miqyosidagi rahbar (allowAllBranches) uchun so'rovlar yuboriladi", async () => {
    api.getReportBranches.mockResolvedValueOnce({
      success: true,
      data: { branches: [{ id: 'b1', name: 'Markaz' }], allowAllBranches: true },
    });
    const { ManagerDashboard } = await import('./ManagerDashboard.tsx');
    renderApp(<ManagerDashboard />);
    await waitFor(() => expect(api.getDebtAgingReport).toHaveBeenCalled());
    await waitFor(() => expect(api.getPlanCompletionReport).toHaveBeenCalled());
  });
});
