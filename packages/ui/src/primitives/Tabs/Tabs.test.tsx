import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  it('tablarni render qiladi va onChange chaqiriladi', () => {
    const onChange = vi.fn();
    renderUI(
      <Tabs
        value="info"
        onChange={onChange}
        items={[
          { id: 'info', label: 'Maʼlumot' },
          { id: 'visits', label: 'Vizitlar' },
        ]}
      />,
    );
    expect(screen.getByText('Maʼlumot')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Vizitlar'));
    expect(onChange).toHaveBeenCalledWith('visits');
  });

  it('string items qabul qiladi', () => {
    renderUI(<Tabs value="Kun" items={['Kun', 'Hafta']} variant="pill" />);
    expect(screen.getByText('Hafta')).toBeInTheDocument();
  });
});
