import type { AutomagicalSetupCompletion, InstalledModel } from "./types";

export interface SetupOnboardingInput {
  enabled: boolean;
  alreadyOpened: boolean;
  hasInstalledModel: boolean;
}

export interface AutomagicalResumeInput {
  enabled: boolean;
  hasCompletedSetupForInstalledModel: boolean;
  runtimeRunning: boolean;
}

export interface FirstStartupAutomagicalInput {
  enabled: boolean;
  alreadyOpened: boolean;
  hasInstalledModel: boolean;
  runtimeRunning: boolean;
}

export function shouldOpenSetupOnboarding(input: SetupOnboardingInput): boolean {
  return input.enabled && !input.alreadyOpened && !input.hasInstalledModel;
}

export function shouldResumeAutomagicalSetup(input: AutomagicalResumeInput): boolean {
  return input.enabled && input.hasCompletedSetupForInstalledModel && !input.runtimeRunning;
}

export function shouldRunFirstStartupAutomagicalSetup(input: FirstStartupAutomagicalInput): boolean {
  return input.enabled && !input.alreadyOpened && !input.hasInstalledModel && !input.runtimeRunning;
}

export function hasCompletedAutomagicalSetupForInstalledModel(
  installed: InstalledModel | undefined,
  completion: AutomagicalSetupCompletion | undefined
): boolean {
  return installed !== undefined &&
    completion !== undefined &&
    completion.modelId === installed.modelId &&
    completion.endpointVerifiedAt.length > 0 &&
    completion.cursorSetupCopiedAt.length > 0;
}
