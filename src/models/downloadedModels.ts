import * as fs from "node:fs";
import * as path from "node:path";
import type { DownloadedModelEntry, InstalledModel, RuntimeSession } from "../types";

export interface DownloadedModelsSummary {
  models: DownloadedModelEntry[];
  totalSizeBytes: number;
}

export async function listDownloadedModels(
  modelsRoot: string,
  input: {
    installed?: InstalledModel;
    active?: RuntimeSession;
  } = {}
): Promise<DownloadedModelsSummary> {
  const files = await listModelFiles(modelsRoot);
  const installedPath = input.installed ? path.resolve(input.installed.modelPath) : undefined;
  const activePath = input.active ? path.resolve(input.active.modelPath) : undefined;
  const models = await Promise.all(files.map(async (modelPath) => {
    const stat = await fs.promises.stat(modelPath);
    const fileName = path.basename(modelPath);
    const resolvedPath = path.resolve(modelPath);
    return {
      id: toModelId(modelsRoot, modelPath),
      fileName,
      sizeBytes: stat.size,
      partial: /\.gguf\.part$/i.test(fileName),
      active: activePath === resolvedPath,
      installed: installedPath === resolvedPath
    };
  }));

  models.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    if (a.installed !== b.installed) {
      return a.installed ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    models,
    totalSizeBytes: models.reduce((total, model) => total + model.sizeBytes, 0)
  };
}

export async function deleteDownloadedModel(modelsRoot: string, id: string): Promise<string> {
  const modelPath = resolveDownloadedModelId(modelsRoot, id);
  await assertRealPathInsideModelsRoot(modelsRoot, modelPath);
  await fs.promises.unlink(modelPath);
  await removeParentIfEmpty(modelsRoot, path.dirname(modelPath));
  return modelPath;
}

export function resolveDownloadedModelId(modelsRoot: string, id: string): string {
  if (!id || path.isAbsolute(id)) {
    throw new Error("Invalid downloaded model id.");
  }

  const root = path.resolve(modelsRoot);
  const modelPath = path.resolve(root, id);
  if (modelPath !== root && !modelPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Downloaded model id must stay inside Local Motion model storage.");
  }
  if (!/\.gguf(?:\.part)?$/i.test(path.basename(modelPath))) {
    throw new Error("Downloaded model id must point to a GGUF file.");
  }
  return modelPath;
}

async function assertRealPathInsideModelsRoot(modelsRoot: string, modelPath: string): Promise<void> {
  const root = await fs.promises.realpath(modelsRoot);
  const relativeParent = path.relative(path.resolve(modelsRoot), path.dirname(modelPath));
  let current = root;
  for (const part of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.promises.lstat(current);
    if (stat.isSymbolicLink()) {
      throw new Error("Downloaded model path must not include symlinked directories.");
    }
    if (!stat.isDirectory()) {
      throw new Error("Downloaded model parent path is not a directory.");
    }
  }

  const realParent = await fs.promises.realpath(path.dirname(modelPath));
  if (realParent !== root && !realParent.startsWith(`${root}${path.sep}`)) {
    throw new Error("Downloaded model path must stay inside Local Motion model storage.");
  }
}

async function listModelFiles(modelsRoot: string): Promise<string[]> {
  try {
    const stat = await fs.promises.stat(modelsRoot);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const found: string[] = [];
  await walk(modelsRoot, found);
  return found.filter((modelPath) => /\.gguf(?:\.part)?$/i.test(path.basename(modelPath)));
}

async function walk(directory: string, found: string[]): Promise<void> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, found);
      continue;
    }
    if (entry.isFile()) {
      found.push(entryPath);
    }
  }
}

function toModelId(modelsRoot: string, modelPath: string): string {
  return path.relative(path.resolve(modelsRoot), path.resolve(modelPath));
}

async function removeParentIfEmpty(modelsRoot: string, directory: string): Promise<void> {
  const root = path.resolve(modelsRoot);
  const target = path.resolve(directory);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    return;
  }

  try {
    const entries = await fs.promises.readdir(target);
    if (entries.length > 0) {
      return;
    }
    await fs.promises.rmdir(target);
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOTEMPTY" || error.code === "ENOENT")) {
      return;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
