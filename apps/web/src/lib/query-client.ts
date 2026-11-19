import { ApiError } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { apiErrorMessage } from '@/lib/api-error-message.ts';
import { i18n } from '@/lib/i18n.ts';

/**
 * Desktop'da litsenziya bloki:
 * - 403 LICENSE_EXPIRED → blok ekrani (to'lov kerak);
 * - 403 LICENSE_NOT_FOUND → /activate (litsenziya umuman yo'q — to'lov emas, aktivatsiya kerak).
 * Allaqachon maqsad sahifada bo'lsa qayta yo'naltirilmaydi.
 */
const LICENSE_REDIRECTS: Record<string, string> = {
  LICENSE_EXPIRED: '/license-expired',
  LICENSE_NOT_FOUND: '/activate',
  // P6: vaqtinchalik parol bilan kirilgan — faqat parol almashtirish ruxsat etiladi.
  'auth.password_change_required': '/change-password-required',
};

export function handleLicenseBlock(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  const target = LICENSE_REDIRECTS[error.code];
  if (!target) return false;
  if (typeof window !== 'undefined' && window.location.pathname !== target) {
    window.location.assign(target);
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

      // FX-155 review: ma'lum xato kodlari tarjima qilinadi (xom server matni emas).
      notifications.show({
        color: 'red',
        title: i18n.t('common.error'),
        message: apiErrorMessage(error),
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
