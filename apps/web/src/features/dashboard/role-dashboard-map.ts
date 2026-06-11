import type { ComponentType } from 'react';
import { AccountantDashboard } from './components/AccountantDashboard.tsx';
import { AssistantDashboard } from './components/AssistantDashboard.tsx';
import { DoctorDashboard } from './components/DoctorDashboard.tsx';
import { ManagerDashboard } from './components/ManagerDashboard.tsx';
import { ReceptionistDashboard } from './components/ReceptionistDashboard.tsx';
import { TechnicianDashboard } from './components/TechnicianDashboard.tsx';

/** templateKey (roles.template_key) → rol dashboard komponenti. */
export const DASHBOARD_BY_ROLE: Record<string, ComponentType> = {
  tenant_admin: ManagerDashboard,
  branch_manager: ManagerDashboard,
  doctor: DoctorDashboard,
  doctor_assistant: DoctorDashboard,
  nurse: AssistantDashboard,
  receptionist: ReceptionistDashboard,
  accountant: AccountantDashboard,
  technician: TechnicianDashboard,
};
