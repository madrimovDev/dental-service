import type { AppRoute } from '@/shell';
import { ProfilePage } from './pages/profile.page';

// Protected, perm darvozasiz — login bo'lgan har foydalanuvchi o'z profilini ko'radi
export const profileRoutes: AppRoute[] = [{ path: '/profile', element: <ProfilePage /> }];
