import { mantineTheme } from '@dental/ui';
import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { i18n } from '@/lib/i18n.ts';

export function renderApp(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  return render(
    <MantineProvider theme={mantineTheme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </I18nextProvider>
    </MantineProvider>,
  );
}
