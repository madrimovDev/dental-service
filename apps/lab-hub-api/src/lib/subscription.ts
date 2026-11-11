/**
 * Obuna muddati (L10, P18 naqshi): `expiresAt` + 7 kun imtiyoz, keyin to'liq blok.
 * Lab va klinika uchun bir xil qoida.
 */
export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

export type SubscriptionState = 'active' | 'grace' | 'expired';

export const subscriptionState = (
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): SubscriptionState => {
  if (!expiresAt) return 'expired';
  const t = now.getTime();
  if (t <= expiresAt.getTime()) return 'active';
  if (t <= expiresAt.getTime() + GRACE_DAYS * DAY_MS) return 'grace';
  return 'expired';
};

export const isBlocked = (expiresAt: Date | null | undefined, now?: Date) =>
  subscriptionState(expiresAt, now) === 'expired';
