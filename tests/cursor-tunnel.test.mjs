import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  findCloudflared,
  startQuickTunnel
} from "../out/runtime/cloudflaredTunnel.js";
import { attachRuntimeChildExitHandler } from "../out/runtime/runtimeChildExit.js";

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  exitCode = null;
  signalCode = null;
  killedSignals = [];

  kill(signal = "SIGTERM") {
    this.killedSignals.push(signal);
    return true;
  }

  exit(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

test("findCloudflared prefers PATH before Homebrew locations", async () => {
  const seen = [];
  const result = await findCloudflared({
    commandPath: async (command) => {
      assert.equal(command, "cloudflared");
      return "/tmp/bin/cloudflared";
    },
    executableExists: async (targetPath) => {
      seen.push(targetPath);
      return targetPath === "/tmp/bin/cloudflared";
    }
  });

  assert.equal(result, "/tmp/bin/cloudflared");
  assert.deepEqual(seen, ["/tmp/bin/cloudflared"]);
});

test("findCloudflared checks Homebrew fallbacks when PATH misses", async () => {
  const seen = [];
  const result = await findCloudflared({
    commandPath: async () => undefined,
    executableExists: async (targetPath) => {
      seen.push(targetPath);
      return targetPath === "/usr/local/bin/cloudflared";
    }
  });

  assert.equal(result, "/usr/local/bin/cloudflared");
  assert.deepEqual(seen, ["/opt/homebrew/bin/cloudflared", "/usr/local/bin/cloudflared"]);
});

test("startQuickTunnel abort kills the child, rejects as cancellation, and suppresses onExit", async () => {
  // Regression (2026-07-02 external audit round 7): the spawn wait must be
  // a real interrupt point — a stop mid-spawn rejects immediately instead
  // of pinning the caller for the 30s startup timeout.
  const child = new FakeChild();
  const exits = [];
  const abort = new AbortController();
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: () => child,
    startupTimeoutMs: 5_000,
    abortSignal: abort.signal,
    onExit: (exit) => exits.push(exit)
  });

  abort.abort();
  await assert.rejects(tunnelPromise, /Local model startup was cancelled\./);
  assert.equal(child.killedSignals.length > 0, true);
  child.exit(1, null);
  assert.deepEqual(exits, []);

  // An already-aborted signal never waits at all.
  const preAborted = new AbortController();
  preAborted.abort();
  const instantChild = new FakeChild();
  await assert.rejects(
    startQuickTunnel("/bin/cloudflared", 41434, {
      spawn: () => instantChild,
      startupTimeoutMs: 5_000,
      abortSignal: preAborted.signal
    }),
    /Local model startup was cancelled\./
  );
  assert.equal(instantChild.killedSignals.length > 0, true);
});

test("startQuickTunnel parses trycloudflare URL from noisy stderr", async () => {
  const child = new FakeChild();
  const spawned = [];
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: (command, args, options) => {
      spawned.push({ command, args, options });
      return child;
    },
    startupTimeoutMs: 50
  });

  child.stderr.emit("data", "2026 INF Starting quick tunnel\n");
  child.stderr.emit("data", "Visit https://able-baker-charlie.trycloudflare.com for your tunnel\n");
  const tunnel = await tunnelPromise;

  assert.equal(tunnel.url, "https://able-baker-charlie.trycloudflare.com");
  assert.equal(spawned[0].command, "/bin/cloudflared");
  assert.deepEqual(spawned[0].args, ["tunnel", "--url", "http://127.0.0.1:41434"]);
  assert.deepEqual(spawned[0].options.stdio, ["ignore", "pipe", "pipe"]);
});

test("startQuickTunnel rejects when startup times out and stops the child", async () => {
  const child = new FakeChild();
  let exits = 0;
  await assert.rejects(
    () => startQuickTunnel("/bin/cloudflared", 41434, {
      spawn: () => child,
      startupTimeoutMs: 1,
      killTimeoutMs: 1,
      onExit: () => {
        exits += 1;
      }
    }),
    /did not print a trycloudflare URL/
  );
  child.stdout.emit("data", "https://too-late.trycloudflare.com");
  child.exit(null, "SIGKILL");

  assert.equal(child.killedSignals.includes("SIGTERM"), true);
  assert.equal(exits, 0);
});

test("startQuickTunnel rejects if cloudflared exits before printing a URL", async () => {
  const child = new FakeChild();
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: () => child,
    startupTimeoutMs: 50
  });

  child.stderr.emit("data", "no tunnel today");
  child.exit(1, null);

  await assert.rejects(tunnelPromise, /exited before printing/);
});

test("startQuickTunnel stop terminates the child without reporting an unexpected exit", async () => {
  const child = new FakeChild();
  let exits = 0;
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: () => child,
    startupTimeoutMs: 50,
    killTimeoutMs: 50,
    onExit: () => {
      exits += 1;
    }
  });
  child.stdout.emit("data", "https://one-two-three.trycloudflare.com");
  const tunnel = await tunnelPromise;

  const stopped = tunnel.stop();
  child.exit(null, "SIGTERM");
  await stopped;

  assert.deepEqual(child.killedSignals, ["SIGTERM"]);
  assert.equal(exits, 0);
});

test("startQuickTunnel stop escalates to SIGKILL when the child does not exit", async () => {
  const child = new FakeChild();
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: () => child,
    startupTimeoutMs: 50,
    killTimeoutMs: 1
  });
  child.stdout.emit("data", "https://sigkill-fallback.trycloudflare.com");
  const tunnel = await tunnelPromise;

  await tunnel.stop();

  assert.deepEqual(child.killedSignals, ["SIGTERM", "SIGKILL"]);
});

test("startQuickTunnel reports an unexpected exit after URL resolution", async () => {
  const child = new FakeChild();
  let observed;
  const tunnelPromise = startQuickTunnel("/bin/cloudflared", 41434, {
    spawn: () => child,
    startupTimeoutMs: 50,
    onExit: (exit) => {
      observed = exit;
    }
  });
  child.stdout.emit("data", "https://post-start.trycloudflare.com");
  await tunnelPromise;

  child.exit(2, null);

  assert.equal(observed.code, 2);
  assert.match(observed.output, /post-start/);
});

test("runtime child exit cleanup stops the tunnel kill switch", () => {
  const child = new FakeChild();
  const otherChild = new FakeChild();
  let currentChild = child;
  let childCleared = false;
  let sessionCleared = false;
  let tunnelStops = 0;
  let proxyStops = 0;
  let proxyCleared = false;
  let statusChanges = 0;
  const output = [];

  attachRuntimeChildExitHandler(child, {
    appendLine: (line) => output.push(line),
    isCurrentChild: (candidate) => candidate === currentChild,
    clearChild: () => {
      childCleared = true;
      currentChild = undefined;
    },
    clearSession: () => {
      sessionCleared = true;
    },
    stopTunnel: () => {
      tunnelStops += 1;
    },
    stopProxy: () => {
      proxyStops += 1;
    },
    clearProxy: () => {
      proxyCleared = true;
    },
    onStatusChanged: () => {
      statusChanges += 1;
    }
  });
  attachRuntimeChildExitHandler(otherChild, {
    appendLine: (line) => output.push(line),
    isCurrentChild: (candidate) => candidate === currentChild,
    clearChild: () => {
      throw new Error("stale child must not clear runtime child");
    },
    clearSession: () => {
      throw new Error("stale child must not clear session");
    },
    stopTunnel: () => {
      throw new Error("stale child must not stop tunnel");
    },
    stopProxy: () => {
      throw new Error("stale child must not stop proxy");
    },
    clearProxy: () => {
      throw new Error("stale child must not clear proxy");
    },
    onStatusChanged: () => {
      throw new Error("stale child must not notify status");
    }
  });

  otherChild.exit(0, null);
  child.exit(null, "SIGTERM");

  assert.deepEqual(output, [
    "llama-server exited: code=0 signal=none",
    "llama-server exited: code=none signal=SIGTERM"
  ]);
  assert.equal(childCleared, true);
  assert.equal(sessionCleared, true);
  assert.equal(tunnelStops, 1);
  assert.equal(proxyStops, 1);
  assert.equal(proxyCleared, true);
  assert.equal(statusChanges, 1);
});
