// @dental/notifications — abstract NotificationChannel (SMS Eskiz/NoOp; Telegram/Email keyingi faza).

export { createEskizChannel } from './eskiz.ts';
export { createNoOpChannel } from './noop.ts';
export * from './types.ts';

import { createEskizChannel } from './eskiz.ts';
import { createNoOpChannel } from './noop.ts';
import type { NotificationChannel } from './types.ts';

/** SMS kanal factory — Eskiz config bo'lsa real, aks holda NoOp. */
export const createSmsChannel = (env: {
  eskizEmail?: string;
  eskizPassword?: string;
}): NotificationChannel =>
  env.eskizEmail && env.eskizPassword
    ? createEskizChannel({ email: env.eskizEmail, password: env.eskizPassword })
    : createNoOpChannel();
