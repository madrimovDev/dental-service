import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { Select } from './Select';

describe('Select', () => {
  it('label va placeholder bilan render qiladi', () => {
    renderUI(
      <Select
        label="Doktor"
        placeholder="Tanlang"
        data={[
          { value: 'd1', label: 'Dr. Ali' },
          { value: 'd2', label: 'Dr. Vali' },
        ]}
      />,
    );
    expect(screen.getByText('Doktor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tanlang')).toBeInTheDocument();
  });
});
