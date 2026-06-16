export interface SetupOnboardingInput {
  enabled: boolean;
  alreadyOpened: boolean;
  hasInstalledModel: boolean;
}

export interface AutomagicalResumeInput {
  enabled: boolean;
  setupCompleted: boolean;
  hasInstalledModel: boolean;
  runtimeRunning: boolean;
}

export function shouldOpenSetupOnboarding(input: SetupOnboardingInput): boolean {
  return input.enabled && !input.alreadyOpened && !input.hasInstalledModel;
}

export function shouldResumeAutomagicalSetup(input: AutomagicalResumeInput): boolean {
  return input.enabled && input.setupCompleted && input.hasInstalledModel && !input.runtimeRunning;
}
