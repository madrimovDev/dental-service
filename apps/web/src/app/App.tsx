import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { HomePage } from '@/pages/home.page.tsx';
import { mantineTheme } from '@/theme/mantine-theme.ts';

export function App() {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
