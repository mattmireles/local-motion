import * as childProcess from "node:child_process";
import * as vscode from "vscode";
import type { InstalledModel, RuntimeSession, RuntimeStatus } from "../types";
import { OpenAiProxy } from "./openAiProxy";
import { findFreePort } from "./ports";

export class LlamaServerManager {
  private child: childProcess.ChildProcess | undefined;
  private session: RuntimeSession | undefined;
  private proxy: OpenAiProxy | undefined;
  private startQueue: Promise<void> = Promise.resolve();

  constructor(private readonly output: vscode.OutputChannel) {}

  status(): RuntimeStatus {
    if (!this.child || !this.session?.baseUrl) {
      return { running: false, message: "No local model is running." };
    }
    return {
      running: true,
      baseUrl: this.session.baseUrl,
      port: this.session.port,
      modelId: this.session.modelId,
      message: `${this.session.displayName} is running.`
    };
  }

  activeSession(): RuntimeSession | undefined {
    return this.session;
  }

  async start(
    model: InstalledModel,
    llamaServerPath: string,
    token?: vscode.CancellationToken
  ): Promise<RuntimeSession> {
    let release!: () => void;
    const previous = this.startQueue;
    this.startQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.startLocked(model, llamaServerPath, token);
    } finally {
      release();
    }
  }

  private async startLocked(
    model: InstalledModel,
    llamaServerPath: string,
    token?: vscode.CancellationToken
  ): Promise<RuntimeSession> {
    if (this.session?.modelPath === model.modelPath && this.child && this.session.baseUrl) {
      return this.session;
    }

    throwIfCancelled(token);
    await this.stop();

    const port = await findFreePort();
    const upstreamBaseUrl = `http://127.0.0.1:${port}/v1`;
    const args = [
      "-m",
      model.modelPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "-c",
      String(model.contextTokens),
      "--parallel",
      String(vscode.workspace.getConfiguration("localMotion").get<number>("parallelRequests", 2)),
      "-ngl",
      "99"
    ];

    this.output.appendLine(`Starting llama-server: ${llamaServerPath} ${args.join(" ")}`);
    const child = childProcess.spawn(llamaServerPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false
    });
    this.child = child;

    child.stdout?.on("data", (chunk) => this.output.append(chunk.toString()));
    child.stderr?.on("data", (chunk) => this.output.append(chunk.toString()));
    child.on("exit", (code, signal) => {
      this.output.appendLine(`llama-server exited: code=${code ?? "none"} signal=${signal ?? "none"}`);
      if (this.child === child) {
        this.child = undefined;
        this.session = undefined;
        void this.proxy?.stop();
        this.proxy = undefined;
      }
    });
    child.once("error", (error) => {
      this.output.appendLine(`llama-server failed to spawn: ${error.message}`);
    });

    const proxy = new OpenAiProxy({ upstreamBaseUrl, modelId: model.modelId });
    try {
      await waitForHealth(port, 120_000, token);
      const baseUrl = await proxy.start();
      this.proxy = proxy;
      const session = { ...model, port, baseUrl };
      this.session = session;
      return session;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const proxyStop = this.proxy?.stop();
    this.proxy = undefined;
    const child = this.child;
    this.child = undefined;
    this.session = undefined;
    if (!child) {
      await proxyStop;
      return;
    }

    let exited = false;
    child.once("exit", () => {
      exited = true;
    });
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!exited) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await proxyStop;
  }
}

async function waitForHealth(port: number, timeoutMs: number, token?: vscode.CancellationToken): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    throwIfCancelled(token);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`llama-server did not become healthy: ${lastError}`);
}

function throwIfCancelled(token: vscode.CancellationToken | undefined): void {
  if (token?.isCancellationRequested) {
    throw new Error("Local model startup was cancelled.");
  }
}
