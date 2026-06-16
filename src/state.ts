import * as vscode from "vscode";
import type { InstalledModel } from "./types";

const INSTALLED_MODEL_KEY = "localMotion.installedModel";

export class LocalMotionState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  installedModel(): InstalledModel | undefined {
    return this.context.globalState.get<InstalledModel>(INSTALLED_MODEL_KEY);
  }

  async setInstalledModel(model: InstalledModel): Promise<void> {
    await this.context.globalState.update(INSTALLED_MODEL_KEY, model);
  }
}
