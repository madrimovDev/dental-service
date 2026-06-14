import type { AppRoute } from '@/shell';
import { QueueBoard } from './components/QueueBoard';

export const queueRoutes: AppRoute[] = [
  { path: '/queue', perm: 'queue.view', element: <QueueBoard /> },
];
