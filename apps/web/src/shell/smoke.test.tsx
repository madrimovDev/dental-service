import { describe, expect, it } from 'vitest';
import { renderApp } from '../test-utils';

describe('test-utils', () => {
  it('renderApp i18n + Mantine + Router bilan render qiladi', () => {
    const { getByText } = renderApp(<div>SMOKE OK</div>);
    expect(getByText('SMOKE OK')).toBeInTheDocument();
  });
});
