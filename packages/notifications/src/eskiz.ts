import type { NotificationChannel } from './types.ts';

const BASE = 'https://notify.eskiz.uz/api';

/** Eskiz SMS kanal — token auth (login) + sms send. */
export const createEskizChannel = (config: {
  email: string;
  password: string;
}): NotificationChannel => {
  let token: string | null = null;

  async function auth(): Promise<string> {
    if (token) return token;
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    const json = (await res.json()) as { data?: { token?: string } };
    token = json.data?.token ?? null;
    if (!token) throw new Error('Eskiz auth failed');
    return token;
  }

  return {
    async send(to, message) {
      try {
        const t = await auth();
        const res = await fetch(`${BASE}/message/sms/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mobile_phone: to.replace(/\D/g, ''),
            message: message.text,
            from: '4546',
          }),
        });
        if (!res.ok) return { ok: false, error: `Eskiz ${res.status}` };
        const json = (await res.json()) as { id?: string };
        return { ok: true, providerId: json.id };
      } catch (e) {
        token = null;
        return { ok: false, error: e instanceof Error ? e.message : 'eskiz_error' };
      }
    },
  };
};
