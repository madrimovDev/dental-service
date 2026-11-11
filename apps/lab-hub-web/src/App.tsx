import { cssVarsResolver, mantineTheme } from '@dental/ui';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { ExpiredPage } from '@/features/auth/ExpiredPage';
import { RequireAuth, RequireLead } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/LoginPage';
import { CasesPage } from '@/features/cases/CasesPage';
import { ClinicsPage } from '@/features/clinics/ClinicsPage';
import { PricesPage } from '@/features/prices/PricesPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { i18n } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';
import { AppShell } from '@/shell/AppShell';

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
              <Route path="/login" element={<LoginPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/expired" element={<ExpiredPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<CasesPage />} />
                <Route path="/clinics" element={<ClinicsPage />} />
                <Route path="/prices" element={<PricesPage />} />
                <Route
                  path="/staff"
                  element={
                    <RequireLead>
                      <StaffPage />
                    </RequireLead>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
