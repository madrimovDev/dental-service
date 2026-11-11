import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLicenseBlock, queryClient } from './query-client';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// i18n.t() faqat key'ni qaytarsin — test deterministik bo'lishi uchun.
vi.mock('@/lib/i18n.ts', () => ({
  i18n: { t: (key: string) => key },
}));

describe('queryClient MutationCache.onError (global error toast)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ApiError xabarini qizil toast bilan ko'rsatadi", () => {
    const onError = queryClient.getMutationCache().config.onError;
    // TanStack v5 onError signaturi: (error, variables, onMutateResult, mutation, context).
    // Mutation 4-argument; oxirgi (context) tip uchun qo'shilgan.
    onError?.(
      new ApiError('x', 'boom', 500),
      undefined,
      undefined,
      { options: {} } as never,
      undefined as never,
    );

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red', message: 'boom' }),
    );
  });

  it("mutation o'z onError handleriga ega bo'lsa global toast chiqmaydi", () => {
    const onError = queryClient.getMutationCache().config.onError;
    onError?.(
      new ApiError('x', 'boom', 500),
      undefined,
      undefined,
      { options: { onError: () => {} } } as never,
      undefined as never,
    );

    expect(notifications.show).not.toHaveBeenCalled();
  });
});

describe('handleLicenseBlock (P18)', () => {
  const assign = vi.fn();
  afterEach(() => {
    assign.mockReset();
    vi.unstubAllGlobals();
  });
  const stubLocation = (pathname: string) =>
    vi.stubGlobal('window', { location: { pathname, assign } });

  it('LICENSE_EXPIRED → /license-expired', () => {
    stubLocation('/');
    expect(handleLicenseBlock(new ApiError('LICENSE_EXPIRED', 'x', 403))).toBe(true);
    expect(assign).toHaveBeenCalledWith('/license-expired');
  });

  it("LICENSE_NOT_FOUND → /activate (to'lov ekrani emas)", () => {
    stubLocation('/patients');
    expect(handleLicenseBlock(new ApiError('LICENSE_NOT_FOUND', 'x', 403))).toBe(true);
    expect(assign).toHaveBeenCalledWith('/activate');
  });

  it("maqsad sahifada qayta yo'naltirmaydi; boshqa 403 e'tiborsiz", () => {
    stubLocation('/license-expired');
    expect(handleLicenseBlock(new ApiError('LICENSE_EXPIRED', 'x', 403))).toBe(true);
    expect(handleLicenseBlock(new ApiError('forbidden', 'x', 403))).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('handleLicenseBlock — auth.password_change_required (P6)', () => {
  const assign = vi.fn();
  afterEach(() => {
    assign.mockReset();
    vi.unstubAllGlobals();
  });

  it('403 auth.password_change_required → /change-password-required', () => {
    vi.stubGlobal('window', { location: { pathname: '/patients', assign } });
    expect(handleLicenseBlock(new ApiError('auth.password_change_required', 'x', 403))).toBe(true);
    expect(assign).toHaveBeenCalledWith('/change-password-required');
  });

  it("maqsad sahifada qayta yo'naltirmaydi", () => {
    vi.stubGlobal('window', { location: { pathname: '/change-password-required', assign } });
    expect(handleLicenseBlock(new ApiError('auth.password_change_required', 'x', 403))).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });
});
