import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { i18n } from '@/lib/i18n.ts';

const LICENSE_BLOCK_CODES = ['LICENSE_EXPIRED', 'LICENSE_NOT_FOUND'];

/**
 * Desktop'da litsenziya bloki (403 LICENSE_EXPIRED / LICENSE_NOT_FOUND) → blok ekraniga.
 * Allaqachon o'sha sahifada bo'lsa qayta yo'naltirilmaydi.
 */
export function handleLicenseBlock(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  if (!LICENSE_BLOCK_CODES.includes(error.code)) return false;
  if (typeof window !== 'undefined' && window.location.pathname !== '/license-expired') {
    window.location.assign('/license-expired');
  }
  return true;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      handleLicenseBlock(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (handleLicenseBlock(error)) return;
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
