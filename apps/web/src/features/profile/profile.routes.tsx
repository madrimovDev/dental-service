import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ProfilePage = lazy(() =>
  import('./pages/profile.page').then((m) => ({ default: m.ProfilePage })),
);

// Protected, perm darvozasiz — login bo'lgan har foydalanuvchi o'z profilini ko'radi
export const profileRoutes: AppRoute[] = [{ path: '/profile', element: <ProfilePage /> }];
