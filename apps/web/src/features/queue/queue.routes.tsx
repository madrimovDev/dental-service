import type { AppRoute } from '@/shell';
import { QueueBoard } from './components/QueueBoard';
import { QueueDisplayBoard } from './components/QueueDisplayBoard';

export const queueRoutes: AppRoute[] = [
  { path: '/queue', perm: 'queue.view', element: <QueueBoard /> },
  { path: '/queue/board', perm: 'queue.view', element: <QueueDisplayBoard /> },
];
