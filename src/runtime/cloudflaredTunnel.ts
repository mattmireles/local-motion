// Owns an opt-in cloudflared Quick Tunnel child process. Calling stop() is the
// kill switch for public proxy reachability; no VS Code APIs belong here.
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";

const execFile = promisify(childProcess.execFile);
const TRYCLOUDFLARE_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_KILL_TIMEOUT_MS = 1_000;
const OUTPUT_LIMIT = 8_000;

interface ChildLike {
  stdout?: NodeJS.EventEmitter | null;
  stderr?: NodeJS.EventEmitter | null;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
}

export interface CloudflaredTunnel {
  url: string;
  stop(): Promise<void>;
}

export interface CloudflaredTunnelExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

export interface StartQuickTunnelOptions {
  spawn?: (command: string, args: string[], options: childProcess.SpawnOptions) => ChildLike;
  startupTimeoutMs?: number;
  killTimeoutMs?: number;
  onExit?: (exit: CloudflaredTunnelExit) => void;
}

export interface FindCloudflaredOptions {
  commandPath?: (command: string) => Promise<string | undefined>;
  executableExists?: (targetPath: string) => Promise<boolean>;
}

export async function findCloudflared(options: FindCloudflaredOptions = {}): Promise<string | undefined> {
  const commandPath = options.commandPath ?? defaultCommandPath;
  const executableExists = options.executableExists ?? defaultExecutableExists;
  const candidates = [
    await commandPath("cloudflared"),
    "/opt/homebrew/bin/cloudflared",
    "/usr/local/bin/cloudflared"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (await executableExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function startQuickTunnel(
  binPath: string,
  port: number,
  options: StartQuickTunnelOptions = {}
): Promise<CloudflaredTunnel> {
  const spawn = options.spawn ?? childProcess.spawn;
  const child = spawn(binPath, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  let output = "";
  let settled = false;
  let stopping = false;

  return new Promise<CloudflaredTunnel>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      stopping = true;
      void stopChild(child, options.killTimeoutMs);
      reject(new Error(`cloudflared did not print a trycloudflare URL within ${options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS} ms. Output: ${output || "(none)"}`));
    }, options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS);

    const append = (chunk: unknown): void => {
      output = trimOutput(output + String(chunk));
      const match = output.match(TRYCLOUDFLARE_URL);
      if (!match || settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        url: match[0],
        stop: async () => {
          stopping = true;
          await stopChild(child, options.killTimeoutMs);
        }
      });
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`cloudflared exited before printing a trycloudflare URL: code=${code ?? "none"} signal=${signal ?? "none"}. Output: ${output || "(none)"}`));
        return;
      }
      if (!stopping) {
        options.onExit?.({ code, signal, output });
      }
    });
  });
}

async function defaultCommandPath(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile("/usr/bin/which", [command]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function defaultExecutableExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function stopChild(child: ChildLike, killTimeoutMs = DEFAULT_KILL_TIMEOUT_MS): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, killTimeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function trimOutput(value: string): string {
  return value.length <= OUTPUT_LIMIT ? value : value.slice(-OUTPUT_LIMIT);
}
