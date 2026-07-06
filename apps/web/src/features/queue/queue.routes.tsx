import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const QueueBoard = lazy(() =>
  import('./components/QueueBoard').then((m) => ({ default: m.QueueBoard })),
);
const QueueDisplayBoard = lazy(() =>
  import('./components/QueueDisplayBoard').then((m) => ({ default: m.QueueDisplayBoard })),
);

export const queueRoutes: AppRoute[] = [
  { path: '/queue', perm: 'queue.view', element: <QueueBoard /> },
  { path: '/queue/board', perm: 'queue.view', element: <QueueDisplayBoard /> },
];
