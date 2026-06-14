import type { AppRoute } from '@/shell';
import { PatientCard } from './components/PatientCard';
import { PatientNewScreen } from './components/PatientNewScreen';
import { PatientsListScreen } from './components/PatientsListScreen';

export const patientRoutes: AppRoute[] = [
  { path: '/patients', perm: 'patient.view', element: <PatientsListScreen /> },
  { path: '/patients/new', perm: 'patient.create', element: <PatientNewScreen /> },
  { path: '/patients/:id', perm: 'patient.view', element: <PatientCard /> },
];
