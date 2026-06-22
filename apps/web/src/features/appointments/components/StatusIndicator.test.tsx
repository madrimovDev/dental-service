import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppointmentStatus } from '../appointments.types';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator — 6 status (Dental OS spec §4)', () => {
  const cases: Array<[AppointmentStatus, string]> = [
    ['scheduled', 'ring'],
    ['confirmed', 'dot'],
    ['in_progress', 'dot'],
    ['completed', 'check'],
    ['no_show', 'dot'],
    ['cancelled', 'dot'],
  ];

  for (const [status, kind] of cases) {
    it(`${status} → ${kind}`, () => {
      const { container } = render(<StatusIndicator status={status} />);
      const root = container.querySelector('[data-status]');
      expect(root).not.toBeNull();
      expect(root?.getAttribute('data-status')).toBe(status);
      expect(root?.getAttribute('data-kind')).toBe(kind);
    });
  }

  it('completed renders a check svg, others render a dot span', () => {
    const { container: done } = render(<StatusIndicator status="completed" />);
    expect(done.querySelector('svg')).not.toBeNull();

    const { container: conf } = render(<StatusIndicator status="confirmed" />);
    expect(conf.querySelector('svg')).toBeNull();
    expect(conf.querySelector('span > span')).not.toBeNull();
  });
});
