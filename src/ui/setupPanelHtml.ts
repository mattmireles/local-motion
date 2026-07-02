import { setupPanelStorageMarkup } from "./setupPanelStorage";
import { setupPanelStyles } from "./setupPanelStyles";
import { SETUP_REQUEST_COMMAND, SETUP_RESPONSE_TYPE } from "../setupProtocol";

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
    <div class="brand">
      <span id="brandDot" class="dot off" aria-hidden="true"></span>
      <h1>Local Motion</h1>
    </div>

    <div id="stage" class="stage" role="status" aria-live="polite">
      <p id="headline" class="headline">Checking Local Motion…</p>
      <p id="subline" class="subline">Runs a coding model on this Mac for Cursor.</p>
    </div>
    <div id="progress" class="progress hidden" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100"><div id="progressFill" class="fill"></div></div>

    <section id="modelChooser" class="model-chooser" aria-label="Local models">
      <h2>Model</h2>
      <div id="modelOptions" class="model-options" role="radiogroup" aria-label="Choose local model"></div>
    </section>

    <div id="connect" class="connect hidden">
      <p class="connect-lead">In Cursor: Settings → Models → Add Custom Model. Copy each value into the matching field.</p>
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
          <h2>Model</h2>
          <label for="repo">Hugging Face GGUF repository</label>
          <div class="row">
            <input id="repo" spellcheck="false">
            <button id="load" class="btn ghost">Load</button>
            <button id="search" class="btn ghost">Search</button>
          </div>
          <div id="searchResults" class="list"></div>
          <div id="quantizations" class="list"></div>
          <div class="actions">
            <button id="install" class="btn ghost" disabled>Install and Turn On</button>
          </div>
        </section>

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
      selected: undefined,
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
      brandDot: document.getElementById('brandDot'),
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
      connectNote: document.getElementById('connectNote'),
      primary: document.getElementById('primary'),
      metaLine: document.getElementById('metaLine'),
      storageSummary: document.getElementById('storageSummary'),
      storageText: document.getElementById('storageText'),
      manageStorage: document.getElementById('manageStorage'),
      storagePanel: document.getElementById('storagePanel'),
      storageList: document.getElementById('storageList'),
      repo: document.getElementById('repo'),
      load: document.getElementById('load'),
      search: document.getElementById('search'),
      machine: document.getElementById('machine'),
      searchResults: document.getElementById('searchResults'),
      quantizations: document.getElementById('quantizations'),
      install: document.getElementById('install'),
      status: document.getElementById('status')
    };

    /* The primary control binds to runtime on/off only. It never morphs
       into Connect, and never into a destructive third action. */
    els.primary.addEventListener('click', () => {
      // Disabled is the single source of truth for "busy". Never gate the
      // toggle on a setup flag — that is what made Turn Off a dead button.
      if (els.primary.disabled) return;
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

    els.load.addEventListener('click', () => {
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.QUANTIZATIONS}', repoId: els.repo.value });
    });
    els.search.addEventListener('click', () => {
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.SEARCH}', query: els.repo.value });
    });
    els.install.addEventListener('click', () => {
      state.setupOperationRunning = true;
      render();
      vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.INSTALL_RUN}', candidate: state.selected });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === '${SETUP_RESPONSE_TYPE.STATE}') {
        els.repo.value = message.defaultRepo;
        state.installed = message.installed;
        state.runtime = message.runtime;
        state.machine = message.machine;
        updateModelOptions(message);
        updateDownloadedStorage(message);
        /* A model switch spans several runtime status changes (old model
           stops, new one loads), each of which pushes a fresh STATE. The
           switch is only over when a state arrives with the model running —
           until then the surface must keep saying "starting", not "off". */
        if (state.modelSwitchRunning && message.runtime && message.runtime.running) {
          state.modelSwitchRunning = false;
          state.progressMessage = '';
        }
        state.setupOperationRunning = state.modelSwitchRunning || state.cursorConnectRunning;
        state.errorMessage = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderMachine(message.machine);
        render();
        setStatus(state.modelSwitchRunning ? state.progressMessage : 'Ready.');
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.SEARCH_RESULTS}') renderSearchResults(message.results);
      if (message.type === '${SETUP_RESPONSE_TYPE.QUANTIZATIONS}') renderQuantizations(message.quantizations);
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
        els.install.disabled = true;
        render();
        setStatus('Selecting compatible Max and Mini downloads, starting the selected model, and preparing Cursor.');
      }
      if (message.type === '${SETUP_RESPONSE_TYPE.INSTALLED}') {
        state.installed = message.installed;
        state.runtime = message.runtime;
        updateModelOptions(message);
        updateDownloadedStorage(message);
        state.errorMessage = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.cursor && message.cursor.verification;
        state.settings = message.cursor && message.cursor.settings;
        if (message.cursor && message.cursor.copy) state.copyResults.setupBlock = message.cursor.copy;
        state.automagicalSetupRunning = false;
        state.setupOperationRunning = false;
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
        render();
        setStatus(message.cursor
          ? [state.verification && state.verification.message, state.copyResults.setupBlock && state.copyResults.setupBlock.message, state.settings && state.settings.message].filter(Boolean).join(' ')
          : 'Running ' + message.installed.displayName);
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
        state.automagicalSetupRunning = false;
        state.setupOperationRunning = false;
        state.errorMessage = '';
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
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
        els.install.disabled = !state.selected;
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
        state.automagicalSetupRunning = false;
        state.modelSwitchRunning = false;
        state.cursorConnectRunning = false;
        state.setupOperationRunning = false;
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.errorMessage = message.message || 'Something went wrong.';
        els.install.disabled = !state.selected;
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
        : busy ? 'starting' : 'off';
      renderModelOptions();
      renderStorage();

      // Brand status dot: off / busy / on.
      els.brandDot.className = 'dot ' + (running ? 'on' : busy ? 'busy' : 'off');

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

      els.primary.textContent = 'Starting…';
      els.primary.removeAttribute('title');
      els.primary.disabled = true;
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
        els.valModelId.textContent = viewModel.modelId || 'Local Motion';
        els.valApiKey.textContent = viewModel.apiKey || '';
        els.valBaseUrl.textContent = viewModel.baseUrl || (viewModel.statusMessage || 'Cursor connection is not ready.');
        els.valSetupBlock.textContent = cursorReady ? 'Model name, API key, and Base URL' : 'Unavailable until Cursor connection is ready';
        els.copySetupBlock.textContent = state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'stale'
          ? 'Copy Updated Setup'
          : 'Copy Full Setup';
        const freshnessMessage = state.cursorSetupFreshness && state.cursorSetupFreshness.message;
        els.connectNote.textContent = state.connectMessage || freshnessMessage || viewModel.statusMessage || '';
        els.connectNote.style.display = els.connectNote.textContent ? 'block' : 'none';
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
    /* Advanced surface: model controls, Mac details, activity log.        */
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
        const detail = [
          option.summary,
          option.quantization,
          option.requiredMemory ? option.requiredMemory + ' runtime memory' : '',
          option.downloadSize ? option.downloadSize + ' download' : ''
        ].filter(Boolean).join(' · ');
        return '<div class="model-option' + (selected ? ' selected' : '') + (active ? ' active' : '') + '" data-option-id="' + esc(option.id) + '" role="radio" tabindex="0" aria-checked="' + (selected ? 'true' : 'false') + '"' + (unavailable ? ' title="' + esc(option.statusText) + '"' : '') + '>' +
          '<span class="model-title"><strong>' + esc(option.label) + '</strong><span>' + esc(option.modelName) + '</span></span>' +
          '<span class="model-meta">' + esc(detail || option.repoId) + '</span>' +
          '<span class="model-status">' + esc(option.statusText) + '</span>' +
          '<span class="model-repo">' + esc(option.repoId) + '</span>' +
          '<span class="model-replace"><input data-repo-input="' + esc(option.id) + '" value="' + esc(option.repoId) + '" aria-label="Hugging Face repository for ' + esc(option.label) + '"><button class="btn ghost" data-replace-option="' + esc(option.id) + '"' + (state.setupOperationRunning ? ' disabled' : '') + '>Replace</button></span>' +
        '</div>';
      }).join('');

      for (const optionEl of els.modelOptions.querySelectorAll('[data-option-id]')) {
        optionEl.addEventListener('click', event => {
          if (event.target && (event.target.closest('input') || event.target.closest('button'))) return;
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
      for (const button of els.modelOptions.querySelectorAll('button[data-replace-option]')) {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const optionId = button.dataset.replaceOption;
          const input = els.modelOptions.querySelector('input[data-repo-input="' + optionId + '"]');
          replaceModelOption(optionId, input ? input.value : '');
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

    function renderSearchResults(results) {
      els.searchResults.innerHTML = results.map(result =>
        '<button class="item" data-repo="' + esc(result.repoId) + '"><strong>' + esc(result.repoId) + '</strong><span class="meta">' +
        esc(String(result.downloads || 0)) + ' downloads</span></button>'
      ).join('');
      for (const item of els.searchResults.querySelectorAll('.item')) {
        item.addEventListener('click', () => {
          els.repo.value = item.dataset.repo;
          vscode.postMessage({ command: '${SETUP_REQUEST_COMMAND.QUANTIZATIONS}', repoId: item.dataset.repo });
        });
      }
    }

    function renderQuantizations(items) {
      state.selected = undefined;
      els.install.disabled = true;
      els.quantizations.innerHTML = items.map((item, index) => {
        const ok = item.compatibility.status === 'compatible';
        const name = candidateDisplayName(item);
        return '<button class="item" data-index="' + index + '">' +
          '<strong>' + esc(name) + '</strong>' +
          '<span class="status ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Compatible' : 'Not compatible') + '</span>' +
          '<span class="meta">' + esc(item.quantization) + ' · ' + esc(formatBytes(item.sizeBytes)) + ' file · ' + esc(formatBytes(item.compatibility.requiredMemoryBytes)) + ' runtime memory</span>' +
          '<span class="meta">' + esc(item.compatibility.reasons.join(' ')) + '</span>' +
          '</button>';
      }).join('');
      const buttons = Array.from(els.quantizations.querySelectorAll('.item'));
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('selected'));
          button.classList.add('selected');
          state.selected = items[index];
          els.install.disabled = state.automagicalSetupRunning;
        });
      });
      const firstCompatible = items.findIndex(item => item.compatibility.status === 'compatible');
      if (firstCompatible >= 0 && buttons[firstCompatible]) buttons[firstCompatible].click();
      if (state.automagicalSetupRunning) {
        els.install.disabled = true;
        return;
      }
      setStatus(items.length ? 'Compatible quantization selected. Turn on the local agent or install manually.' : 'No GGUF files found in this repository.');
    }

    function candidateDisplayName(item) {
      const repoName = String(item.repoId || '').split('/').pop() || String(item.repoId || '');
      const fileName = String(item.fileName || '').replace(/\\.gguf$/i, '');
      return (repoName && fileName) ? repoName + ' ' + fileName : (fileName || repoName || String(item.quantization || 'Model'));
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
