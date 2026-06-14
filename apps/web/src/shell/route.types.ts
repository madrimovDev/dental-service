import type { ReactNode } from 'react';

/**
 * Route registry yozuvi. Har feature `<feature>.routes.tsx` da `AppRoute[]` eksport qiladi,
 * `app/routes.tsx` ularni `publicRoutes`/`protectedRoutes` ga yig'adi (RFC-0010 §6).
 *
 * - `perm` belgilangan bo'lsa — `App.tsx` uni `RequirePermission` bilan o'raydi.
 * - `perm` undefined — darvozasiz route (`/`, `/profile`, public auth sahifalari).
 */
export type AppRoute = {
  path: string;
  element: ReactNode;
  perm?: string;
};
