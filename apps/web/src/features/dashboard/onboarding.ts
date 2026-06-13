export type OnboardingStep = {
  id: 'branches' | 'services' | 'staff';
  label: string;
  description: string;
  path: string;
  done: boolean;
};

export function buildOnboardingSteps(deps: {
  t: (k: string) => string;
  branches: number;
  services: number;
  staff: number;
}): OnboardingStep[] {
  const { t, branches, services, staff } = deps;
  return [
    {
      id: 'branches',
      label: t('onboarding.step.branches'),
      description: t('onboarding.step.branches_desc'),
      path: '/settings/branches',
      done: branches >= 1,
    },
    {
      id: 'services',
      label: t('onboarding.step.services'),
      description: t('onboarding.step.services_desc'),
      path: '/settings/services',
      done: services >= 1,
    },
    {
      id: 'staff',
      label: t('onboarding.step.staff'),
      description: t('onboarding.step.staff_desc'),
      path: '/settings/users',
      done: staff >= 1,
    },
  ];
}

export const isOnboardingComplete = (steps: OnboardingStep[]): boolean =>
  steps.every((s) => s.done);
