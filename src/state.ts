import * as path from "node:path";
import * as vscode from "vscode";
import type { LocalModelOptionId } from "./models/defaultRepos";
import { isAutomagicalSetupCompletion, isInstalledModel, isLastCopiedCursorSetup, isModelSlots } from "./stateValidation";
import type { AutomagicalSetupCompletion, InstalledModel, LastCopiedCursorSetup } from "./types";

const INSTALLED_MODEL_KEY = "localMotion.installedModel";
const LAST_COPIED_CURSOR_SETUP_KEY = "localMotion.lastCopiedCursorSetup";
const SETUP_ONBOARDING_OPENED_KEY = "localMotion.setupOnboardingOpened";
const AUTOMAGICAL_SETUP_COMPLETED_KEY = "localMotion.automagicalSetupCompleted";
const MODEL_SLOTS_KEY = "localMotion.modelSlots";

export class LocalMotionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  installedModel(): InstalledModel | undefined {
    const model = this.context.globalState.get<unknown>(INSTALLED_MODEL_KEY);
    return isInstalledModel(model) ? model : undefined;
  }

  async setInstalledModel(model: InstalledModel): Promise<void> {
    await this.context.globalState.update(INSTALLED_MODEL_KEY, model);
  }

  async clearInstalledModelIfPath(modelPath: string): Promise<InstalledModel | undefined> {
    const installed = this.installedModel();
    if (!installed || path.resolve(installed.modelPath) !== path.resolve(modelPath)) {
      return undefined;
    }
    await this.context.globalState.update(INSTALLED_MODEL_KEY, undefined);
    return installed;
  }

  modelSlots(): Partial<Record<LocalModelOptionId, InstalledModel>> {
    const slots = this.context.globalState.get<unknown>(MODEL_SLOTS_KEY, {});
    return isModelSlots(slots) ? slots : {};
  }

  modelSlot(optionId: LocalModelOptionId): InstalledModel | undefined {
    return this.modelSlots()[optionId];
  }

  async setModelSlot(optionId: LocalModelOptionId, model: InstalledModel): Promise<void> {
    await this.context.globalState.update(MODEL_SLOTS_KEY, {
      ...this.modelSlots(),
      [optionId]: model
    });
  }

  async clearModelSlotIfPath(modelPath: string): Promise<void> {
    const slots = this.modelSlots();
    let changed = false;
    for (const [optionId, model] of Object.entries(slots) as Array<[LocalModelOptionId, InstalledModel]>) {
      if (path.resolve(model.modelPath) === path.resolve(modelPath)) {
        delete slots[optionId];
        changed = true;
      }
    }
    if (changed) {
      await this.context.globalState.update(MODEL_SLOTS_KEY, slots);
    }
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
