import * as childProcess from "node:child_process";
import * as vscode from "vscode";
import type { InstalledModel, RuntimeSession, RuntimeStatus } from "../types";
import { waitForHealth } from "./llamaHealth";
import { OpenAiProxy } from "./openAiProxy";
import { releasePortHolder, reserveLocalhostPort } from "./ports";

export class LlamaServerManager {
  private child: childProcess.ChildProcess | undefined;
  private session: RuntimeSession | undefined;
  private proxy: OpenAiProxy | undefined;
  // Serialize starts so concurrent callers cannot double-spawn llama-server.
  private startQueue: Promise<void> = Promise.resolve();
  private startAbort: AbortController | undefined;

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
    const startAbort = new AbortController();
    this.startAbort = startAbort;
    const abortIfNeeded = (): void => {
      if (startAbort.signal.aborted || token?.isCancellationRequested) {
        throw new Error("Local model startup was cancelled.");
      }
    };

    try {
      if (this.session?.modelPath === model.modelPath && this.child && this.session.baseUrl) {
        return this.session;
      }

      abortIfNeeded();
      await this.stopLocked();

      const portHolder = await reserveLocalhostPort();
      const port = portHolder.port;
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
      await releasePortHolder(portHolder);

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
        abortIfNeeded();
        await waitForHealth(port, 120_000, {
          token,
          child,
          abortSignal: startAbort.signal
        });
        abortIfNeeded();
        const proxyBaseUrl = await proxy.start();
        this.proxy = proxy;
        const session: RuntimeSession = {
          ...model,
          port,
          baseUrl: proxyBaseUrl,
          upstreamBaseUrl
        };
        this.session = session;
        return session;
      } catch (error) {
        await this.stopLocked();
        throw error;
      }
    } finally {
      if (this.startAbort === startAbort) {
        this.startAbort = undefined;
      }
    }
  }

  async stop(): Promise<void> {
    this.startAbort?.abort();
    await this.startQueue;
    await this.stopLocked();
  }

  private async stopLocked(): Promise<void> {
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
