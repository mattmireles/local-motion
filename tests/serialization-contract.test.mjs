// The serialization contract: the single setup lock, the stop-epoch intent
// mechanism, interrupt coverage through every start substep, and the webview
// escape hatches. Split from extension-wiring.test.mjs (2026-07-02) so the
// contract reads as its own focused ledger instead of one mega test file.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

test("button-less notifications are never awaited; setup locks cannot hang on a toast", async () => {
  // Regression (2026-07-02): startInstalledModel awaited a button-less
  // information toast. Its promise settles only on explicit dismissal, so
  // once the toast faded into the notification bell it stayed pending
  // forever, holding both setup locks after a successful start — every
  // model switch was rejected with "Wait for setup to finish".
  const sourceFiles = (await readdir(new URL("../src", import.meta.url), { recursive: true }))
    .filter((name) => name.endsWith(".ts"));
  const allSource = (await Promise.all(sourceFiles.map((name) => readText(`../src/${name}`)))).join("\n");
  assert.equal(allSource.includes("await vscode.window.showInformationMessage"), false);
  // A warning may be awaited only to consume the answer from real buttons.
  const awaited = allSource.match(/await vscode\.window\.showWarningMessage/g) ?? [];
  const consumed = allSource.match(/const answer = await vscode\.window\.showWarningMessage/g) ?? [];
  assert.equal(awaited.length, consumed.length);
  const controllerSource = await readText("../src/app/localMotionController.ts");
  assert.match(controllerSource, /void vscode\.window\.showInformationMessage\(`\$\{session\.displayName\} is running locally\.`\)/);
});

test("controller serializes setup operations before downloads and model switches", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  assert.match(controllerSource, /private setupOperation: Promise<unknown> \| undefined/);
  assert.match(controllerSource, /private async withSetupOperation/);
  assert.match(controllerSource, /setup is already running/);
  assert.match(controllerSource, /return this\.withSetupOperation\(async \(\) => \{/);
  assert.match(controllerSource, /return this\.withSetupOperation\(async \(intent\) => this\.replaceModelOptionLocked/);
  assert.match(controllerSource, /return this\.withSetupOperation\(async \(intent\) => this\.startDownloadedModelLocked/);

  // Regression (2026-07-02 lock audit): the controller is the ONLY lock.
  // The panel once kept a per-session setupOperationActive flag that
  // silently failed when two sessions (sidebar + editor panel) existed —
  // one session's delete could bypass the other session's running setup.
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  assert.equal(panelHostSource.includes("setupOperationActive"), false);
  assert.equal(panelHostSource.includes("Wait for setup to finish"), false);
  // Startup resume yields to an explicit setup instead of racing it, and
  // otherwise holds the same lock as every other mutating operation.
  assert.match(controllerSource, /if \(this\.setupOperation\) \{\s*\n\s*return undefined;/);
  // Turn Off stays an interrupt by contract: stop() must never take the lock.
  const stopBody = controllerSource.slice(
    controllerSource.indexOf("async stop(): Promise<RuntimeResponse>"),
    controllerSource.indexOf("async replaceModelOption(")
  );
  assert.equal(stopBody.includes("withSetupOperation"), false);

  // Regression (2026-07-02 external audit round 3): the LM provider must
  // never start a model. Its lazy start was the one start path outside the
  // setup lock — it could resurrect a model the user had just switched away
  // from, and it silently reversed an explicit Turn Off / Free Memory by
  // reloading tens of GB on a chat request. Off means off: the provider
  // serves only a running session and otherwise errors with how to turn on.
  const providerSource = await readText("../src/provider/localMotionProvider.ts");
  assert.equal(providerSource.includes("runtime.start"), false);
  assert.match(providerSource, /this\.runtime\.activeSession\(\)/);
  assert.match(providerSource, /LOCAL_AGENT_OFF_MESSAGE/);

  // Regression (same round): Connect Cursor's tunnel heal must not stop the
  // runtime itself — the runtime refuses to reuse a session lacking the
  // demanded tunnel and respawns inside its own serialized start, so a
  // Turn Off during the heal cancels it instead of being reversed.
  const connectBody = controllerSource.slice(
    controllerSource.indexOf("async connectCursor("),
    controllerSource.indexOf("private async prepareCursorAfterStartingInstalledModel")
  );
  assert.equal(connectBody.includes("this.runtime.stop()"), false);
  const llamaSource = await readText("../src/runtime/llamaServer.ts");
  assert.match(llamaSource, /const tunnelSatisfied = !tunnelConfig\?\.enabled \|\|/);
  // A demanded manual tunnel URL must be THE tunnel in use — reuse must not
  // hand back a leftover ephemeral quick-tunnel URL.
  assert.match(llamaSource, /!tunnelConfig\.manualUrl \|\| this\.session\.cursorTunnel\?\.url === tunnelConfig\.manualUrl/);

  // Regression (2026-07-02 external audit rounds 4 and 7): the pack
  // install's final start is decided by the stop epoch, which only explicit
  // stops bump — a Turn Off / Free Memory mid-download cancels the start
  // (round 4), while an old-model crash does not silently cancel the switch
  // the user asked for (round 7).
  const installAllBody = controllerSource.slice(
    controllerSource.indexOf("private async installAndStartAll"),
    controllerSource.indexOf("private async installCandidate")
  );
  assert.equal(installAllBody.includes("wasRunning"), false);
  // The epoch arrives as a parameter, minted once at the lock boundary by
  // withSetupOperation — never captured ad hoc after earlier awaits.
  assert.match(installAllBody, /stopEpoch: number/);
  assert.match(controllerSource, /stopEpoch: this\.runtime\.stopEpoch\(\),\s*\n\s*quantizationChoice: new Map\(this\.quantizationChoice\)/);
  assert.match(installAllBody, /if \(this\.runtime\.stopEpoch\(\) === stopEpoch\)/);
  // The epoch accessor bumps only in explicit stop(), never on crash.
  const llamaSource2 = await readText("../src/runtime/llamaServer.ts");
  assert.match(llamaSource2, /stopEpoch\(\): number \{\s*\n\s*return this\.sessionGeneration;/);
  const generationBumps = llamaSource2.match(/this\.sessionGeneration \+= 1/g) ?? [];
  assert.equal(generationBumps.length, 1);

  // Regression (2026-07-02 external audit round 8): intent is enforced at
  // the start boundary itself. The decision-time epoch rides into
  // runtime.start() as requestedGeneration, so a Turn Off during
  // resolver.resolve() (up to a first-time brew install) aborts the start
  // as cancelled instead of being reversed by a post-stop capture.
  assert.match(controllerSource, /const stopEpoch = options\.stopEpoch \?\? this\.runtime\.stopEpoch\(\)/);
  assert.match(llamaSource2, /const requestedGeneration = requestedEpoch \?\? this\.sessionGeneration/);

  // Regression (2026-07-02 external audit round 9): staleness is checked
  // BEFORE the reuse short-circuit — a start queued behind a stop aborts
  // as cancelled instead of handing back the session the stop is tearing
  // down. Order is load-bearing.
  const startLockedBody = llamaSource2.slice(
    llamaSource2.indexOf("private async startLocked"),
    llamaSource2.indexOf("async stop(): Promise<void>")
  );
  const firstAbortCheck = startLockedBody.indexOf("abortIfNeeded();");
  const reuseCheck = startLockedBody.indexOf("if (this.session?.modelPath === model.modelPath");
  assert.notEqual(firstAbortCheck, -1);
  assert.notEqual(reuseCheck, -1);
  assert.equal(firstAbortCheck < reuseCheck, true);

  // The cloudflared brew install dies with the abort signal (Free Memory
  // during a first-time install is not pinned behind brew), and the
  // llama.cpp first install carries its documented-residue note.
  assert.match(llamaSource2, /execFile\(brew, \["install", "cloudflared"\], \{ timeout: 10 \* 60 \* 1000, signal: abortSignal \}\)/);
  const resolverSource2 = await readText("../src/runtime/llamaServerResolver.ts");
  assert.match(resolverSource2, /Documented residue/);

  // Regression (2026-07-02 external audit round 10): terminal webview
  // messages end ALL operation modes through one chokepoint — a handler
  // clearing flags piecemeal left modelSwitchRunning set after an
  // install-backed switch completed, freezing the panel at "Starting".
  const panelHtml3 = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(panelHtml3, /function endSetupOperation\(\)/);
  const endCalls = panelHtml3.match(/endSetupOperation\(\);/g) ?? [];
  assert.equal(endCalls.length >= 2, true);
  assert.equal(panelHtml3.includes("state.automagicalSetupRunning = false;\n        state.setupOperationRunning = false;"), false);

  // A stop during the proxy or tunnel phase cannot publish a session: the
  // last checkpoint sits immediately before the session assignment.
  const publishIndex = llamaSource2.indexOf("const session: RuntimeSession = {");
  const lastCheckIndex = llamaSource2.lastIndexOf("abortIfNeeded();", publishIndex);
  const proxyStartIndex = llamaSource2.indexOf("await proxy.start(");
  assert.equal(proxyStartIndex < lastCheckIndex && lastCheckIndex < publishIndex, true);

  // The DNS retry loop checks the abort signal at the TOP of each tick.
  const dnsBody = llamaSource2.slice(llamaSource2.indexOf("async function tunnelDnsResolves"));
  assert.equal(dnsBody.indexOf("abortSignal?.aborted") < dnsBody.indexOf("await dns.lookup"), true);

  // The palette Connect command logs a cancelled start without warning
  // about the outcome the user chose.
  assert.match(await readText("../src/extension.ts"), /if \(message !== CANCELLED_START_MESSAGE\)/);
  assert.match(controllerSource, /allowInstall: allowLlamaInstallForAutomagicalStart\("explicit"\),\s*\n\s*stopEpoch/);

  // A suppressed final start must not toast "agent is on" (round 8): the
  // palette success message is earned by a running runtime, not by the
  // operation finishing.
  const extensionSource2 = await readText("../src/extension.ts");
  assert.match(extensionSource2, /if \(result\?\.runtime\.running\) \{/);

  // A user's own Turn Off winning mid-switch or mid-connect renders as a
  // neutral off state, never as "That did not work" plus an error toast.
  assert.match(panelHostSource, /if \(messageText !== CANCELLED_START_MESSAGE\)/);
  const panelHtml2 = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(panelHtml2, /message\.message === '\$\{CANCELLED_START_MESSAGE\}'/);
  // One shared literal, defined once.
  const guardsSource = await readText("../src/runtime/runtimeGuards.ts");
  assert.match(guardsSource, /export const CANCELLED_START_MESSAGE = "Local model startup was cancelled\."/);
  const literalCount = (await Promise.all(["../src/runtime/llamaServer.ts", "../src/runtime/cloudflaredTunnel.ts", "../src/runtime/llamaServerResolver.ts", "../src/runtime/llamaHealth.ts"].map((name) => readText(name))))
    .join("\n").match(/"Local model startup was cancelled\."/g) ?? [];
  assert.equal(literalCount.length, 0);

  // Regression (same round): Turn Off stays an interrupt through the tunnel
  // phase — the DNS retry loop observes the start abort signal and the
  // tunnel steps re-check abortIfNeeded, so stop() cannot be pinned on the
  // start queue for the full 90s DNS window.
  assert.match(llamaSource, /tunnelDnsResolves\(tunnel\.url, TUNNEL_DNS_TIMEOUT_MS, abortSignal\)/);
  assert.match(llamaSource, /abortSignal\?: AbortSignal\): Promise<boolean>/);
  assert.match(llamaSource, /this\.startCursorTunnel\(tunnelConfig, proxyBaseUrl, abortIfNeeded, startAbort\.signal\)/);

  // The unlocked PREPARE_CURSOR side-effect path is deleted: the webview
  // never posted it, and the palette command routes through connectCursor.
  const protocolSource2 = await readText("../src/setupProtocol.ts");
  assert.equal(protocolSource2.includes("PREPARE_CURSOR"), false);
  assert.equal(panelHostSource.includes("PREPARE_CURSOR"), false);

  // Regression (2026-07-02 external audit round 5): during a switch install
  // the running model stays stoppable from the panel's primary button — the
  // exact flow the interrupt architecture exists for must not have a dead
  // Turn Off. Fresh starts keep the disabled "Starting…".
  const panelHtml = await readText("../src/ui/setupPanelHtml.ts");
  // Both escape-hatch surfaces (click handler + starting render) cover the
  // switch-install case AND the Cursor-connect heal (round 11: a stalled
  // tunnel heal stranded the panel on Starting with no Turn Off).
  const switchStopHits = panelHtml.match(/\(state\.modelSwitchRunning && state\.runtime && state\.runtime\.running\) \|\| state\.cursorConnectRunning/g) ?? [];
  assert.equal(switchStopHits.length, 2);
  assert.match(panelHtml, /els\.primary\.textContent = 'Turn Off Local Agent';\s*\n\s*els\.primary\.disabled = false;/);

  // An invalid configured manual tunnel URL surfaces via respawn instead of
  // hiding behind an old live tunnel.
  assert.match(llamaSource, /!tunnelConfig\.manualUrlInvalid &&/);

  // Regression (2026-07-02 external audit round 6): the cloudflared spawn
  // wait observes the abort signal too — Turn Off must not be pinned for
  // the 30s startup timeout when cloudflared stalls before printing a URL.
  const cloudflaredSource = await readText("../src/runtime/cloudflaredTunnel.ts");
  assert.match(cloudflaredSource, /abortSignal\?: AbortSignal/);
  assert.match(cloudflaredSource, /options\.abortSignal\?\.addEventListener\("abort", onAbort, \{ once: true \}\)/);
  assert.match(llamaSource, /onExit: \(\) => this\.handleTunnelExit\(tunnel\),\s*\n\s*abortSignal/);
});


test("stop interrupts a stalled health probe and a healthy reuse repeats nothing", async () => {
  // Regression (2026-07-02 external audit round 12): the /health fetch races
  // the start abort signal — a Turn Off mid-probe cancels the request now
  // instead of waiting out the 5s probe timeout.
  const healthSource = await readText("../src/runtime/llamaHealth.ts");
  assert.match(healthSource, /AbortSignal\.any\(\[AbortSignal\.timeout\(5000\), options\.abortSignal\]\)/);

  // A reused session (same model, tunnel satisfied) re-persists nothing and
  // repeats no "is running" toast — reconnecting while healthy is silent.
  const controllerSource = await readText("../src/app/localMotionController.ts");
  assert.match(controllerSource, /const reusedSession = this\.runtime\.activeSession\(\)/);
  assert.match(controllerSource, /if \(session === reusedSession\) \{/);
  const startBody = controllerSource.slice(
    controllerSource.indexOf("private async startInstalledModel"),
    controllerSource.indexOf("private isActiveInstalledModel")
  );
  assert.equal(startBody.indexOf("session === reusedSession") < startBody.indexOf("setInstalledModel"), true);
});

test("every in-flight operation renders as starting; off never lies about live work", async () => {
  // Regression (2026-07-02 external audit round 13): a downloaded-model
  // start or a replace launched from "off" set only setupOperationRunning,
  // so the phase fell through to 'off' — the primary button stayed
  // clickable with its stale label (a second click hit the lock and
  // flashed a false error card) and a live multi-GB replace download
  // rendered no progress at all.
  const panelHtml = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(panelHtml, /: state\.setupOperationRunning \? 'starting'\s*\n\s*: 'off';/);
});

test("host truth rides every posted message: setupBusy is stamped at send time", async () => {
  // Regression (2026-07-02 internal pass 16): the webview guessed busy-ness
  // from four locally-maintained booleans, so a refresh landing mid-operation
  // reverted the panel to a clickable "off" while work was in flight. The
  // panel host now stamps controller.setupBusy() onto every message at the
  // one post site; terminal results post after the lock releases.
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  assert.match(panelHostSource, /setupBusy: this\.controller\.setupBusy\(\)/);
  const stampSites = panelHostSource.match(/webview\.postMessage/g) ?? [];
  assert.equal(stampSites.length, 1);
  const controllerSource2 = await readText("../src/app/localMotionController.ts");
  assert.match(controllerSource2, /setupBusy\(\): boolean \{\s*\n\s*return this\.setupOperation !== undefined;/);
  const panelHtml2 = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(panelHtml2, /\|\| message\.setupBusy === true;/);
});

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
