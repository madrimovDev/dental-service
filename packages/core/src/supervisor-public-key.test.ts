import { describe, expect, it } from 'bun:test';
import { SUPERVISOR_PUBLIC_KEY_PEM } from './supervisor-public-key';

describe('SUPERVISOR_PUBLIC_KEY_PEM', () => {
  it('is exported as a non-empty string', () => {
    expect(typeof SUPERVISOR_PUBLIC_KEY_PEM).toBe('string');
    expect(SUPERVISOR_PUBLIC_KEY_PEM.length).toBeGreaterThan(0);
  });
});
