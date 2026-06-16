export type AutomagicalSetupStartMode = "explicit" | "startupResume";

export function allowLlamaInstallForAutomagicalStart(mode: AutomagicalSetupStartMode): boolean {
  return mode === "explicit";
}

export function shouldPostInitialQuantizations(input: { setupOperationActive: boolean }): boolean {
  return !input.setupOperationActive;
}
