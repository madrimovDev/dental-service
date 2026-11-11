import type { AppRoute } from '@/shell';
import { LicenseBlockedScreen } from './components/LicenseBlockedScreen';

// Public route — shell tashqarisida (blok paytida ham ochiladi)
export const licenseRoutes: AppRoute[] = [
  { path: '/license-expired', element: <LicenseBlockedScreen /> },
];
