import { cssVarsResolver, mantineTheme } from '@dental/ui';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { AppShell, RequirePermission } from '@/shell';
import { protectedRoutes, publicRoutes } from './routes.tsx';

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
            <ErrorBoundary>
              <Routes>
                {/* Public — shell tashqarisida */}
                {publicRoutes.map((r) => (
                  <Route key={r.path} path={r.path} element={r.element} />
                ))}

                {/* Protected — AppShell layout, Outlet */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  {protectedRoutes.map((r) => (
                    <Route
                      key={r.path}
                      path={r.path}
                      element={
                        r.perm ? (
                          <RequirePermission perm={r.perm}>{r.element}</RequirePermission>
                        ) : (
                          r.element
                        )
                      }
                    />
                  ))}
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
