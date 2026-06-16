import type * as childProcess from "node:child_process";

export async function waitForHealth(
  port: number,
  timeoutMs: number,
  options?: {
    token?: { isCancellationRequested: boolean };
    child?: childProcess.ChildProcess;
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";

  const throwIfCancelled = (): void => {
    if (options?.token?.isCancellationRequested) {
      throw new Error("Local model startup was cancelled.");
    }
    if (options?.abortSignal?.aborted) {
      throw new Error("Local model startup was cancelled.");
    }
  };

  const childFailure = options?.child ? waitForChildFailure(options.child) : undefined;

  while (Date.now() < deadline) {
    throwIfCancelled();
    try {
      const healthCheck = fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const response = childFailure ? await Promise.race([healthCheck, childFailure]) : await healthCheck;
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("llama-server")) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
    throwIfCancelled();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`llama-server did not become healthy: ${lastError}`);
}

export function childFailureMessage(code: number | null, signal: NodeJS.Signals | null): string {
  return `llama-server failed before becoming healthy: code=${code ?? "none"} signal=${signal ?? "none"}`;
}

export function waitForChildFailure(child: childProcess.ChildProcess): Promise<never> {
  if (child.exitCode !== null || child.signalCode) {
    return Promise.reject(new Error(childFailureMessage(child.exitCode, child.signalCode)));
  }

  return new Promise((_, reject) => {
    let settled = false;
    const fail = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(childFailureMessage(code, signal)));
    };
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`llama-server failed to spawn: ${error.message}`));
    });
    child.once("exit", fail);
    child.once("close", fail);
  });
}
