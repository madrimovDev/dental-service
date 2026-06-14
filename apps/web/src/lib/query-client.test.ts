import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from './query-client';

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
