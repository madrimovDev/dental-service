import type { Notification as GeneratedNotification } from '@dental/api-client';

export type { NotificationsFeed } from '@dental/api-client';

/**
 * FX-167: `params` API'da bor, lekin generatsiya qilingan kontrakt hali yangilanmagan
 * (generate:contract integratsiyada). Vaqtincha mahalliy kengaytma — regeneratsiyadan keyin
 * generatsiya qilingan maydon bilan mos (ixtiyoriy ⊇ majburiy).
 */
export type Notification = GeneratedNotification & {
  params?: Record<string, string | number> | null;
};
