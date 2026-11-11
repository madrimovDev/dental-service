import { ApiError } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { SelectWorkspacePage } from './select-workspace.page';

// useMe/useSwitchWorkspace'ni mock qilamiz — real API/auth-store'ga tegmaslik uchun
// (auth.api.ts ichida useMe accessToken'ga bog'liq, useSwitchWorkspace refreshToken
// talab qiladi — bu test faqat render/i18n'ni tekshiradi, mutation oqimini emas).
const inv = vi.hoisted(() => ({
  list: [] as unknown[],
  accept: vi.fn(),
  decline: vi.fn(),
  active: 't1' as string | null,
  switchMutate: vi.fn(),
  phoneVerified: true,
  start: vi.fn(),
}));

vi.mock('../auth.api', () => ({
  useInvitations: () => ({ data: inv.list, isLoading: false }),
  useAcceptInvitation: () => ({ mutate: inv.accept, isPending: false }),
  useDeclineInvitation: () => ({ mutate: inv.decline, isPending: false }),
  useStartPhoneVerification: () => ({ mutate: inv.start, isPending: false }),
  useMe: () => ({
    isLoading: false,
    data: {
      assignments: [
        {
          tenantId: 't1',
          tenantName: 'Tish Klinikasi',
          tenantSlug: 'tish-klinikasi',
          branchId: 'b1',
          branchName: 'Asosiy filial',
          roleName: 'Bosh shifokor',
          isOwner: true,
        },
      ],
      ownerTenants: [],
      phoneVerified: inv.phoneVerified,
    },
  }),
  useSwitchWorkspace: () => ({ mutate: inv.switchMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  // activeTenantId non-null qasddan — auto-select useEffect (bir dona option
  // bo'lsa switchMut.mutate() avtomatik chaqiradi) shart bo'yicha skip qilinadi
  // (bu ticket faqat static render/i18n'ni tekshiradi, auto-select oqimini emas).
  useAuthStore: () => ({
    activeTenantId: inv.active,
    clear: vi.fn(),
    setTokens: vi.fn(),
    setContext: vi.fn(),
  }),
}));

describe('SelectWorkspacePage — CLI-373 owner badge i18n', () => {
  it("egasi bejchasi tarjima qilingan matn bilan ko'rinadi, literal 'Owner' emas", () => {
    renderApp(<SelectWorkspacePage />);

    expect(screen.getByText(i18n.t('auth.select_workspace.owner_badge'))).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
  });
});

describe('SelectWorkspacePage — takliflar (P6 FU-08)', () => {
  it("takliflar bo'lmasa blok ko'rinmaydi", () => {
    inv.list = [];
    renderApp(<SelectWorkspacePage />);
    expect(screen.queryByText(i18n.t('auth.invitations.title'))).not.toBeInTheDocument();
  });

  it("taklif kartasi ko'rinadi va Qabul qilish mutatsiyani chaqiradi", () => {
    inv.list = [
      {
        id: 'inv1',
        tenantId: 't2',
        tenantName: 'Boshqa Klinika',
        branchId: null,
        branchName: null,
        roleName: 'Shifokor',
        invitedAt: '2026-01-01T00:00:00Z',
      },
    ];
    renderApp(<SelectWorkspacePage />);
    expect(screen.getByText(i18n.t('auth.invitations.title'))).toBeInTheDocument();
    expect(screen.getByText('Boshqa Klinika')).toBeInTheDocument();
    fireEvent.click(screen.getByText(i18n.t('auth.invitations.accept')));
    expect(inv.accept).toHaveBeenCalled();
    expect(inv.accept.mock.calls[0]?.[0]).toBe('inv1');
    fireEvent.click(screen.getByText(i18n.t('auth.invitations.decline')));
    expect(inv.decline.mock.calls[0]?.[0]).toBe('inv1');
  });
});

describe('SelectWorkspacePage — avto-tanlash va takliflar (FU-08)', () => {
  it("bitta workspace + kutilayotgan taklif: avto-tanlamaydi, taklif ko'rinadi", () => {
    inv.active = null;
    inv.switchMutate.mockReset();
    inv.list = [
      {
        id: 'inv1',
        tenantId: 't2',
        tenantName: 'Ikkinchi Klinika',
        branchId: null,
        branchName: null,
        roleName: 'Doctor',
        invitedAt: new Date().toISOString(),
      },
    ];
    renderApp(<SelectWorkspacePage />);
    expect(inv.switchMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Ikkinchi Klinika')).toBeTruthy();
    inv.active = 't1';
    inv.list = [];
  });

  it("bitta workspace, taklif yo'q: avto-tanlaydi (avvalgi xulq)", () => {
    inv.active = null;
    inv.switchMutate.mockReset();
    inv.list = [];
    renderApp(<SelectWorkspacePage />);
    expect(inv.switchMutate).toHaveBeenCalledTimes(1);
    inv.active = 't1';
  });
});

describe('SelectWorkspacePage — FU-15 telefonni Telegram orqali tasdiqlash', () => {
  const invite = {
    id: 'inv1',
    tenantId: 't2',
    tenantName: 'Begona Klinika',
    branchId: null,
    branchName: null,
    roleName: 'Doctor',
    invitedAt: '2026-01-01T00:00:00Z',
  };
  const acceptButton = () =>
    screen.getByText(i18n.t('auth.invitations.accept')).closest('button') as HTMLButtonElement;

  it('tasdiqlanmagan: izoh ko‘rinadi, Qabul qilish o‘chirilgan, tasdiqlash tugmasi taklif id bilan', () => {
    inv.phoneVerified = false;
    inv.list = [invite];
    inv.accept.mockReset();
    inv.start.mockReset();
    renderApp(<SelectWorkspacePage />);
    expect(screen.getByText(i18n.t('phoneVerify.hint'))).toBeInTheDocument();
    expect(acceptButton()).toBeDisabled();
    fireEvent.click(acceptButton());
    expect(inv.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(i18n.t('phoneVerify.start')));
    expect(inv.start.mock.calls[0]?.[0]).toBe('inv1');
  });

  it('start muvaffaqiyatli: deepLink ochiladi va kutish holati ko‘rinadi', () => {
    inv.phoneVerified = false;
    inv.list = [invite];
    const link = 'https://t.me/clinic_bot?start=pv_abcdefghijklmnopqrstuvwxyz012345';
    inv.start.mockReset();
    inv.start.mockImplementation((_id: string, o: { onSuccess: (d: unknown) => void }) =>
      o.onSuccess({ alreadyVerified: false, deepLink: link, expiresAt: null }),
    );
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderApp(<SelectWorkspacePage />);
    fireEvent.click(screen.getByText(i18n.t('phoneVerify.start')));
    expect(open).toHaveBeenCalledWith(link, '_blank', 'noopener,noreferrer');
    expect(screen.getByText(i18n.t('phoneVerify.waiting'))).toBeInTheDocument();
    const fallback = screen.getByText(i18n.t('phoneVerify.open_link')).closest('a');
    expect(fallback?.getAttribute('href')).toBe(link);
    expect(acceptButton()).toBeDisabled();
    open.mockRestore();
  });

  it('bot sozlanmagan (409): aniq xabar, jim o‘tkazib yuborilmaydi', () => {
    inv.phoneVerified = false;
    inv.list = [invite];
    inv.start.mockReset();
    inv.start.mockImplementation((_id: string, o: { onError: (e: unknown) => void }) =>
      o.onError(new ApiError('phone.verification_unavailable', 'no bot', 409)),
    );
    renderApp(<SelectWorkspacePage />);
    fireEvent.click(screen.getByText(i18n.t('phoneVerify.start')));
    expect(screen.getByText(i18n.t('phoneVerify.unavailable'))).toBeInTheDocument();
    expect(acceptButton()).toBeDisabled();
  });

  it('tasdiqlangan: tasdiqlash tugmasi yo‘q, Qabul qilish faol', () => {
    inv.phoneVerified = true;
    inv.list = [invite];
    renderApp(<SelectWorkspacePage />);
    expect(screen.queryByText(i18n.t('phoneVerify.start'))).not.toBeInTheDocument();
    expect(acceptButton()).not.toBeDisabled();
    inv.list = [];
  });
});
