import type { InstalledModel } from "../types";

export function canReuseInstalledModel(installed: InstalledModel | undefined, actualSizeBytes: number | undefined): installed is InstalledModel {
  if (!installed || actualSizeBytes === undefined) {
    return false;
  }
  return installed.sizeBytes === undefined || installed.sizeBytes === actualSizeBytes;
}

export function canReuseInstalledModelForDefault(
  installed: InstalledModel | undefined,
  actualSizeBytes: number | undefined,
  defaultRepo: string
): installed is InstalledModel {
  return canReuseInstalledModel(installed, actualSizeBytes) && installed.repoId === defaultRepo;
}
