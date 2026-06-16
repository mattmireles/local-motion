import * as vscode from "vscode";
import type { InstalledModel, LastPreparedCursorSetup } from "./types";

const INSTALLED_MODEL_KEY = "localMotion.installedModel";
const LAST_PREPARED_CURSOR_SETUP_KEY = "localMotion.lastPreparedCursorSetup";

export class LocalMotionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  installedModel(): InstalledModel | undefined {
    return this.context.globalState.get<InstalledModel>(INSTALLED_MODEL_KEY);
  }

  async setInstalledModel(model: InstalledModel): Promise<void> {
    await this.context.globalState.update(INSTALLED_MODEL_KEY, model);
  }

  lastPreparedCursorSetup(): LastPreparedCursorSetup | undefined {
    return this.context.globalState.get<LastPreparedCursorSetup>(LAST_PREPARED_CURSOR_SETUP_KEY);
  }

  async setLastPreparedCursorSetup(setup: LastPreparedCursorSetup): Promise<void> {
    await this.context.globalState.update(LAST_PREPARED_CURSOR_SETUP_KEY, setup);
  }
}
