import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute.tsx';
import { AppLayout } from '@/components/layout/AppLayout.tsx';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { AppointmentsPage } from '@/pages/appointments.page.tsx';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password.page.tsx';
import { LoginPage } from '@/pages/auth/login.page.tsx';
import { RegisterTenantPage } from '@/pages/auth/register-tenant.page.tsx';
import { ResetPasswordPage } from '@/pages/auth/reset-password.page.tsx';
import { SelectWorkspacePage } from '@/pages/auth/select-workspace.page.tsx';
import { CashierPage } from '@/pages/cashier.page.tsx';
import { DashboardPage } from '@/pages/dashboard.page.tsx';
import { PatientDetailPage } from '@/pages/patients/detail.page.tsx';
import { PatientsListPage } from '@/pages/patients/list.page.tsx';
import { NewPatientPage } from '@/pages/patients/new.page.tsx';
import { ProfilePage } from '@/pages/profile.page.tsx';
import { QueuePage } from '@/pages/queue.page.tsx';
import { BranchesPage } from '@/pages/settings/branches.page.tsx';
import { RolesSettingsPage } from '@/pages/settings/roles.page.tsx';
import { ServicesSettingsPage } from '@/pages/settings/services.page.tsx';
import { TenantSettingsPage } from '@/pages/settings/tenant.page.tsx';
import { UsersSettingsPage } from '@/pages/settings/users.page.tsx';
import { mantineTheme } from '@/theme/mantine-theme.ts';

const Protected = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

export function App() {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-tenant" element={<RegisterTenantPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/select-workspace" element={<SelectWorkspacePage />} />

              {/* Protected */}
              <Route
                path="/"
                element={
                  <Protected>
                    <DashboardPage />
                  </Protected>
                }
              />
              <Route
                path="/patients"
                element={
                  <Protected>
                    <PatientsListPage />
                  </Protected>
                }
              />
              <Route
                path="/patients/new"
                element={
                  <Protected>
                    <NewPatientPage />
                  </Protected>
                }
              />
              <Route
                path="/patients/:id"
                element={
                  <Protected>
                    <PatientDetailPage />
                  </Protected>
                }
              />
              <Route
                path="/appointments"
                element={
                  <Protected>
                    <AppointmentsPage />
                  </Protected>
                }
              />
              <Route
                path="/queue"
                element={
                  <Protected>
                    <QueuePage />
                  </Protected>
                }
              />
              <Route
                path="/cashier"
                element={
                  <Protected>
                    <CashierPage />
                  </Protected>
                }
              />
              <Route
                path="/profile"
                element={
                  <Protected>
                    <ProfilePage />
                  </Protected>
                }
              />
              <Route
                path="/settings/services"
                element={
                  <Protected>
                    <ServicesSettingsPage />
                  </Protected>
                }
              />
              <Route
                path="/settings/tenant"
                element={
                  <Protected>
                    <TenantSettingsPage />
                  </Protected>
                }
              />
              <Route
                path="/settings/branches"
                element={
                  <Protected>
                    <BranchesPage />
                  </Protected>
                }
              />
              <Route
                path="/settings/roles"
                element={
                  <Protected>
                    <RolesSettingsPage />
                  </Protected>
                }
              />
              <Route
                path="/settings/users"
                element={
                  <Protected>
                    <UsersSettingsPage />
                  </Protected>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
