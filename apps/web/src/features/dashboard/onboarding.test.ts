import { describe, expect, it } from 'vitest';
import { buildOnboardingSteps, isOnboardingComplete } from './onboarding';

const t = (k: string) => k;

describe('onboarding steps', () => {
  it('hammasi bor → complete', () => {
    const steps = buildOnboardingSteps({ t, branches: 2, services: 5, staff: 3 });
    expect(isOnboardingComplete(steps)).toBe(true);
  });
  it("xizmat yo'q → done emas", () => {
    const steps = buildOnboardingSteps({ t, branches: 1, services: 0, staff: 1 });
    expect(steps.find((s) => s.id === 'services')?.done).toBe(false);
    expect(isOnboardingComplete(steps)).toBe(false);
  });
});
