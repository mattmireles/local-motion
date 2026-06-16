import * as vscode from "vscode";
import type { InstalledModel, LastCopiedCursorSetup } from "./types";

const INSTALLED_MODEL_KEY = "localMotion.installedModel";
const LAST_COPIED_CURSOR_SETUP_KEY = "localMotion.lastCopiedCursorSetup";

export class LocalMotionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  installedModel(): InstalledModel | undefined {
    return this.context.globalState.get<InstalledModel>(INSTALLED_MODEL_KEY);
  }

  async setInstalledModel(model: InstalledModel): Promise<void> {
    await this.context.globalState.update(INSTALLED_MODEL_KEY, model);
  }

  lastCopiedCursorSetup(): LastCopiedCursorSetup | undefined {
    return this.context.globalState.get<LastCopiedCursorSetup>(LAST_COPIED_CURSOR_SETUP_KEY);
  }

  async setLastCopiedCursorSetup(setup: LastCopiedCursorSetup): Promise<void> {
    await this.context.globalState.update(LAST_COPIED_CURSOR_SETUP_KEY, setup);
  }
}
