import * as vscode from "vscode";
import { isAutomagicalSetupCompletion, isLastCopiedCursorSetup } from "./stateValidation";
import type { AutomagicalSetupCompletion, InstalledModel, LastCopiedCursorSetup } from "./types";

const INSTALLED_MODEL_KEY = "localMotion.installedModel";
const LAST_COPIED_CURSOR_SETUP_KEY = "localMotion.lastCopiedCursorSetup";
const SETUP_ONBOARDING_OPENED_KEY = "localMotion.setupOnboardingOpened";
const AUTOMAGICAL_SETUP_COMPLETED_KEY = "localMotion.automagicalSetupCompleted";

export class LocalMotionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  installedModel(): InstalledModel | undefined {
    return this.context.globalState.get<InstalledModel>(INSTALLED_MODEL_KEY);
  }

  async setInstalledModel(model: InstalledModel): Promise<void> {
    await this.context.globalState.update(INSTALLED_MODEL_KEY, model);
  }

  async clearInstalledModelIfPath(modelPath: string): Promise<InstalledModel | undefined> {
    const installed = this.installedModel();
    if (installed?.modelPath !== modelPath) {
      return undefined;
    }
    await this.context.globalState.update(INSTALLED_MODEL_KEY, undefined);
    return installed;
  }

  lastCopiedCursorSetup(): LastCopiedCursorSetup | undefined {
    const setup = this.context.globalState.get<unknown>(LAST_COPIED_CURSOR_SETUP_KEY);
    return isLastCopiedCursorSetup(setup) ? setup : undefined;
  }

  async setLastCopiedCursorSetup(setup: LastCopiedCursorSetup): Promise<void> {
    await this.context.globalState.update(LAST_COPIED_CURSOR_SETUP_KEY, setup);
  }

  setupOnboardingOpened(): boolean {
    return this.context.globalState.get<boolean>(SETUP_ONBOARDING_OPENED_KEY, false);
  }

  async markSetupOnboardingOpened(): Promise<void> {
    await this.context.globalState.update(SETUP_ONBOARDING_OPENED_KEY, true);
  }

  automagicalSetupCompletion(): AutomagicalSetupCompletion | undefined {
    const completion = this.context.globalState.get<unknown>(AUTOMAGICAL_SETUP_COMPLETED_KEY);
    return isAutomagicalSetupCompletion(completion) ? completion : undefined;
  }

  async markAutomagicalSetupCompleted(completion: AutomagicalSetupCompletion): Promise<void> {
    await this.context.globalState.update(AUTOMAGICAL_SETUP_COMPLETED_KEY, completion);
  }

  async clearAutomagicalSetupCompletionIfModel(modelId: string): Promise<void> {
    if (this.automagicalSetupCompletion()?.modelId !== modelId) {
      return;
    }
    await this.context.globalState.update(AUTOMAGICAL_SETUP_COMPLETED_KEY, undefined);
  }
}
