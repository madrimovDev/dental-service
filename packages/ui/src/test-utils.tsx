import { MantineProvider } from '@mantine/core';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { mantineTheme } from './theme/mantine-theme';

export function renderUI(ui: ReactNode) {
  return render(<MantineProvider theme={mantineTheme}>{ui}</MantineProvider>);
}
