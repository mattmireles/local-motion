import { setupPanelStorageMarkup } from "./setupPanelStorage";
import { setupPanelStyles } from "./setupPanelStyles";
import { SETUP_REQUEST_COMMAND, SETUP_RESPONSE_TYPE } from "../setupProtocol";
import { CANCELLED_START_MESSAGE } from "../runtime/runtimeGuards";
import { LOCAL_MOTION_MODEL_ID } from "../types";

export function setupPanelHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Local Motion</title>
  <style>
    ${setupPanelStyles()}
  </style>
</head>
<body>
  <main>
    <div id="stage" class="stage" role="status" aria-live="polite">
      <h1 id="headline" class="headline">Checking Local Motion…</h1>
      <p id="subline" class="subline">Runs a coding model on this Mac for Cursor.</p>
    </div>
    <div id="progress" class="progress hidden" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100"><div id="progressFill" class="fill"></div></div>

    <section id="modelChooser" class="model-chooser" aria-label="Local models">
      <h2>Model</h2>
      <div id="modelOptions" class="model-options" role="radiogroup" aria-label="Choose local model"></div>
    </section>

    <div id="connect" class="connect hidden">
      <p id="connectLead" class="connect-lead"></p>
      <ol id="connectSteps" class="connect-steps" hidden></ol>
      <div class="fields">
        <div class="field">
          <label>Model name</label>
          <div class="field-row">
            <span id="valModelId" class="field-value"></span>
            <button class="btn ghost copy" data-key="modelId">Copy</button>
          </div>
        </div>
        <div class="field">
          <label>API key</label>
          <div class="field-row">
            <span id="valApiKey" class="field-value"></span>
            <button class="btn ghost copy" data-key="apiKey">Copy</button>
          </div>
        </div>
        <div class="field">
          <label>Base URL (OpenAI compatible)</label>
          <div class="field-row">
            <span id="valBaseUrl" class="field-value"></span>
            <button class="btn ghost copy" data-key="baseUrl">Copy</button>
          </div>
        </div>
        <div class="field">
          <label>Full setup</label>
          <div class="field-row">
            <span id="valSetupBlock" class="field-value">All Cursor fields</span>
            <button id="copySetupBlock" class="btn ghost copy" data-key="setupBlock">Copy Full Setup</button>
          </div>
        </div>
      </div>
      <div class="row">
        <button id="openCursor" class="btn cta">Open Cursor Settings</button>
      </div>
      <!-- The one fact about this product that belongs to the user. It is
           permanent copy, not a dismissable notice, and it is the entire
           privacy surface of the Cursor path — the mechanism stays invisible,
           the consequence does not. -->
      <p class="note">Model runs on this Mac. Cursor relays chats through its servers.</p>
      <p id="connectNote" class="note" role="status" aria-live="polite"></p>
    </div>

    <div class="primary-slot">
      <button id="primary" class="btn primary">Turn On Local Agent</button>
    </div>

    <p id="metaLine" class="meta-line" style="display:none"></p>

    ${setupPanelStorageMarkup()}

    <details class="advanced">
      <summary>Advanced</summary>
      <div class="advanced-body">
        <section class="advanced-block">
          <h2>This Mac</h2>
          <div id="machine" class="grid"></div>
        </section>

        <section class="advanced-block">
          <h2>Activity log</h2>
          <pre id="status">Waiting for machine profile.</pre>
        </section>
      </div>
    </details>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = {
      installed: undefined,
      runtime: undefined,
      machine: undefined,
      downloadedModels: [],
      downloadedModelsSizeBytes: 0,
      storageOpen: false,
      cursorSetupViewModel: undefined,
      cursorSetupFreshness: undefined,
      verification: undefined,
      settings: undefined,
      modelOptions: [],
      selectedModelOptionId: 'max',
      replaceOpen: {},
      copyResults: {},
      automagicalSetupRunning: false,
      modelSwitchRunning: false,
      setupOperationRunning: false,
      cursorConnectRunning: false,
      selectedModelName: '',
      progressMessage: '',
      progressPercent: undefined,
      connectMessage: '',
      errorMessage: ''
    };

    const els = {
      stage: document.getElementById('stage'),
      headline: document.getElementById('headline'),
      subline: document.getElementById('subline'),
      progress: document.getElementById('progress'),
      progressFill: document.getElementById('progressFill'),
      connect: document.getElementById('connect'),
      valModelId: document.getElementById('valModelId'),
      valApiKey: document.getElementById('valApiKey'),
      valBaseUrl: document.getElementById('valBaseUrl'),
      valSetupBlock: document.getElementById('valSetupBlock'),
      copySetupBlock: document.getElementById('copySetupBlock'),
      modelChooser: document.getElementById('modelChooser'),
      modelOptions: document.getElementById('modelOptions'),
      openCursor: document.getElementById('openCursor'),
      connectLead: document.getElementById('connectLead'),
      connectSteps: document.getElementById('connectSteps'),
      connectNote: document.getElementById('connectNote'),
      primary: document.getElementById('primary'),
      metaLine: document.getElementById('metaLine'),
      storageSummary: document.getElementById('storageSummary'),
      storageText: document.getElementById('storageText'),
      manageStorage: document.getElementById('manageStorage'),
      storagePanel: document.getElementById('storagePanel'),
      storageList: document.getElementById('storageList'),
      machine: document.getElementById('machine'),
      status: document.getElementById('status')
    };

    /* The primary control binds to runtime on/off only. It never morphs
       into Connect, and never into a destructive third action. */
    els.primary.addEventListener('click', () => {
      // Disabled is the single source of truth for "busy". Never gate the
      // toggle on a setup flag — that is what made Turn Off a dead button.
      if (els.primary.disabled) return;
      // A switch install keeps Turn Off alive: stop is an interrupt by
      // architecture, and the host suppresses the post-download restart.
      // The download itself continues (cancellable from its notification).
      // A Cursor-connect respawn gets the same escape hatch — a stalled
      // tunnel heal (cloudflared install, DNS wait) must never strand the
      // panel on Starting with no way out; stop cancels the heal cleanly.
      if ((state.modelSwitchRunning && state.runtime && state.runtime.running) || state.cursorConnectRunning) {
        els.primary.disabled = true;
        els.primary.textContent = 'Turning Off…';
        state.modelSwitchRunning = false;
        state.cursorConnectRunning = false;
        vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.STOP}' });
        return;
      }
      const option = selectedModelOption();
      // An unavailable option is almost always a transient listing failure,
      // not a verdict on this Mac — the primary action becomes a retry that
      // re-requests state (the host does not cache failed candidate loads).
      if (option && option.status === 'unavailable') {
        els.primary.disabled = true;
        els.primary.textContent = 'Checking…';
        vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.READY}' });
        return;
      }
      if (state.runtime && state.runtime.running) {
        if (option && option.status !== 'running') {
          startModelOption(option);
          return;
        }
        // Stop has a short grace period; give immediate, honest feedback.
        els.primary.disabled = true;
        els.primary.textContent = 'Turning Off…';
        vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.STOP}' });
        return;
      }
      if (option) {
        startModelOption(option);
        return;
      }
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.AUTOMAGICAL_SETUP}', modelOptionId: state.selectedModelOptionId });
    });

    /* Each Cursor value copies on its own, outside the primary slot. */
    for (const button of document.querySelectorAll('.connect .copy')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.COPY_CURSOR_VALUE}', key: button.dataset.key });
      });
    }
    els.openCursor.addEventListener('click', () => {
      state.cursorConnectRunning = true;
      state.setupOperationRunning = true;
      state.progressPercent = undefined;
      state.progressMessage = 'Opening Cursor Settings…';
      state.connectMessage = 'Preparing Cursor setup and opening Cursor Settings.';
      render();
      setStatus(state.connectMessage);
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.CONNECT_CURSOR}' });
    });
    els.manageStorage.addEventListener('click', () => {
      state.storageOpen = !state.storageOpen;
      renderStorage();
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === '${SETUP_RESPONSE_TYPE.STATE}') {
        state.installed = message.installed;
        state.runtime = message.runtime;
        state.machine = message.machine;
        updateModelOptions(message);
        updateDownloadedStorage(message);
        /* A model switch spans several runtime status changes (old model
           stops, new one loads), each of which pushes a fresh STATE. For a
           switch to an already-downloaded model the old server stops first,
           so a STATE with the model running means the NEW one is up — the
           switch is over. During an install-backed switch the OLD model
           keeps running through the download, so "running" proves nothing:
           that path must wait for AUTOMAGICAL_SETUP_COMPLETE, or a mid-
           download status refresh (a Cursor request hitting the old proxy)
           would snap the panel to "on" and hide the switch progress. */
        if (state.modelSwitchRunning && !state.automagicalSetupRunning && message.runtime && message.runtime.running) {
          state.modelSwitchRunning = false;
          state.progressMessage = '';
        }
        // Anchored to host truth: a refresh landing mid-operation carries
        // setupBusy=true (the lock is held), so the panel cannot revert to
        // a clickable "off" while a from-off start or replace is in flight.
        state.setupOperationRunning = state.modelSwitchRunning || state.cursorConnectRunning || message.setupBusy === true;
        state.errorMessage = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderMachine(message.machine);
        render();
        setStatus(state.modelSwitchRunning ? state.progressMessage : 'Ready.');
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.INSTALL_PROGRESS}') {
        state.setupOperationRunning = true;
        state.errorMessage = '';
        if (message.modelName) state.selectedModelName = message.modelName;
        const percent = message.progress && message.progress.percent;
        const bytes = message.progress
          ? formatBytes(message.progress.downloadedBytes) + ' / ' + formatBytes(message.progress.totalBytes)
          : '';
        const rate = message.progress && typeof message.progress.bytesPerSecond === 'number' && isFinite(message.progress.bytesPerSecond)
          ? ' at ' + formatRate(message.progress.bytesPerSecond)
          : '';
        if (typeof percent === 'number' && isFinite(percent)) {
          state.progressPercent = Math.round(percent);
          state.progressMessage = 'Downloading ' + modelProgressName() + ' · ' + state.progressPercent + '% · ' + bytes + rate;
        } else {
          // Unknown total size: stay indeterminate rather than show a stuck 0%.
          state.progressPercent = undefined;
          state.progressMessage = 'Downloading ' + modelProgressName() + '…' + (bytes ? ' ' + bytes : '') + rate;
        }
        render();
        setStatus(state.progressMessage);
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.INSTALL_MODEL_SELECTED}') {
        state.selectedModelName = message.modelName;
        state.progressMessage = 'Selected ' + message.modelName + '. Needs about ' + message.requiredMemory + ' runtime memory; ' + message.availableMemory + ' available now.';
        render();
        setStatus(state.progressMessage);
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_STARTED}') {
        state.automagicalSetupRunning = true;
        state.setupOperationRunning = true;
        state.errorMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
        state.progressMessage = 'Preparing Max and Mini for this Mac…';
        render();
        setStatus('Selecting compatible Max and Mini downloads, starting the selected model, and preparing Cursor.');
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.RUNTIME}') {
        state.runtime = message.runtime;
        updateModelOptions(message);
        updateDownloadedStorage(message);
        state.errorMessage = '';
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        render();
        setStatus(message.runtime.message);
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_COMPLETE}') {
        endSetupOperation();
        state.errorMessage = '';
        state.installed = message.installed;
        state.runtime = message.runtime;
        updateModelOptions(message);
        updateDownloadedStorage(message);
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.cursor && message.cursor.verification;
        state.settings = message.cursor && message.cursor.settings;
        if (message.cursor && message.cursor.copy) state.copyResults.setupBlock = message.cursor.copy;
        render();
        setStatus([state.verification && state.verification.message, state.copyResults.setupBlock && state.copyResults.setupBlock.message, state.settings && state.settings.message].filter(Boolean).join(' '));
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.CURSOR_SETUP_PREPARED}') {
        state.cursorConnectRunning = false;
        state.setupOperationRunning = false;
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.errorMessage = '';
        state.cursorSetupViewModel = message.viewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.verification;
        state.settings = message.settings;
        if (message.copy) state.copyResults.setupBlock = message.copy;
        state.connectMessage = [message.settings && message.settings.message, message.verification && message.verification.message].filter(Boolean).join(' ');
        render();
        setStatus([message.verification && message.verification.message, message.copy && message.copy.message, message.settings && message.settings.message].filter(Boolean).join(' '));
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.CURSOR_COPY_RESULT}') {
        state.errorMessage = '';
        state.copyResults[message.key] = { ok: message.ok, message: message.message };
        state.connectMessage = message.message;
        if (message.cursorSetupFreshness) state.cursorSetupFreshness = message.cursorSetupFreshness;
        render();
        setStatus(message.message);
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.ERROR}') {
        endSetupOperation();
        // A cancelled start is the user's own Turn Off winning mid-switch
        // or mid-connect — that is the outcome they asked for, so it
        // renders as a plain off state, never as "That did not work".
        state.errorMessage = message.message === '${CANCELLED_START_MESSAGE}'
          ? ''
          : (message.message || 'Something went wrong.');
        render();
        setStatus(message.message);
      }
    });

    /* ------------------------------------------------------------------ */
    /* Render the whole surface from posted state. No persisted DOM.       */
    /* ------------------------------------------------------------------ */

    let renderedPhase = '';

    function render() {
      const runtime = state.runtime || {};
      const running = Boolean(runtime.running);
      const busy = state.automagicalSetupRunning;
      const errored = Boolean(state.errorMessage);
      // The honest connected signal: a real inbound request has hit the proxy.
      const inUse = Boolean(runtime.clientObserved);
      // A switch outranks "on": while one model hands off to another, the
      // old model may still report running, but Turn Off must not be
      // clickable against a server that is about to be replaced.
      const phase = (errored && !running) ? 'error'
        : state.modelSwitchRunning ? 'starting'
        : running ? 'on'
        : state.cursorConnectRunning ? 'starting'
        : busy ? 'starting'
        // Any in-flight operation from "off" — a downloaded-model start, a
        // replace download — is 'starting' too: rendering 'off' left the
        // primary button clickable with its pre-click label (a second click
        // hit the lock and flashed a false error card) and hid the progress
        // bar of a live multi-GB replace download.
        : state.setupOperationRunning ? 'starting'
        : 'off';
      renderModelOptions();
      renderStorage();

      // A failed turn-on speaks in place, replacing the headline.
      if (phase === 'error') {
        els.headline.textContent = 'That did not work';
        els.headline.classList.add('error');
        els.subline.textContent = state.errorMessage;
        els.subline.classList.remove('error');
        els.progress.classList.add('hidden');
        els.connect.classList.add('hidden');
        els.metaLine.style.display = 'none';
        els.primary.textContent = 'Try Again';
        els.primary.removeAttribute('title');
        els.primary.disabled = false;
        renderedPhase = phase;
        return;
      }
      els.headline.classList.remove('error');
      els.subline.classList.remove('error');

      if (phase === 'starting') {
        renderStarting();
        renderedPhase = phase;
        return;
      }

      if (phase === 'on') {
        // Settle motion plays only on the transition into ON, never on every
        // in-state update (a Copy click must not re-fade the whole surface).
        renderOn(inUse, renderedPhase !== 'on');
        renderedPhase = phase;
        return;
      }

      renderOff();
      renderedPhase = phase;
    }

    function renderOff() {
      const option = selectedModelOption();
      const unavailable = option && option.status === 'unavailable';
      els.headline.textContent = 'Local agent is off';
      els.subline.textContent = unavailable
        ? (option.statusText || 'The model list could not be loaded.')
        : option
          ? 'Choose the local model Cursor will use.'
          : 'Runs a coding model on this Mac for Cursor.';
      els.progress.classList.add('hidden');
      els.connect.classList.add('hidden');
      els.metaLine.style.display = 'none';
      els.primary.textContent = primaryActionText(option, false);
      els.primary.removeAttribute('title');
      els.primary.disabled = false;
    }

    function renderStarting() {
      els.headline.textContent = 'Starting local agent';
      els.subline.textContent = state.progressMessage || 'Loading…';
      els.connect.classList.add('hidden');
      els.metaLine.style.display = 'none';

      // A real determinate bar only while we have a download percent.
      if (typeof state.progressPercent === 'number') {
        els.progress.classList.remove('hidden');
        els.progress.setAttribute('aria-valuenow', String(state.progressPercent));
        els.progressFill.style.width = state.progressPercent + '%';
      } else {
        els.progress.classList.add('hidden');
        els.progress.removeAttribute('aria-valuenow');
      }

      // While a replacement downloads, the running model stays stoppable —
      // the exact flow the interrupt architecture exists for — and a
      // Cursor-connect heal keeps the same escape hatch while its tunnel
      // work runs. A fresh start keeps the disabled 'Starting…': nothing
      // is running to turn off.
      if ((state.modelSwitchRunning && state.runtime && state.runtime.running) || state.cursorConnectRunning) {
        els.primary.textContent = 'Turn Off Local Agent';
        els.primary.disabled = false;
      } else {
        els.primary.textContent = 'Starting…';
        els.primary.disabled = true;
      }
      els.primary.removeAttribute('title');
    }

    function renderOn(inUse, entering) {
      if (entering) {
        els.stage.classList.remove('settle');
        // Force reflow so the settle animation replays only on a fresh ON entry.
        void els.stage.offsetWidth;
        els.stage.classList.add('settle');
      }

      els.headline.textContent = 'Local agent is on';
      // "is using" is earned only by a real inbound request; otherwise the
      // honest claim is the softer "can use".
      els.subline.textContent = inUse
        ? 'Cursor is using your local model.'
        : 'Cursor can use your local model.';
      els.progress.classList.add('hidden');

      // A clean symmetric on/off toggle, never a destructive-sounding morph.
      // The memory framing lives in the tooltip, not in a second button.
      const option = selectedModelOption();
      els.primary.textContent = primaryActionText(option, true);
      els.primary.title = option && option.status !== 'running' ? 'Stops the current model and starts the selected one' : 'Frees the model from memory';
      els.primary.disabled = false;

      // A post-start failure (copy, verify, open settings) surfaces in place
      // while the agent itself stays on, instead of hiding in the activity log.
      if (state.errorMessage) {
        els.subline.textContent = state.errorMessage;
        els.subline.classList.add('error');
      }

      // Once a real request has arrived there is nothing left to do, so drop
      // the card. Until then the values stay put so the user can copy them into
      // Cursor — they must NEVER vanish just because Cursor Settings opened.
      if (inUse) {
        els.connect.classList.add('hidden');
      } else {
        const viewModel = state.cursorSetupViewModel || {};
        els.connect.classList.remove('hidden');
        const cursorReady = viewModel.isRunning === true;
        const cursorDisabled = !cursorReady || state.cursorConnectRunning || state.setupOperationRunning;
        for (const button of document.querySelectorAll('.connect .copy')) {
          button.disabled = cursorDisabled;
        }
        els.openCursor.disabled = state.cursorConnectRunning || state.setupOperationRunning;
        els.valModelId.textContent = viewModel.modelId || ${JSON.stringify(LOCAL_MOTION_MODEL_ID)};
        els.valApiKey.textContent = viewModel.apiKey || '';
        els.valBaseUrl.textContent = viewModel.baseUrl || viewModel.statusMessage || 'Cursor connection is not ready.';
        els.valSetupBlock.textContent = cursorReady ? 'Model name, API key, and Base URL' : 'Unavailable until Cursor connection is ready';
        els.copySetupBlock.textContent = state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'stale'
          ? 'Copy Updated Setup'
          : 'Copy Full Setup';
        const steps = Array.isArray(viewModel.steps) ? viewModel.steps.filter((step) => typeof step === 'string' && step.trim()) : [];
        els.connectLead.textContent = cursorReady
          ? 'Copy each value into Cursor Settings → Models → Add Custom Model.'
          : (viewModel.statusMessage || 'Start a local model, then connect Cursor.');
        els.connectSteps.replaceChildren();
        if (steps.length > 0) {
          for (const step of steps) {
            const item = document.createElement('li');
            item.textContent = step;
            els.connectSteps.appendChild(item);
          }
          els.connectSteps.hidden = false;
        } else {
          els.connectSteps.hidden = true;
        }
        const freshness = state.cursorSetupFreshness;
        const freshnessMessage = freshness && freshness.message;
        // Operational messages win for live connect/copy feedback. When values
        // are already current, surface the vendor-catalog triage from statusMessage
        // so "Model name is not valid" guidance is not buried forever.
        const note = state.connectMessage
          || (freshness && freshness.status === 'current' ? (viewModel.statusMessage || freshnessMessage) : freshnessMessage)
          || viewModel.statusMessage
          || '';
        els.connectNote.textContent = note;
        els.connectNote.style.display = note ? 'block' : 'none';
      }

      // One quiet greyed metadata line: the model display name only.
      const name = (state.installed && state.installed.displayName)
        || runtimeDisplayName();
      if (name) {
        els.metaLine.style.display = 'block';
        els.metaLine.textContent = name;
      } else {
        els.metaLine.style.display = 'none';
      }
    }

    function runtimeDisplayName() {
      const runtime = state.runtime || {};
      return runtime.displayName || runtime.modelId || '';
    }

    function primaryActionText(option, running) {
      if (!option) return running ? 'Turn Off Local Agent' : 'Turn On Local Agent';
      if (option.status === 'unavailable') return 'Try Again';
      if (running && option.status !== 'running') return option.downloadedModelId ? 'Switch to ' + option.label : 'Install Max + Mini, Switch to ' + option.label;
      if (running) return 'Turn Off Local Agent';
      return option.downloadedModelId ? 'Start ' + option.label : 'Install Max + Mini, Start ' + option.label;
    }

    /* ------------------------------------------------------------------ */
    /* Advanced surface: Mac details and the activity log.                 */
    /* ------------------------------------------------------------------ */

    function renderMachine(machine) {
      state.machine = machine;
      els.machine.innerHTML = [
        ['CPU', machine.cpu],
        ['Architecture', machine.arch + (machine.appleSilicon ? ' Apple Silicon' : '')],
        ['Memory', machine.memory + ' total'],
        ['Model budget', machine.budget],
        ['Available RAM', machine.availableMemory],
        ['Free disk', machine.disk],
        ['Storage', machine.storageRoot]
      ].map(([label, value]) => '<div class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('');
    }

    function updateModelOptions(message) {
      if (!Array.isArray(message.modelOptions)) return;
      state.modelOptions = message.modelOptions;
      const selected = message.selectedModelOptionId || state.selectedModelOptionId;
      if (state.modelOptions.some(option => option.id === selected)) {
        state.selectedModelOptionId = selected;
      }
    }

    function renderModelOptions() {
      const options = state.modelOptions || [];
      if (!options.length) {
        els.modelOptions.innerHTML = '<div class="model-option skeleton"><div class="model-title"><strong>Max</strong><span>Checking models…</span></div><div class="model-meta">Reading memory and download size.</div></div>';
        return;
      }
      els.modelOptions.innerHTML = options.map(option => {
        const selected = option.id === state.selectedModelOptionId;
        const unavailable = option.status === 'unavailable';
        const active = option.status === 'running';
        const disabled = state.setupOperationRunning ? ' disabled' : '';
        // The chooser appears only while there is a real choice to make —
        // before download, with more than one compatible level.
        const choices = (!option.downloadedModelId && Array.isArray(option.quantizationChoices) && option.quantizationChoices.length > 1)
          ? option.quantizationChoices : undefined;
        // Each fact appears exactly once: memory reads against the budget it
        // must fit inside ("uses X of Y"); quantization and download size
        // live in the chooser when there is one, in the meta line when not.
        const budget = state.machine && state.machine.budget;
        const detail = [
          option.contextWindow ? option.contextWindow + ' context' : '',
          option.requiredMemory ? 'uses ' + option.requiredMemory + (budget ? ' of ' + budget : '') : '',
          choices ? '' : option.quantization,
          choices ? '' : (option.downloadSize ? option.downloadSize + ' download' : '')
        ].filter(Boolean).join(' · ');
        const chooser = choices
          ? '<span class="model-quant"><select data-quant-option="' + esc(option.id) + '" aria-label="Quantization for ' + esc(option.label) + '"' + disabled + '>' +
              choices.map(choice => '<option value="' + esc(choice.fileName) + '"' + (choice.fileName === option.fileName ? ' selected' : '') + '>' + esc(choice.label) + '</option>').join('') +
            '</select></span>'
          : '';
        // Status speaks only when it says something the primary button does
        // not: Running, Ready, or why the option is unavailable. The reason
        // takes the meta slot so it can wrap instead of clipping.
        const statusChip = !unavailable && option.statusText
          ? '<span class="model-status">' + esc(option.statusText) + '</span>'
          : '';
        const meta = unavailable
          ? (option.statusText || 'The model list could not be loaded.')
          : (detail || option.repoId);
        // Replace is a rare act; it hides behind a quiet swap icon and only
        // then spends a row on an input.
        const replaceOpen = Boolean(state.replaceOpen[option.id]);
        return '<div class="model-option' + (selected ? ' selected' : '') + (active ? ' active' : '') + '" data-option-id="' + esc(option.id) + '" role="radio" tabindex="0" aria-checked="' + (selected ? 'true' : 'false') + '"' + (unavailable ? ' title="' + esc(option.statusText) + '"' : '') + '>' +
          '<span class="model-title"><span class="model-radio" aria-hidden="true"></span><strong>' + esc(option.label) + '</strong><span>' + esc(option.modelName) + '</span></span>' +
          statusChip +
          '<span class="model-meta">' + esc(meta) + '</span>' +
          chooser +
          '<span class="model-repo-row"><span class="model-repo">' + esc(option.repoId) + '</span>' +
            '<button class="btn icon" data-replace-toggle="' + esc(option.id) + '" aria-expanded="' + (replaceOpen ? 'true' : 'false') + '" aria-label="Replace ' + esc(option.label) + ' with another Hugging Face repository" title="Replace model"' + disabled + '>' + swapIcon() + '</button></span>' +
          (replaceOpen
            ? '<span class="model-replace"><input data-repo-input="' + esc(option.id) + '" value="' + esc(option.repoId) + '" aria-label="Hugging Face repository for ' + esc(option.label) + '"><button class="btn ghost" data-replace-option="' + esc(option.id) + '"' + disabled + '>Replace</button></span>'
            : '') +
        '</div>';
      }).join('');

      for (const optionEl of els.modelOptions.querySelectorAll('[data-option-id]')) {
        optionEl.addEventListener('click', event => {
          if (event.target && (event.target.closest('input') || event.target.closest('button') || event.target.closest('select'))) return;
          state.selectedModelOptionId = optionEl.dataset.optionId;
          render();
        });
        optionEl.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          state.selectedModelOptionId = optionEl.dataset.optionId;
          render();
        });
      }
      for (const button of els.modelOptions.querySelectorAll('button[data-replace-toggle]')) {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const optionId = button.dataset.replaceToggle;
          state.replaceOpen[optionId] = !state.replaceOpen[optionId];
          render();
          if (state.replaceOpen[optionId]) {
            const input = els.modelOptions.querySelector('input[data-repo-input="' + optionId + '"]');
            if (input) input.focus();
          }
        });
      }
      for (const button of els.modelOptions.querySelectorAll('button[data-replace-option]')) {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const optionId = button.dataset.replaceOption;
          const input = els.modelOptions.querySelector('input[data-repo-input="' + optionId + '"]');
          replaceModelOption(optionId, input ? input.value : '');
        });
      }
      for (const select of els.modelOptions.querySelectorAll('select[data-quant-option]')) {
        select.addEventListener('change', () => {
          vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.SELECT_QUANTIZATION}', modelOptionId: select.dataset.quantOption, fileName: select.value });
        });
      }
    }

    function selectedModelOption() {
      return (state.modelOptions || []).find(option => option.id === state.selectedModelOptionId);
    }

    function startModelOption(option) {
      if (option.status === 'unavailable') return;
      state.modelSwitchRunning = Boolean(state.runtime && state.runtime.running);
      state.setupOperationRunning = true;
      state.progressPercent = undefined;
      state.progressMessage = option.downloadedModelId
        ? (option.status === 'running' ? 'Reloading ' : 'Starting ') + option.label + '…'
        : 'Installing Max and Mini, then starting ' + option.label + '…';
      render();
      setStatus(state.progressMessage);
      if (option.downloadedModelId) {
        vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.START_DOWNLOADED_MODEL}', id: option.downloadedModelId });
        return;
      }
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.AUTOMAGICAL_SETUP}', modelOptionId: option.id });
    }

    function replaceModelOption(optionId, repoId) {
      const cleanRepo = String(repoId || '').trim();
      if (!cleanRepo) {
        setStatus('Paste a Hugging Face GGUF repository first.');
        return;
      }
      state.setupOperationRunning = true;
      state.replaceOpen[optionId] = false;
      state.progressPercent = undefined;
      state.progressMessage = 'Replacing ' + optionId + ' with ' + cleanRepo + '…';
      render();
      setStatus(state.progressMessage);
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.REPLACE_MODEL_OPTION}', modelOptionId: optionId, repoId: cleanRepo });
    }

    /* Downloaded-model storage. This is one execution scope with the render
       functions above (a single inline <script> tag), so it lives here
       rather than behind a separately-imported "module" that would only
       fake a boundary that does not exist at runtime. */
    function updateDownloadedStorage(message) {
      if (!Array.isArray(message.downloadedModels)) return;
      state.downloadedModels = message.downloadedModels;
      state.downloadedModelsSizeBytes = message.downloadedModelsSizeBytes || 0;
    }

    function renderStorage() {
      const models = state.downloadedModels || [];
      if (!models.length) {
        state.storageOpen = false;
        els.storageSummary.classList.add('hidden');
        els.storagePanel.classList.add('hidden');
        els.storageList.innerHTML = '';
        return;
      }

      els.storageSummary.classList.remove('hidden');
      const readyCount = models.filter(model => !model.partial).length;
      els.storageText.textContent = readyCount + ' local model' + (readyCount === 1 ? '' : 's') + ' ready · ' + formatBytes(state.downloadedModelsSizeBytes);
      els.manageStorage.textContent = state.storageOpen ? 'Hide' : 'Manage';
      els.manageStorage.setAttribute('aria-expanded', state.storageOpen ? 'true' : 'false');

      if (!state.storageOpen) {
        els.storagePanel.classList.add('hidden');
        return;
      }

      els.storagePanel.classList.remove('hidden');
      els.storageList.innerHTML = models.map((model, index) => {
        const badges = [
          model.active ? '<span class="storage-badge active">Active</span>' : '',
          !model.active && model.installed ? '<span class="storage-badge">Default</span>' : '',
          model.partial ? '<span class="storage-badge">Partial</span>' : ''
        ].filter(Boolean).join('');
        const disabled = state.setupOperationRunning ? ' disabled' : '';
        const runButton = model.active || model.partial
          ? ''
          : '<button class="btn cta" data-index="' + index + '" data-action="run" aria-label="Switch to ' + esc(modelLabel(model.fileName)) + '"' + disabled + '>Switch</button>';
        return '<div class="storage-item' + (model.active ? ' active' : '') + '">' +
          '<div>' +
            '<div class="storage-name">' + esc(modelLabel(model.fileName)) + '</div>' +
            '<div class="storage-meta">' + esc(formatBytes(model.sizeBytes)) + '</div>' +
            '<div class="storage-file">' + esc(model.fileName) + '</div>' +
            (badges ? '<div class="storage-badges">' + badges + '</div>' : '') +
          '</div>' +
          '<div class="storage-actions">' +
            runButton +
            '<button class="btn danger" data-index="' + index + '" data-action="delete" aria-label="Remove ' + esc(modelLabel(model.fileName)) + ', ' + esc(formatBytes(model.sizeBytes)) + '"' + disabled + '>Remove</button>' +
          '</div>' +
        '</div>';
      }).join('');

      for (const button of els.storageList.querySelectorAll('button[data-index]')) {
        button.addEventListener('click', () => {
          if (state.setupOperationRunning) return;
          const model = models[Number(button.dataset.index)];
          if (!model) return;
          if (button.dataset.action === 'run') {
            state.modelSwitchRunning = true;
            state.setupOperationRunning = true;
            state.progressMessage = 'Starting ' + model.fileName + '…';
            render();
            setStatus(state.progressMessage);
            vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.START_DOWNLOADED_MODEL}', id: model.id });
            return;
          }
          vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.DELETE_DOWNLOADED_MODEL}', id: model.id });
        });
      }
    }

    function modelLabel(fileName) {
      const lower = String(fileName).toLowerCase();
      if (lower.includes('qwen3-coder')) return 'Max: Qwen3-Coder-30B-A3B';
      if (lower.includes('gemma-4-26b')) return 'Mini: Gemma 4 26B A4B';
      if (lower.includes('gemma-4-31b')) return 'Gemma 4 31B';
      if (lower.includes('qwen2.5-coder')) return 'Qwen2.5 Coder';
      return String(fileName).replace(/\\.gguf(?:\\.part)?$/i, '').replace(/[-_]+/g, ' ');
    }

    /* A 🔁-shaped swap glyph in currentColor — crisp at 14px where an emoji
       would not be, and it inherits the theme instead of fighting it. */
    function swapIcon() {
      return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12.8 5.6A5.4 5.4 0 0 0 3.5 6.3"/><path d="M12.9 2.5v3.1h-3.1"/>' +
        '<path d="M3.2 10.4a5.4 5.4 0 0 0 9.3-.7"/><path d="M3.1 13.5v-3.1h3.1"/></svg>';
    }

    function modelProgressName() {
      return state.selectedModelName || 'model';
    }

    function resetCursorActionStateIfEndpointChanged(nextViewModel) {
      const currentViewModel = state.cursorSetupViewModel;
      if (!currentViewModel || !nextViewModel) return;
      if (
        currentViewModel.baseUrl !== nextViewModel.baseUrl ||
        currentViewModel.modelId !== nextViewModel.modelId ||
        currentViewModel.isRunning !== nextViewModel.isRunning
      ) {
        state.verification = undefined;
        state.settings = undefined;
        state.copyResults = {};
        state.connectMessage = '';
      }
    }

    /* Every terminal message (completion or error) ends ALL operation
       modes through this one chokepoint — a handler clearing its own
       flags piecemeal once left modelSwitchRunning set after an
       install-backed switch completed, freezing the panel at "Starting
       local agent" until an unrelated status refresh. */
    function endSetupOperation() {
      state.automagicalSetupRunning = false;
      state.modelSwitchRunning = false;
      state.cursorConnectRunning = false;
      state.setupOperationRunning = false;
      state.progressMessage = '';
      state.progressPercent = undefined;
      state.selectedModelName = '';
    }

    function setStatus(text) {
      els.status.textContent = text;
    }

    function formatBytes(bytes) {
      if (bytes === undefined || Number.isNaN(bytes)) return 'Unknown';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
      }
      return value.toFixed(unit === 0 ? 0 : 1) + ' ' + units[unit];
    }

    function formatRate(bytesPerSecond) {
      return formatBytes(bytesPerSecond) + '/s';
    }

    function esc(value) {
      return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.READY}' });
  </script>
</body>
</html>`;
}
