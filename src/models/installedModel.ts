import type { InstalledModel } from "../types";

export function canReuseInstalledModel(installed: InstalledModel | undefined, actualSizeBytes: number | undefined): installed is InstalledModel {
  if (!installed || actualSizeBytes === undefined) {
    return false;
  }
  return installed.sizeBytes === undefined || installed.sizeBytes === actualSizeBytes;
}
