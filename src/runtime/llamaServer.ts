import * as childProcess from "node:child_process";
import * as dns from "node:dns/promises";
import * as fs from "node:fs";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { fitContextTokens, MINIMUM_USABLE_CONTEXT_TOKENS } from "../models/compatibility";
import { isAppleSiliconHost, modelMemoryBudgetBytes } from "../system/machineProfile";
import { LOCAL_MOTION_MODEL_ID, type CursorTunnelStatus, type InstalledModel, type RuntimeSession, type RuntimeStatus } from "../types";
import { findCloudflared, startQuickTunnel, type CloudflaredTunnel } from "./cloudflaredTunnel";
import { waitForHealth } from "./llamaHealth";
import { attachRuntimeChildExitHandler } from "./runtimeChildExit";
import { CANCELLED_START_MESSAGE, isStartStale } from "./runtimeGuards";
import { OpenAiProxy } from "./openAiProxy";
import { releasePortHolder, reserveLocalhostPort } from "./ports";

const execFile = promisify(childProcess.execFile);

export interface CursorTunnelConfig {
  enabled: boolean;
  manualUrl?: string;
  manualUrlInvalid?: boolean;
}

// Fresh trycloudflare hostnames can take up to ~90 seconds to propagate
// through public DNS (observed during the Phase 2 spike for Plan 002). The
// wait presents as "Preparing the Cursor endpoint…" in the setup panel, so a
// long window here trades silent failure for visible patience.
const TUNNEL_DNS_TIMEOUT_MS = 90_000;

/**
 * The `localMotion.contextTokens` ceiling, clamped to the bounds declared in
 * package.json. settings.json is not schema-enforced: a hand-edited 0 would
 * reach llama-server as `-c 0` ("use the model's full native context") with
 * an unbudgeted KV allocation, and negative or NaN values would refuse to
 * start.
 */
export function contextTokensCap(): number {
  const raw = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 131072);
  return Number.isFinite(raw) ? Math.min(131072, Math.max(2048, Math.floor(raw))) : 131072;
}

/**
 * The `localMotion.parallelRequests` setting clamped to its declared bounds,
 * for the same hand-edited-settings.json reason as {@link contextTokensCap}.
 * llama-server splits `-c` evenly across these slots, so the provider divides
 * by the same value when advertising per-request capacity. Default is 1:
 * Cursor sends chats serially, and a second slot would silently halve every
 * request's context window; extra requests queue instead.
 */
export function parallelRequestsSetting(): number {
  const raw = vscode.workspace.getConfiguration("localMotion").get<number>("parallelRequests", 1);
  return Number.isFinite(raw) ? Math.min(8, Math.max(1, Math.floor(raw))) : 1;
}

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

  /**
   * `requestedEpoch` is the {@link stopEpoch} the caller captured at its
   * decision point. A stop landing anywhere between that decision and the
   * spawn — a resolver PATH probe, a first-time brew install, the queue
   * wait — makes this start stale and it aborts as cancelled, instead of
   * capturing a fresh generation here and reversing the user's stop.
   * Omitted, the epoch is captured at entry (the decision IS the call).
   */
  async start(
    model: InstalledModel,
    llamaServerPath: string | (() => Promise<string>),
    token?: vscode.CancellationToken,
    tunnelConfig?: CursorTunnelConfig,
    requestedEpoch?: number
  ): Promise<RuntimeSession> {
    const requestedGeneration = requestedEpoch ?? this.sessionGeneration;
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
    llamaServerPath: string | (() => Promise<string>),
    token: vscode.CancellationToken | undefined,
    requestedGeneration: number,
    tunnelConfig: CursorTunnelConfig | undefined
  ): Promise<RuntimeSession> {
    const startAbort = new AbortController();
    this.startAbort = startAbort;
    const abortIfNeeded = (): void => {
      if (isStartStale(requestedGeneration, this.sessionGeneration) || startAbort.signal.aborted || token?.isCancellationRequested) {
        throw new Error(CANCELLED_START_MESSAGE);
      }
    };

    try {
      // Staleness first, reuse second: a start queued behind a stop must
      // abort as cancelled, never hand back the session that stop is about
      // to tear down.
      abortIfNeeded();
      if (this.session?.modelPath === model.modelPath && this.child && this.session.baseUrl) {
        // A demanded tunnel the running session lacks defeats reuse: Connect
        // Cursor heals a dead or missing tunnel by respawning, because the
        // tunnel child starts with the model. Keeping that respawn inside
        // this serialized start (instead of a caller-side stop-then-start)
        // means a Turn Off during the heal lands as a generation bump that
        // cancels it, rather than being silently reversed.
        //
        // Accepted trade (2026-07-02 external audit): a tunnel-only repair
        // costs a full model respawn. One start path and no separate tunnel
        // lifecycle is the simplicity this repo buys with that reload; a
        // config-invalid manual URL never reaches here (connectCursor
        // rejects it before touching the runtime).
        const tunnelSatisfied = !tunnelConfig?.enabled ||
          // An invalid configured manual URL must surface its error via a
          // respawn, never hide behind an old live tunnel.
          (!tunnelConfig.manualUrlInvalid &&
            Boolean(this.session.cursorTunnel?.enabled && this.session.cursorTunnel.url) &&
            // A demanded manual URL must be THE tunnel in use — reusing a
            // leftover quick-tunnel would copy an ephemeral URL the user
            // just configured away from.
            (!tunnelConfig.manualUrl || this.session.cursorTunnel?.url === tunnelConfig.manualUrl));
        if (tunnelSatisfied) {
          return this.session;
        }
      }

      abortIfNeeded();
      // The binary is resolved lazily, only once reuse is off the table: a
      // healthy reconnect (live session, satisfied tunnel) must not pay a
      // PATH probe or a first-time brew install, and the resolver now runs
      // inside this serialized start where a stop aborts it at the next
      // checkpoint instead of racing it.
      const resolvedServerPath = typeof llamaServerPath === "function" ? await llamaServerPath() : llamaServerPath;
      abortIfNeeded();
      await this.stopLocked();

      // The context fit lives where `-c` is written, so every start path —
      // setup panel, model switch, Connect Cursor
      // restart — gets the largest context the memory budget affords, capped
      // by the setting. Records persisted before this build carry whatever
      // context was fitted then; the value spawned here is the truth. When
      // the fit says even the floor won't fit (or the size is unknowable),
      // spawn at the floor anyway — llama-server is the final arbiter and
      // its load failure is caught and explained upstream. The floor never
      // exceeds the user's cap.
      const cap = contextTokensCap();
      const floorTokens = Math.min(cap, MINIMUM_USABLE_CONTEXT_TOKENS);
      const sizeBytes = model.sizeBytes ?? (await fs.promises.stat(model.modelPath).catch(() => undefined))?.size;
      const contextTokens = sizeBytes !== undefined
        ? fitContextTokens(sizeBytes, modelMemoryBudgetBytes(), isAppleSiliconHost(), cap) || floorTokens
        : floorTokens;

      const parallelRequests = parallelRequestsSetting();
      const portHolder = await reserveLocalhostPort();
      const port = portHolder.port;
      const upstreamBaseUrl = `http://127.0.0.1:${port}/v1`;
      const baseArgs = [
        "-m",
        model.modelPath,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "-c",
        String(contextTokens),
        "--parallel",
        String(parallelRequests),
        "-ngl",
        "99"
      ];
      // q8_0 KV cache halves context memory versus f16 with negligible
      // quality loss — on a 64GB Mac it is the difference between ~71k and
      // the full 131k context at Q8 weights. V-cache quantization requires
      // flash attention, so it is pinned on (Metal supports it) rather than
      // left to auto.
      const kvCacheArgs = ["-fa", "on", "-ctk", "q8_0", "-ctv", "q8_0"];

      await releasePortHolder(portHolder);

      const spawnAndAwaitHealth = async (args: string[]): Promise<void> => {
        abortIfNeeded();
        this.output.appendLine(`Starting llama-server: ${resolvedServerPath} ${args.join(" ")}`);
        const child = childProcess.spawn(resolvedServerPath, args, {
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
        await waitForHealth(port, 120_000, {
          token,
          child,
          abortSignal: startAbort.signal
        });
      };

      // The first inbound client request pushes a fresh status to the UI so
      // the connected state can flip the moment Cursor actually hits the proxy.
      const proxy = new OpenAiProxy({
        upstreamBaseUrl,
        modelId: LOCAL_MOTION_MODEL_ID,
        onClientRequest: () => this.onStatusChanged()
      });
      try {
        try {
          await spawnAndAwaitHealth([...baseArgs, ...kvCacheArgs]);
        } catch (error) {
          // llama-server builds older than ~Aug 2025 parse -fa as a bare
          // boolean and die on the trailing "on"; some models lack
          // flash-attention support entirely. Both present as an exit
          // before health ("llama-server failed …"), never as a slow-load
          // timeout — so that exact failure gets one retry on plain f16 KV
          // cache. Slower and hungrier, but honest, and the log says how to
          // get the fast path back.
          const exitedBeforeHealth = error instanceof Error && error.message.startsWith("llama-server failed");
          if (!exitedBeforeHealth) {
            throw error;
          }
          this.output.appendLine(
            "llama-server exited before becoming healthy with the quantized KV cache flags. Retrying without them — if this recurs, run 'brew upgrade llama.cpp' to restore the full context window."
          );
          await spawnAndAwaitHealth(baseArgs);
        }
        abortIfNeeded();
        const proxyBaseUrl = await proxy.start(configuredProxyPort());
        this.proxy = proxy;
        abortIfNeeded();
        const cursorTunnel = await this.startCursorTunnel(tunnelConfig, proxyBaseUrl, abortIfNeeded, startAbort.signal);
        // Last checkpoint before the session becomes visible: a stop that
        // landed during the proxy or tunnel phase must not publish a
        // session (and downstream success toasts) it is about to tear down.
        abortIfNeeded();
        const session: RuntimeSession = {
          ...model,
          modelId: LOCAL_MOTION_MODEL_ID,
          contextTokens,
          parallelRequests,
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

  /**
   * Monotonic count of explicit stop() calls. A crash does NOT bump it —
   * the child-exit handler clears state without touching the generation —
   * so a setup operation can distinguish "the user turned the agent off
   * while I downloaded" (abandon the final start) from "the old model died
   * on its own" (the user still wants the model they asked for).
   */
  stopEpoch(): number {
    return this.sessionGeneration;
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
    proxyBaseUrl: string,
    abortIfNeeded: () => void = () => undefined,
    abortSignal?: AbortSignal
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
    // cloudflared is a runtime dependency of the Cursor path, installed on
    // demand exactly like llama.cpp — the user clicked one button and should
    // never meet a missing-binary dead end.
    abortIfNeeded();
    const cloudflared = await findCloudflared() ?? await this.installCloudflared(abortSignal);
    // Turn Off is an interrupt even here: the tunnel phase runs after the
    // last health checkpoint and can otherwise pin stop() on the start
    // queue for the brew install plus up to 90s of DNS retries.
    abortIfNeeded();
    if (!cloudflared) {
      return { enabled: true, source: "managed", error: "binary-missing" };
    }
    try {
      const proxyPort = Number(new URL(proxyBaseUrl).port);
      const tunnel = await startQuickTunnel(cloudflared, proxyPort, {
        onExit: () => this.handleTunnelExit(tunnel),
        abortSignal
      });
      try {
        if (!await tunnelDnsResolves(tunnel.url, TUNNEL_DNS_TIMEOUT_MS, abortSignal)) {
          this.output.appendLine(`cloudflared tunnel hostname did not resolve: ${new URL(tunnel.url).hostname}`);
          await tunnel.stop();
          abortIfNeeded();
          return { enabled: true, source: "managed", error: "dns-unresolved" };
        }
        abortIfNeeded();
      } catch (error) {
        // A cancellation mid-DNS must not leak the tunnel child.
        await tunnel.stop();
        throw error;
      }
      this.tunnel = tunnel;
      return { enabled: true, source: "managed", url: tunnel.url };
    } catch (error) {
      if (error instanceof Error && error.message === CANCELLED_START_MESSAGE) {
        throw error;
      }
      this.output.appendLine(`cloudflared tunnel failed: ${error instanceof Error ? error.message : String(error)}`);
      return { enabled: true, source: "managed", error: "start-timeout" };
    }
  }

  private async installCloudflared(abortSignal?: AbortSignal): Promise<string | undefined> {
    const brew = await commandPath("brew");
    if (!brew) {
      return undefined;
    }
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing the Cursor connection helper (cloudflared)",
          cancellable: false
        },
        async () => {
          this.output.appendLine("cloudflared not found. Running brew install cloudflared.");
          // The abort signal reaches the brew child itself, so Free Memory
          // during a first-time install kills it instead of waiting behind
          // it; the caller's abortIfNeeded then reports the cancellation.
          await execFile(brew, ["install", "cloudflared"], { timeout: 10 * 60 * 1000, signal: abortSignal });
        }
      );
    } catch (error) {
      this.output.appendLine(`brew install cloudflared failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    return findCloudflared();
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

async function commandPath(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile("/usr/bin/which", [command]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function configuredProxyPort(): number {
  return vscode.workspace.getConfiguration("localMotion").get<number>("proxyPort", 41434);
}

async function tunnelDnsResolves(url: string, timeoutMs = TUNNEL_DNS_TIMEOUT_MS, abortSignal?: AbortSignal): Promise<boolean> {
  const hostname = new URL(url).hostname;
  const deadline = Date.now() + timeoutMs;
  do {
    // Checked at the TOP of each tick: a stop that landed during the
    // previous lookup or delay exits before another lookup is issued.
    // (A single in-flight dns.lookup cannot be interrupted — Node's
    // resolver takes no signal — so the residue is one OS resolver
    // timeout, not the rest of the 90s window.)
    if (abortSignal?.aborted) {
      return false;
    }
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
