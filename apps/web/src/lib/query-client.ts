import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { i18n } from '@/lib/i18n.ts';

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      // Mutation o'z onError handleriga ega bo'lsa — global default o'tkazib yuboriladi
      // (ikki marta toast chiqmasligi uchun).
      if (mutation.options.onError) return;

      const fallback = i18n.t('common.error');
      let message = fallback;
      if (error instanceof ApiError) {
        message = error.message || fallback;
      } else if (error instanceof Error) {
        message = error.message || fallback;
      }

      notifications.show({
        color: 'red',
        title: i18n.t('common.error'),
        message,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
