import { logger } from '../logger.ts';

/**
 * FU-15: klinika botining `username`i (deep-link `t.me/<username>` uchun) — Telegram
 * `getMe` orqali. Bot tokeni yaroqsiz / Telegram javob bermasa → `null` (chaqiruvchi
 * yopiq holatga o'tadi: tasdiq mumkin emas). Timeout bilan — o'lik tarmoq HTTP
 * javobni osib qo'ymasin. Token log'ga yozilmaydi.
 */
export async function fetchBotUsername(token: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'telegram getMe failed');
      return null;
    }
    const body = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    const username = body.ok ? body.result?.username : undefined;
    return username && /^[A-Za-z0-9_]{3,64}$/.test(username) ? username : null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'telegram getMe error');
    return null;
  }
}
