export type AutomagicalSetupStartMode = "explicit" | "startupResume";

export function allowLlamaInstallForAutomagicalStart(mode: AutomagicalSetupStartMode): boolean {
  return mode === "explicit";
}
