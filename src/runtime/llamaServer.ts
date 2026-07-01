import * as childProcess from "node:child_process";
import * as dns from "node:dns/promises";
import * as vscode from "vscode";
import { LOCAL_MOTION_MODEL_ID, type CursorTunnelStatus, type InstalledModel, type RuntimeSession, type RuntimeStatus } from "../types";
import { findCloudflared, startQuickTunnel, type CloudflaredTunnel } from "./cloudflaredTunnel";
import { waitForHealth } from "./llamaHealth";
import { attachRuntimeChildExitHandler } from "./runtimeChildExit";
import { isStartStale } from "./runtimeGuards";
import { OpenAiProxy } from "./openAiProxy";
import { releasePortHolder, reserveLocalhostPort } from "./ports";

export interface CursorTunnelConfig {
  enabled: boolean;
  manualUrl?: string;
  manualUrlInvalid?: boolean;
}

const TUNNEL_DNS_TIMEOUT_MS = 10_000;

export class LlamaServerManager {
  private child: childProcess.ChildProcess | undefined;
  private session: RuntimeSession | undefined;
  private proxy: OpenAiProxy | undefined;
  private tunnel: CloudflaredTunnel | undefined;
  // Serialize starts so concurrent callers cannot double-spawn llama-server.
  private startQueue: Promise<void> = Promise.resolve();
  private startAbort: AbortController | undefined;
  private sessionGeneration = 0;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly onStatusChanged: () => void = () => undefined,
    private readonly defaultTunnelConfig: () => CursorTunnelConfig | undefined = () => undefined
  ) {}

  status(): RuntimeStatus {
    if (!this.child || !this.session?.baseUrl) {
      return { running: false, message: "No local model is running." };
    }
    return {
      running: true,
      baseUrl: this.session.baseUrl,
      port: this.session.port,
      modelId: this.session.modelId,
      apiKey: this.session.apiKey,
      cursorTunnel: this.session.cursorTunnel,
      message: `${this.session.displayName} is running.`,
      clientObserved: this.proxy?.hasServedClientRequest() ?? false
    };
  }

  activeSession(): RuntimeSession | undefined {
    return this.session;
  }

  async start(
    model: InstalledModel,
    llamaServerPath: string,
    token?: vscode.CancellationToken,
    tunnelConfig?: CursorTunnelConfig
  ): Promise<RuntimeSession> {
    const requestedGeneration = this.sessionGeneration;
    let release!: () => void;
    const previous = this.startQueue;
    const effectiveTunnelConfig = tunnelConfig ?? this.defaultTunnelConfig();
    this.startQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.startLocked(model, llamaServerPath, token, requestedGeneration, effectiveTunnelConfig);
    } finally {
      release();
    }
  }

  private async startLocked(
    model: InstalledModel,
    llamaServerPath: string,
    token: vscode.CancellationToken | undefined,
    requestedGeneration: number,
    tunnelConfig: CursorTunnelConfig | undefined
  ): Promise<RuntimeSession> {
    const startAbort = new AbortController();
    this.startAbort = startAbort;
    const abortIfNeeded = (): void => {
      if (isStartStale(requestedGeneration, this.sessionGeneration) || startAbort.signal.aborted || token?.isCancellationRequested) {
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
      attachRuntimeChildExitHandler(child, {
        appendLine: (line) => this.output.appendLine(line),
        isCurrentChild: (candidate) => this.child === candidate,
        clearChild: () => {
          this.child = undefined;
        },
        clearSession: () => {
          this.session = undefined;
        },
        stopTunnel: () => this.stopTunnel(),
        stopProxy: () => this.proxy?.stop(),
        clearProxy: () => {
          this.proxy = undefined;
        },
        onStatusChanged: () => this.onStatusChanged()
      });
      child.once("error", (error) => {
        this.output.appendLine(`llama-server failed to spawn: ${error.message}`);
      });

      // The first inbound client request pushes a fresh status to the UI so
      // the connected state can flip the moment Cursor actually hits the proxy.
      const proxy = new OpenAiProxy({
        upstreamBaseUrl,
        modelId: LOCAL_MOTION_MODEL_ID,
        onClientRequest: () => this.onStatusChanged()
      });
      try {
        abortIfNeeded();
        await waitForHealth(port, 120_000, {
          token,
          child,
          abortSignal: startAbort.signal
        });
        abortIfNeeded();
        const proxyBaseUrl = await proxy.start(configuredProxyPort());
        this.proxy = proxy;
        const cursorTunnel = await this.startCursorTunnel(tunnelConfig, proxyBaseUrl);
        const session: RuntimeSession = {
          ...model,
          modelId: LOCAL_MOTION_MODEL_ID,
          port,
          baseUrl: proxyBaseUrl,
          upstreamBaseUrl,
          apiKey: proxy.apiKey(),
          cursorTunnel
        };
        this.session = session;
        this.onStatusChanged();
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
    this.sessionGeneration += 1;
    this.startAbort?.abort();
    await this.startQueue;
    await this.stopLocked();
  }

  private async stopLocked(): Promise<void> {
    const wasRunning = this.child !== undefined || this.session !== undefined || this.proxy !== undefined || this.tunnel !== undefined;
    const tunnelStop = this.stopTunnel();
    const proxyStop = this.proxy?.stop();
    this.proxy = undefined;
    const child = this.child;
    this.child = undefined;
    this.session = undefined;
    if (!child) {
      await tunnelStop;
      await proxyStop;
      if (wasRunning) {
        this.onStatusChanged();
      }
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
    await tunnelStop;
    await proxyStop;
    if (wasRunning) {
      this.onStatusChanged();
    }
  }

  private async startCursorTunnel(
    config: CursorTunnelConfig | undefined,
    proxyBaseUrl: string
  ): Promise<CursorTunnelStatus | undefined> {
    if (!config?.enabled) {
      return { enabled: false };
    }
    if (config.manualUrlInvalid) {
      return { enabled: true, source: "manual", error: "invalid-url" };
    }
    if (config.manualUrl) {
      return { enabled: true, source: "manual", url: config.manualUrl };
    }
    const cloudflared = await findCloudflared();
    if (!cloudflared) {
      return { enabled: true, source: "managed", error: "binary-missing" };
    }
    try {
      const proxyPort = Number(new URL(proxyBaseUrl).port);
      const tunnel = await startQuickTunnel(cloudflared, proxyPort, {
        onExit: () => this.handleTunnelExit(tunnel)
      });
      if (!await tunnelDnsResolves(tunnel.url)) {
        this.output.appendLine(`cloudflared tunnel hostname did not resolve: ${new URL(tunnel.url).hostname}`);
        await tunnel.stop();
        return { enabled: true, source: "managed", error: "dns-unresolved" };
      }
      this.tunnel = tunnel;
      return { enabled: true, source: "managed", url: tunnel.url };
    } catch (error) {
      this.output.appendLine(`cloudflared tunnel failed: ${error instanceof Error ? error.message : String(error)}`);
      return { enabled: true, source: "managed", error: "start-timeout" };
    }
  }

  private handleTunnelExit(tunnel: CloudflaredTunnel): void {
    if (this.tunnel !== tunnel) {
      return;
    }
    this.tunnel = undefined;
    if (this.session?.cursorTunnel?.enabled) {
      this.session.cursorTunnel = { enabled: true, source: "managed", error: "exited" };
    }
    this.onStatusChanged();
  }

  private async stopTunnel(): Promise<void> {
    const tunnel = this.tunnel;
    this.tunnel = undefined;
    await tunnel?.stop();
  }
}

function configuredProxyPort(): number {
  return vscode.workspace.getConfiguration("localMotion").get<number>("proxyPort", 41434);
}

async function tunnelDnsResolves(url: string, timeoutMs = TUNNEL_DNS_TIMEOUT_MS): Promise<boolean> {
  const hostname = new URL(url).hostname;
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      await dns.lookup(hostname);
      return true;
    } catch {
      await delay(500);
    }
  } while (Date.now() < deadline);
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
