import { ROLE_TEMPLATES } from '@dental/core';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueBoard } from '@/features/queue/components/QueueBoard.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { renderApp } from '../../../test-utils';
import { OnboardingChecklist } from './OnboardingChecklist.tsx';
import { OwnerAlertsPanel } from './OwnerAlertsPanel.tsx';

/**
 * fx-rbac #3 — real cheklangan permset (rol shablonlari) bilan: ruxsatsiz rol 403 beradigan
 * endpoint'larni UMUMAN chaqirmasligi kerak. Haqiqiy `useAuthStore` + haqiqiy react-query;
 * faqat transport (`@dental/api-client` funksiyalari) kuzatiladi.
 */
const api = vi.hoisted(() => {
  const ok = (data: unknown) => vi.fn(async () => ({ success: true, data }));
  return {
    getTenantSettings: ok({ onboardingDismissedAt: null }),
    getBackupStatus: ok(null),
    getCheckInCandidates: ok([]),
    listServices: ok([]),
    listBranches: ok([]),
    listUserAssignments: ok([]),
    getQueueToday: ok([]),
    listPatients: ok({ data: [], meta: { page: 1, pageSize: 100, total: 0 } }),
    getDebtAging: ok({ totalDebt: 0, patientCount: 0, over90Count: 0, buckets: [] }),
    getLicenseStatus: ok(null),
  };
});

vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));

const permsOf = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template: ${key}`);
  return [...t.permissions];
};

const login = (key: string) =>
  useAuthStore.setState({ permissions: permsOf(key), activeBranchId: 'b1' });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
});
afterEach(() => useAuthStore.setState({ permissions: [], activeBranchId: null }));

describe('Branch Manager (real template permset)', () => {
  it("precondition: tenant_settings.* YO'Q", () => {
    expect(permsOf('branch_manager')).not.toContain('tenant_settings.view');
    expect(permsOf('branch_manager')).not.toContain('tenant_settings.edit');
  });

  it("OnboardingChecklist: /tenant-settings va qo'shni so'rovlar chaqirilmaydi", async () => {
    login('branch_manager');
    renderApp(<OnboardingChecklist />);
    await new Promise((r) => setTimeout(r, 50));
    expect(api.getTenantSettings).not.toHaveBeenCalled();
    expect(api.listUserAssignments).not.toHaveBeenCalled();
  });

  it('OwnerAlertsPanel: /backup/status chaqirilmaydi', async () => {
    login('branch_manager');
    renderApp(<OwnerAlertsPanel />);
    await new Promise((r) => setTimeout(r, 50));
    expect(api.getBackupStatus).not.toHaveBeenCalled();
  });
});

describe('Nurse (real template permset) — Navbat', () => {
  it('QueueBoard: check-in-candidates (queue.create) va services (service.view) chaqirilmaydi, navbat esa yuklanadi', async () => {
    const perms = permsOf('nurse');
    expect(perms).not.toContain('queue.create');
    expect(perms).not.toContain('service.view');
    login('nurse');
    renderApp(<QueueBoard />);
    await waitFor(() => expect(api.getQueueToday).toHaveBeenCalled());
    expect(api.getCheckInCandidates).not.toHaveBeenCalled();
    expect(api.listServices).not.toHaveBeenCalled();
  });
});

describe("Tenant Admin (ijobiy nazorat — ruxsat bor bo'lsa so'rov ketadi)", () => {
  it('OwnerAlertsPanel: /backup/status chaqiriladi', async () => {
    login('tenant_admin');
    renderApp(<OwnerAlertsPanel />);
    await waitFor(() => expect(api.getBackupStatus).toHaveBeenCalled());
  });
});
