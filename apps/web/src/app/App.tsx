import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute.tsx';
import { AppLayout } from '@/components/layout/AppLayout.tsx';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { LoginPage } from '@/pages/auth/login.page.tsx';
import { RegisterTenantPage } from '@/pages/auth/register-tenant.page.tsx';
import { SelectWorkspacePage } from '@/pages/auth/select-workspace.page.tsx';
import { DashboardPage } from '@/pages/dashboard.page.tsx';
import { BranchesPage } from '@/pages/settings/branches.page.tsx';
import { mantineTheme } from '@/theme/mantine-theme.ts';

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
              <Route path="/select-workspace" element={<SelectWorkspacePage />} />

              {/* Protected */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <DashboardPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/branches"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <BranchesPage />
                    </AppLayout>
                  </ProtectedRoute>
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
