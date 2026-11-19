import { notifications } from '@mantine/notifications';
import { MutationCache, QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/stores/auth';
import { HubApiError } from './api';
import { i18n } from './i18n';

const messageFor = (err: unknown) => {
  if (err instanceof HubApiError) {
    if (err.code === 'case.bad_transition' || err.code === 'case.concurrent_update')
      return i18n.t('labHub.detail.badTransition');
  }
  return i18n.t('labHub.detail.actionError');
};

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5_000 } },
  mutationCache: new MutationCache({
    onError: (err, _v, _c, mutation) => {
      if (mutation.options.onError) return; // per-mutation xato matni o'zida
      notifications.show({ color: 'red', message: messageFor(err) });
    },
  }),
});

// Sessiya tugaganda (logout yoki 401) kesh tozalanadi — keyingi foydalanuvchi
// oldingisining lab ma'lumotini ko'rmasin (FX-140). Store'ga bog'lanish shu yerda:
// auth store query-client'ni import qilsa, api <-> store sikli paydo bo'ladi.
useAuth.subscribe((state, prev) => {
  if (prev.token && !state.token) queryClient.clear();
});
