import { createApiClient, createEndpoints } from '@dental/api-client';
import { useAuthStore } from '@/stores/auth-store.ts';

/**
 * Raw refresh fetch — circular dep oldini olish uchun api.auth.refresh ishlatmaymiz.
 * api-client client.ts ichida refreshTokens(rt) bo'lib chaqiriladi.
 */
async function refreshTokens(refreshToken: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
  const res = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  });
  const parsed = (await res.json().catch(() => null)) as
    | { success: true; data: { accessToken: string; refreshToken: string } }
    | { success: false; error: { code: string; message: string } }
    | null;
  if (!parsed || !parsed.success) throw new Error('refresh_failed');
  return parsed.data;
}

const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  refreshTokens,
  onTokensRefreshed: ({ accessToken, refreshToken }) => {
    const store = useAuthStore.getState();
    // Yangi access tokendan workspace context'ini olish
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1] ?? '')) as {
        atid: string | null;
        abid: string | null;
        perms: string[];
      };
      store.setTokens(accessToken, refreshToken);
      store.setContext(payload.atid, payload.abid, payload.perms);
    } catch {
      // Decode fail → faqat tokenlarni saqlash
      store.setTokens(accessToken, refreshToken);
    }
  },
  onUnauthorized: () => {
    // Refresh ham fail bo'ldi yoki yo'q → logout
    useAuthStore.getState().clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  },
});

export const api = createEndpoints(apiClient);
