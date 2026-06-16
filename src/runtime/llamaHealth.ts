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

  const childExit = options?.child ? waitForChildExit(options.child) : undefined;

  while (Date.now() < deadline) {
    throwIfCancelled();
    try {
      const healthCheck = fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const response = childExit ? await Promise.race([healthCheck, childExit]) : await healthCheck;
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("llama-server exited before")) {
        throw error;
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
    throwIfCancelled();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`llama-server did not become healthy: ${lastError}`);
}

function waitForChildExit(child: childProcess.ChildProcess): Promise<never> {
  if (child.exitCode !== null || child.signalCode) {
    return Promise.reject(
      new Error(
        `llama-server exited before becoming healthy: code=${child.exitCode ?? "none"} signal=${child.signalCode ?? "none"}`
      )
    );
  }
  return new Promise((_, reject) => {
    child.once("exit", (code, signal) => {
      reject(
        new Error(
          `llama-server exited before becoming healthy: code=${code ?? "none"} signal=${signal ?? "none"}`
        )
      );
    });
  });
}
