import { cssVarsResolver, mantineTheme } from '@dental/ui';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute.tsx';
import { DashboardRouter } from '@/features/dashboard';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { AppointmentsPage } from '@/pages/appointments.page.tsx';
import { AuditPage } from '@/pages/audit.page.tsx';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password.page.tsx';
import { LoginPage } from '@/pages/auth/login.page.tsx';
import { RegisterTenantPage } from '@/pages/auth/register-tenant.page.tsx';
import { ResetPasswordPage } from '@/pages/auth/reset-password.page.tsx';
import { SelectWorkspacePage } from '@/pages/auth/select-workspace.page.tsx';
import { CashierPage } from '@/pages/cashier.page.tsx';
import { DesignSystemPage } from '@/pages/dev/DesignSystemPage.tsx';
import { ExpensesPage } from '@/pages/expenses.page.tsx';
import { ForbiddenPage } from '@/pages/forbidden.page.tsx';
import { PatientDetailPage } from '@/pages/patients/detail.page.tsx';
import { PatientsListPage } from '@/pages/patients/list.page.tsx';
import { NewPatientPage } from '@/pages/patients/new.page.tsx';
import { PayrollPage } from '@/pages/payroll.page.tsx';
import { ProfilePage } from '@/pages/profile.page.tsx';
import { QueuePage } from '@/pages/queue.page.tsx';
import { ReportsPage } from '@/pages/reports.page.tsx';
import { BranchesPage } from '@/pages/settings/branches.page.tsx';
import { RolesSettingsPage } from '@/pages/settings/roles.page.tsx';
import { ServicesSettingsPage } from '@/pages/settings/services.page.tsx';
import { TenantSettingsPage } from '@/pages/settings/tenant.page.tsx';
import { UsersSettingsPage } from '@/pages/settings/users.page.tsx';
import { StockPage } from '@/pages/stock.page.tsx';
import { AppShell, RequirePermission } from '@/shell';

const rp = (perm: string, el: ReactNode) => <RequirePermission perm={perm}>{el}</RequirePermission>;

export function App() {
  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={cssVarsResolver}
      defaultColorScheme="light"
    >
      <Notifications position="top-right" />
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              {/* Public — shell tashqarisida */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-tenant" element={<RegisterTenantPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/select-workspace" element={<SelectWorkspacePage />} />
              {import.meta.env.DEV && <Route path="/dev/ds" element={<DesignSystemPage />} />}

              {/* Protected — AppShell layout, Outlet */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardRouter />} />
                <Route path="/patients" element={rp('patient.view', <PatientsListPage />)} />
                <Route path="/patients/new" element={rp('patient.create', <NewPatientPage />)} />
                <Route path="/patients/:id" element={rp('patient.view', <PatientDetailPage />)} />
                <Route
                  path="/appointments"
                  element={rp('appointment.view', <AppointmentsPage />)}
                />
                <Route path="/queue" element={rp('queue.view', <QueuePage />)} />
                <Route path="/cashier" element={rp('cashier.view', <CashierPage />)} />
                <Route path="/reports" element={rp('report.view', <ReportsPage />)} />
                <Route path="/audit" element={rp('audit_log.view', <AuditPage />)} />
                <Route path="/expenses" element={rp('expense.view', <ExpensesPage />)} />
                <Route path="/stock" element={rp('stock.view', <StockPage />)} />
                <Route path="/payroll" element={rp('payroll.view', <PayrollPage />)} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/settings/services"
                  element={rp('service.view', <ServicesSettingsPage />)}
                />
                <Route
                  path="/settings/tenant"
                  element={rp('tenant.view', <TenantSettingsPage />)}
                />
                <Route path="/settings/branches" element={rp('branch.view', <BranchesPage />)} />
                <Route path="/settings/roles" element={rp('role.view', <RolesSettingsPage />)} />
                <Route path="/settings/users" element={rp('user.view', <UsersSettingsPage />)} />
                <Route path="/403" element={<ForbiddenPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
