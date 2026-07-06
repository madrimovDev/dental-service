import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const PatientsListScreen = lazy(() =>
  import('./components/PatientsListScreen').then((m) => ({ default: m.PatientsListScreen })),
);
const PatientNewScreen = lazy(() =>
  import('./components/PatientNewScreen').then((m) => ({ default: m.PatientNewScreen })),
);
const PatientCard = lazy(() =>
  import('./components/PatientCard').then((m) => ({ default: m.PatientCard })),
);

export const patientRoutes: AppRoute[] = [
  { path: '/patients', perm: 'patient.view', element: <PatientsListScreen /> },
  { path: '/patients/new', perm: 'patient.create', element: <PatientNewScreen /> },
  { path: '/patients/:id', perm: 'patient.view', element: <PatientCard /> },
];
