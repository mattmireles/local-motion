export interface SetupOnboardingInput {
  enabled: boolean;
  alreadyOpened: boolean;
  hasInstalledModel: boolean;
}

export function shouldOpenSetupOnboarding(input: SetupOnboardingInput): boolean {
  return input.enabled && !input.alreadyOpened && !input.hasInstalledModel;
}
