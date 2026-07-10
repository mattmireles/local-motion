// Public reachability for managed Quick Tunnels.
//
// Why not dns.lookup / plain fetch?
// Some home routers return NXDOMAIN for fresh *.trycloudflare.com names while
// Cloudflare's own DNS-over-HTTPS already has the A record. Cursor's backend
// uses public DNS, so a local NXDOMAIN is a false negative — we used to kill
// a working tunnel after waiting on dig. Resolve via DoH, then HTTPS-probe
// the IP with SNI/Host set to the trycloudflare hostname.
import * as https from "node:https";
import { CANCELLED_START_MESSAGE } from "./runtimeGuards";

export const TUNNEL_REACHABILITY_TIMEOUT_MS = 90_000;
export const TUNNEL_REACHABILITY_ATTEMPTS = 3;
const PROBE_INTERVAL_MS = 1_500;
const DOH_ENDPOINTS = [
  (hostname: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
  (hostname: string) => `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`
] as const;

interface PublicDnsFetchDependencies {
  directFetch(input: string, init?: RequestInit): Promise<Response>;
  resolveIpv4(hostname: string, abortSignal?: AbortSignal): Promise<string | undefined>;
  fetchViaIp(url: URL, ip: string, init?: RequestInit): Promise<Response>;
}

/**
 * Fetch a public HTTPS URL even when the Mac's system resolver has cached a
 * false NXDOMAIN for a fresh Quick Tunnel. Cursor's backend uses public DNS,
 * so local router DNS must not block the final authenticated setup proof after
 * the same tunnel already passed the DoH reachability gate.
 */
export async function fetchWithPublicDnsFallback(
  input: string,
  init?: RequestInit,
  dependencies: PublicDnsFetchDependencies = {
    directFetch: (url, requestInit) => fetch(url, requestInit),
    resolveIpv4: resolveIpv4ViaDoh,
    fetchViaIp: fetchHttpsViaIp
  }
): Promise<Response> {
  try {
    return await dependencies.directFetch(input, init);
  } catch (directError) {
    if (init?.signal?.aborted) {
      throw directError;
    }
    const url = new URL(input);
    if (url.protocol !== "https:") {
      throw directError;
    }
    const ip = await dependencies.resolveIpv4(url.hostname, init?.signal ?? undefined);
    if (!ip) {
      throw directError;
    }
    return dependencies.fetchViaIp(url, ip, init);
  }
}

/** Pull the first A-record IP from a DNS-JSON (RFC 8427) response body. */
export function ipv4FromDohAnswer(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const answer = (payload as { Answer?: unknown }).Answer;
  if (!Array.isArray(answer)) {
    return undefined;
  }
  for (const record of answer) {
    if (!record || typeof record !== "object") {
      continue;
    }
    const typed = record as { type?: unknown; data?: unknown };
    if (typed.type === 1 && typeof typed.data === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(typed.data)) {
      return typed.data;
    }
  }
  return undefined;
}

/**
 * True when the public tunnel answers from the Local Motion origin.
 * Cloudflare edge-only responses (530/1033, 502) mean DNS is published but
 * the connector is not ready — keep waiting. Origin proof for this stack is
 * unauthenticated GET /health → 401 (bearer required) or 2xx.
 */
export async function tunnelHttpReachable(
  url: string,
  timeoutMs = TUNNEL_REACHABILITY_TIMEOUT_MS,
  abortSignal?: AbortSignal
): Promise<boolean> {
  const hostname = new URL(url).hostname;
  const path = "/health";
  const deadline = Date.now() + timeoutMs;
  let cachedIp: string | undefined;
  do {
    if (abortSignal?.aborted) {
      throw new Error(CANCELLED_START_MESSAGE);
    }
    if (!cachedIp) {
      cachedIp = await resolveIpv4ViaDoh(hostname, abortSignal);
    }
    if (cachedIp) {
      try {
        const status = await httpsGetStatus(hostname, cachedIp, path, abortSignal);
        if (isOriginHealthStatus(status)) {
          return true;
        }
      } catch {
        // IP published but edge/TLS not ready yet — keep probing the same IP.
      }
    } else {
      // Local DNS may already work (no router NXDOMAIN). Fall back to fetch.
      try {
        const probe = new AbortController();
        const onAbort = (): void => probe.abort();
        abortSignal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => probe.abort(), 4_000);
        try {
          const response = await fetch(`https://${hostname}${path}`, {
            method: "GET",
            signal: probe.signal,
            redirect: "manual"
          });
          void response.body?.cancel();
          if (isOriginHealthStatus(response.status)) {
            return true;
          }
        } finally {
          clearTimeout(timer);
          abortSignal?.removeEventListener("abort", onAbort);
        }
      } catch {
        // Still NXDOMAIN locally and DoH empty — keep waiting.
      }
    }
    await delay(PROBE_INTERVAL_MS, abortSignal);
  } while (Date.now() < deadline);
  return false;
}

/** Origin is serving /health; Cloudflare edge-only errors are not enough. */
export function isOriginHealthStatus(status: number): boolean {
  return status === 401 || (status >= 200 && status < 300);
}

async function resolveIpv4ViaDoh(hostname: string, abortSignal?: AbortSignal): Promise<string | undefined> {
  for (const build of DOH_ENDPOINTS) {
    if (abortSignal?.aborted) {
      throw new Error(CANCELLED_START_MESSAGE);
    }
    const probe = new AbortController();
    const onAbort = (): void => probe.abort();
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => probe.abort(), 4_000);
    try {
      const response = await fetch(build(hostname), {
        headers: { accept: "application/dns-json" },
        signal: probe.signal
      });
      if (!response.ok) {
        continue;
      }
      const ip = ipv4FromDohAnswer(await response.json());
      if (ip) {
        return ip;
      }
    } catch {
      // Try the next DoH provider.
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
    }
  }
  return undefined;
}

function httpsGetStatus(hostname: string, ip: string, path: string, abortSignal?: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error(CANCELLED_START_MESSAGE));
      return;
    }
    const req = https.get(
      {
        host: ip,
        servername: hostname,
        path,
        headers: { Host: hostname },
        timeout: 5_000
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }
    );
    const onAbort = (): void => {
      req.destroy(new Error(CANCELLED_START_MESSAGE));
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    req.on("error", (error) => {
      abortSignal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    req.on("timeout", () => {
      req.destroy();
      abortSignal?.removeEventListener("abort", onAbort);
      reject(new Error("tunnel HTTPS probe timed out"));
    });
    req.on("close", () => {
      abortSignal?.removeEventListener("abort", onAbort);
    });
  });
}

function fetchHttpsViaIp(url: URL, ip: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (init?.signal?.aborted) {
      reject(init.signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    headers.host = url.host;
    headers["accept-encoding"] = "identity";
    const request = https.request(
      {
        host: ip,
        port: url.port || 443,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: init?.method ?? "GET",
        headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.once("end", () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 500,
            statusText: response.statusMessage,
            headers: response.headers as HeadersInit
          }));
        });
      }
    );
    const onAbort = (): void => {
      request.destroy(init?.signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    };
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    request.once("error", reject);
    request.once("close", () => init?.signal?.removeEventListener("abort", onAbort));
    request.end();
  });
}

function delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error(CANCELLED_START_MESSAGE));
      return;
    }
    const timer = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error(CANCELLED_START_MESSAGE));
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface ManagedQuickTunnel {
  url: string;
  stop(): Promise<void>;
}

export interface ManagedQuickTunnelAttemptResult {
  url: string;
  tunnel: ManagedQuickTunnel;
}

/**
 * Spawn Quick Tunnels until one is origin-reachable, or exhaust attempts.
 * A cloudflared exit mid-probe aborts only that attempt and retries a fresh
 * hostname — it must not burn the full reachability window on a dead child.
 */
export async function probeManagedQuickTunnels(options: {
  attempts?: number;
  reachabilityTimeoutMs?: number;
  abortSignal?: AbortSignal;
  abortIfNeeded?: () => void;
  startTunnel: (hooks: {
    onExit: () => void;
    abortSignal?: AbortSignal;
  }) => Promise<ManagedQuickTunnel>;
  probe?: (url: string, timeoutMs: number, abortSignal: AbortSignal) => Promise<boolean>;
  /** Fires only after a successful probe when that live tunnel later exits. */
  onLiveTunnelExited?: (tunnel: ManagedQuickTunnel) => void;
  onAttemptFailed?: (info: {
    attempt: number;
    hostname: string;
    reason: "unreachable" | "exited";
  }) => void;
}): Promise<ManagedQuickTunnelAttemptResult | { error: "dns-unresolved" }> {
  const attempts = options.attempts ?? TUNNEL_REACHABILITY_ATTEMPTS;
  const reachabilityTimeoutMs = options.reachabilityTimeoutMs ?? TUNNEL_REACHABILITY_TIMEOUT_MS;
  const probe = options.probe ?? tunnelHttpReachable;
  const abortIfNeeded = options.abortIfNeeded ?? (() => undefined);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    abortIfNeeded();
    const attemptAbort = new AbortController();
    const onParentAbort = (): void => attemptAbort.abort();
    options.abortSignal?.addEventListener("abort", onParentAbort, { once: true });
    let tunnelDied = false;
    let wonAttempt = false;
    let tunnel: ManagedQuickTunnel;
    try {
      tunnel = await options.startTunnel({
        onExit: () => {
          if (wonAttempt) {
            options.onLiveTunnelExited?.(tunnel);
            return;
          }
          tunnelDied = true;
          attemptAbort.abort();
        },
        abortSignal: options.abortSignal
      });
    } catch (error) {
      options.abortSignal?.removeEventListener("abort", onParentAbort);
      throw error;
    }
    try {
      if (attemptAbort.signal.aborted) {
        throw new Error(CANCELLED_START_MESSAGE);
      }
      if (await probe(tunnel.url, reachabilityTimeoutMs, attemptAbort.signal)) {
        abortIfNeeded();
        wonAttempt = true;
        return { url: tunnel.url, tunnel };
      }
      options.onAttemptFailed?.({
        attempt,
        hostname: new URL(tunnel.url).hostname,
        reason: "unreachable"
      });
      await tunnel.stop();
    } catch (error) {
      await tunnel.stop();
      if (options.abortSignal?.aborted) {
        throw error instanceof Error && error.message === CANCELLED_START_MESSAGE
          ? error
          : new Error(CANCELLED_START_MESSAGE);
      }
      if (tunnelDied) {
        options.onAttemptFailed?.({
          attempt,
          hostname: new URL(tunnel.url).hostname,
          reason: "exited"
        });
        continue;
      }
      throw error;
    } finally {
      options.abortSignal?.removeEventListener("abort", onParentAbort);
    }
  }
  abortIfNeeded();
  return { error: "dns-unresolved" };
}
