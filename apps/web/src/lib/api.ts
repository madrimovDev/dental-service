import { createApiClient, createEndpoints } from '@dental/api-client';
import { useAuthStore } from '@/stores/auth-store.ts';

const apiClient = createApiClient({
  // Vite proxy /api to localhost:8001 in dev; absolute URL in prod via VITE_API_BASE_URL
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    // Token expired — clear state and route to /login
    useAuthStore.getState().clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  },
});

export const api = createEndpoints(apiClient);
