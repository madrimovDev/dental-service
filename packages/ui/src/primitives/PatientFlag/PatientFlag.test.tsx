import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { PatientFlag } from './PatientFlag';

describe('PatientFlag', () => {
  it.each([
    'critical',
    'attention',
    'neutral',
    'info',
  ] as const)("'%s' darajasi yorliq matni va data-level bilan chiqadi", (level) => {
    renderUI(<PatientFlag level={level}>Allergiya {level}</PatientFlag>);
    const el = screen.getByText(`Allergiya ${level}`).closest('[data-level]');
    expect(el?.getAttribute('data-level')).toBe(level);
  });

  it("standart daraja 'neutral'", () => {
    renderUI(<PatientFlag>Telegram ulangan</PatientFlag>);
    expect(
      screen.getByText('Telegram ulangan').closest('[data-level]')?.getAttribute('data-level'),
    ).toBe('neutral');
  });
});
