const API = import.meta.env.VITE_API_URL ?? '';

export const authFetch = (path: string, init?: RequestInit) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}`,
      'Content-Type': 'application/json',
    },
  });
