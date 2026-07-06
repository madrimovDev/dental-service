const API = import.meta.env.VITE_API_URL ?? '';

export const authFetch = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) {
    // Token yaroqsiz (muddati o'tgan/bekor qilingan) — tozalab /login ga
    // hard-redirect qilamiz. authFetch React komponent daraxti tashqarisida
    // ishlaydigan oddiy modul funksiyasi, useNavigate() shu yerda ishlamaydi
    // (CLI-392).
    localStorage.removeItem('admin_token');
    window.location.assign('/login');
  }

  return res;
};
