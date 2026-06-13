import { describe, expect, it } from 'vitest';
import { buildQuickActions } from './command-actions';

const t = (k: string) => k;
const noop = () => {};

describe('buildQuickActions', () => {
  it("permission yo'q bo'lsa amal tushadi", () => {
    const actions = buildQuickActions({ t, navigate: noop, has: () => false });
    expect(actions.find((a) => a.id === 'new-patient')).toBeUndefined();
  });
  it("permission bor bo'lsa amal qoladi", () => {
    const actions = buildQuickActions({ t, navigate: noop, has: (p) => p === 'patient.create' });
    expect(actions.find((a) => a.id === 'new-patient')).toBeDefined();
  });
});
