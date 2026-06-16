export function setupPanelHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Local Motion</title>
  <style>
    :root {
      color-scheme: light dark;
      --line: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
      --muted: color-mix(in srgb, var(--vscode-foreground) 62%, transparent);
      --ok: #2f8f5b;
      --bad: #c94f4f;
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      border-bottom: 1px solid var(--line);
      padding-bottom: 18px;
    }
    h1 {
      font-size: 26px;
      line-height: 1.2;
      margin: 0 0 6px;
      font-weight: 600;
      letter-spacing: 0;
    }
    h2 {
      font-size: 14px;
      margin: 0 0 10px;
      font-weight: 600;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
    }
    section {
      padding: 22px 0;
      border-bottom: 1px solid var(--line);
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.65fr);
      gap: 16px;
      align-items: stretch;
      padding: 22px 0;
      border-bottom: 1px solid var(--line);
    }
    .agent-panel, .side-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      background: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground));
    }
    .agent-state {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .state-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: transparent;
      flex: 0 0 auto;
    }
    .state-dot.ready {
      background: var(--ok);
      border-color: var(--ok);
    }
    .state-dot.busy {
      background: var(--vscode-progressBar-background, var(--vscode-focusBorder));
      border-color: var(--vscode-progressBar-background, var(--vscode-focusBorder));
    }
    .state-title {
      font-size: 20px;
      line-height: 1.25;
      font-weight: 600;
      margin: 0;
      letter-spacing: 0;
    }
    .primary-actions {
      display: flex;
      gap: 8px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .memory-line, .cursor-line {
      margin-top: 10px;
      color: var(--muted);
      line-height: 1.45;
    }
    details.advanced {
      border-bottom: 1px solid var(--line);
      padding: 0;
    }
    details.advanced > summary {
      cursor: pointer;
      padding: 18px 0;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    details.advanced > .advanced-body {
      padding-bottom: 22px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      min-height: 58px;
    }
    .metric span, label, .meta {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 4px;
    }
    .metric strong {
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    input {
      flex: 1;
      min-width: 0;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--line));
      border-radius: 5px;
      padding: 9px 10px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    button {
      height: 34px;
      padding: 0 12px;
      border-radius: 5px;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font-family: var(--vscode-font-family);
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .list {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }
    .item {
      width: 100%;
      text-align: left;
      height: auto;
      padding: 10px;
      color: var(--vscode-foreground);
      background: transparent;
      border: 1px solid var(--line);
    }
    .item.selected {
      border-color: var(--vscode-focusBorder);
      background: color-mix(in srgb, var(--vscode-focusBorder) 14%, transparent);
    }
    .item strong {
      display: block;
      margin-bottom: 4px;
      overflow-wrap: anywhere;
    }
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      border: 1px solid var(--line);
      margin-right: 8px;
    }
    .status.ok {
      color: var(--ok);
      border-color: color-mix(in srgb, var(--ok) 45%, transparent);
    }
    .status.bad {
      color: var(--bad);
      border-color: color-mix(in srgb, var(--bad) 45%, transparent);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .setup-grid {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }
    .setup-field {
      display: grid;
      grid-template-columns: 170px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
    }
    .setup-field code {
      overflow-wrap: anywhere;
      color: var(--vscode-editor-foreground);
    }
    .setup-field .meta {
      grid-column: 2 / 4;
      margin: 0;
    }
    .checklist {
      margin: 14px 0 0;
      padding-left: 20px;
      color: var(--muted);
      line-height: 1.5;
    }
    .notice {
      margin-top: 10px;
      color: var(--muted);
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground));
    }
    @media (max-width: 760px) {
      main { padding: 18px; }
      header, .row { flex-direction: column; align-items: stretch; }
      .hero { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .setup-field { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Local Motion</h1>
        <p>A local coding agent for Cursor. Turn it on when you need it, free the memory when you do not.</p>
      </div>
    </header>

    <div class="hero">
      <section class="agent-panel">
        <div class="agent-state">
          <span id="agentDot" class="state-dot"></span>
          <p id="agentTitle" class="state-title">Checking Local Motion...</p>
        </div>
        <p id="agentSummary">Local Motion will choose a model that fits this Mac and connect it to Cursor.</p>
        <div class="primary-actions">
          <button id="primaryAction">Turn On Local Agent</button>
          <button id="memoryAction" class="secondary">Free Memory</button>
        </div>
      </section>

      <section class="side-panel">
        <h2>Cursor</h2>
        <p id="cursorSummary" class="cursor-line">Waiting for the local endpoint. When it is ready, Cursor Settings > Models needs Add Custom Model.</p>
        <div class="actions">
          <button id="cursorPrimary" class="secondary">Connect Cursor</button>
        </div>
        <p id="memorySummary" class="memory-line">Memory is managed automatically.</p>
      </section>
    </div>

    <details class="advanced">
      <summary>Advanced model controls</summary>
      <div class="advanced-body">
        <section>
          <h2>Model</h2>
          <label for="repo">Hugging Face GGUF repository</label>
          <div class="row">
            <input id="repo" spellcheck="false">
            <button id="load">Load Quantizations</button>
            <button id="search" class="secondary">Search</button>
          </div>
          <div id="searchResults" class="list"></div>
          <div id="quantizations" class="list"></div>
          <div class="actions">
            <button id="install" disabled>Install and Turn On</button>
          </div>
        </section>
      </div>
    </details>

    <details class="advanced" id="cursorDetails">
      <summary>Cursor connection details</summary>
      <div class="advanced-body">
        <section>
          <h2>Cursor</h2>
          <p id="runtime">Start a model to get the Cursor base URL and model ID.</p>
          <div class="actions">
            <button id="prepareCursor">Connect Cursor</button>
            <button id="verifyCursor" class="secondary">Verify Endpoint</button>
            <button id="cursorSettings" class="secondary">Open Settings</button>
          </div>
          <div id="cursorSetupFields" class="setup-grid"></div>
        </section>
      </div>
    </details>

    <details class="advanced">
      <summary>Mac and memory details</summary>
      <div class="advanced-body">
        <section>
          <h2>This Mac</h2>
          <div id="machine" class="grid"></div>
        </section>
      </div>
    </details>

    <details class="advanced">
      <summary>Activity log</summary>
      <div class="advanced-body">
        <section>
          <h2>Status</h2>
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
      copyResults: {},
      automagicalSetupRunning: false,
      progressMessage: ''
    };
    const els = {
      repo: document.getElementById('repo'),
      machine: document.getElementById('machine'),
      searchResults: document.getElementById('searchResults'),
      quantizations: document.getElementById('quantizations'),
      install: document.getElementById('install'),
      status: document.getElementById('status'),
      runtime: document.getElementById('runtime'),
      cursorSetupFields: document.getElementById('cursorSetupFields'),
      agentDot: document.getElementById('agentDot'),
      agentTitle: document.getElementById('agentTitle'),
      agentSummary: document.getElementById('agentSummary'),
      primaryAction: document.getElementById('primaryAction'),
      memoryAction: document.getElementById('memoryAction'),
      cursorPrimary: document.getElementById('cursorPrimary'),
      cursorSummary: document.getElementById('cursorSummary'),
      memorySummary: document.getElementById('memorySummary')
    };

    document.getElementById('load').addEventListener('click', () => {
      vscode.postMessage({ command: 'quantizations', repoId: els.repo.value });
    });
    document.getElementById('search').addEventListener('click', () => {
      vscode.postMessage({ command: 'search', query: els.repo.value });
    });
    document.getElementById('install').addEventListener('click', () => {
      vscode.postMessage({ command: 'installRun', candidate: state.selected });
    });
    document.getElementById('primaryAction').addEventListener('click', () => {
      if (state.runtime && state.runtime.running) {
        if (state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'current') {
          vscode.postMessage({ command: 'stop' });
          return;
        }
        vscode.postMessage({ command: 'prepareCursor' });
        return;
      }
      vscode.postMessage({ command: 'automagicalSetup' });
    });
    document.getElementById('memoryAction').addEventListener('click', () => {
      vscode.postMessage({ command: 'stop' });
    });
    document.getElementById('cursorPrimary').addEventListener('click', () => {
      if (state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'current') {
        vscode.postMessage({ command: 'openCursorSettings' });
        return;
      }
      vscode.postMessage({ command: 'prepareCursor' });
    });
    document.getElementById('prepareCursor').addEventListener('click', () => {
      vscode.postMessage({ command: 'prepareCursor' });
    });
    document.getElementById('verifyCursor').addEventListener('click', () => {
      vscode.postMessage({ command: 'verifyCursorEndpoint' });
    });
    document.getElementById('cursorSettings').addEventListener('click', () => {
      vscode.postMessage({ command: 'openCursorSettings' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        els.repo.value = message.defaultRepo;
        state.installed = message.installed;
        state.runtime = message.runtime;
        state.machine = message.machine;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderMachine(message.machine);
        renderRuntime();
        setStatus('Ready.');
      }
      if (message.type === 'searchResults') renderSearchResults(message.results);
      if (message.type === 'quantizations') renderQuantizations(message.quantizations);
      if (message.type === 'installProgress') {
        state.progressMessage = 'Downloading ' + Math.round(message.progress.percent || 0) + '%';
        renderAgentSurface();
        setStatus(state.progressMessage);
      }
      if (message.type === 'automagicalSetupStarted') {
        state.automagicalSetupRunning = true;
        state.progressMessage = 'Choosing a model that fits this Mac.';
        document.getElementById('install').disabled = true;
        renderAgentSurface();
        setStatus('Selecting a compatible model, starting it, and preparing Cursor.');
      }
      if (message.type === 'installed') {
        state.installed = message.installed;
        state.runtime = message.runtime;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.cursor && message.cursor.verification;
        state.settings = message.cursor && message.cursor.settings;
        if (message.cursor && message.cursor.copy) state.copyResults.setupBlock = message.cursor.copy;
        state.automagicalSetupRunning = false;
        state.progressMessage = '';
        renderRuntime();
        setStatus(message.cursor
          ? [state.verification && state.verification.message, state.copyResults.setupBlock && state.copyResults.setupBlock.message, state.settings && state.settings.message].filter(Boolean).join(' ')
          : 'Running ' + message.installed.displayName);
      }
      if (message.type === 'runtime') {
        state.runtime = message.runtime;
        state.progressMessage = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderRuntime();
        setStatus(message.runtime.message);
      }
      if (message.type === 'automagicalSetupComplete') {
        state.automagicalSetupRunning = false;
        state.progressMessage = '';
        state.installed = message.installed;
        state.runtime = message.runtime;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.cursor && message.cursor.verification;
        state.settings = message.cursor && message.cursor.settings;
        if (message.cursor && message.cursor.copy) state.copyResults.setupBlock = message.cursor.copy;
        document.getElementById('install').disabled = !state.selected;
        renderRuntime();
        setStatus([state.verification && state.verification.message, state.copyResults.setupBlock && state.copyResults.setupBlock.message, state.settings && state.settings.message].filter(Boolean).join(' '));
      }
      if (message.type === 'cursorSetupViewModel') {
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        renderCursorSetup();
        setStatus(message.cursorSetupViewModel.statusMessage);
      }
      if (message.type === 'cursorSetupPrepared') {
        state.cursorSetupViewModel = message.viewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.verification;
        state.settings = message.settings;
        if (message.copy) state.copyResults.setupBlock = message.copy;
        renderCursorSetup();
        setStatus([message.verification && message.verification.message, message.copy && message.copy.message, message.settings && message.settings.message].filter(Boolean).join(' '));
      }
      if (message.type === 'cursorCopyResult') {
        state.copyResults[message.key] = { ok: message.ok, message: message.message };
        if (message.cursorSetupFreshness) state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderCursorSetup();
        setStatus(message.message);
      }
      if (message.type === 'cursorEndpointVerification') {
        state.verification = message;
        renderCursorSetup();
        setStatus(message.message);
      }
      if (message.type === 'cursorSettingsOpened') {
        state.settings = message;
        renderCursorSetup();
        setStatus(message.message);
      }
      if (message.type === 'error') {
        state.automagicalSetupRunning = false;
        state.progressMessage = '';
        setStatus(message.message);
        document.getElementById('install').disabled = !state.selected;
        renderAgentSurface();
      }
    });

    function renderMachine(machine) {
      state.machine = machine;
      els.machine.innerHTML = [
        ['CPU', machine.cpu],
        ['Architecture', machine.arch + (machine.appleSilicon ? ' Apple Silicon' : '')],
        ['Memory', machine.memory + ' total'],
        ['Budget', machine.budget],
        ['Available RAM', machine.availableMemory],
        ['Free disk', machine.disk],
        ['Storage', machine.storageRoot]
      ].map(([label, value]) => '<div class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('');
      renderAgentSurface();
    }

    function renderSearchResults(results) {
      els.searchResults.innerHTML = results.map(result =>
        '<button class="item" data-repo="' + esc(result.repoId) + '"><strong>' + esc(result.repoId) + '</strong><span class="meta">' +
        esc(String(result.downloads || 0)) + ' downloads</span></button>'
      ).join('');
      for (const item of els.searchResults.querySelectorAll('.item')) {
        item.addEventListener('click', () => {
          els.repo.value = item.dataset.repo;
          vscode.postMessage({ command: 'quantizations', repoId: item.dataset.repo });
        });
      }
    }

    function renderQuantizations(items) {
      state.selected = undefined;
      els.install.disabled = true;
      els.quantizations.innerHTML = items.map((item, index) => {
        const ok = item.compatibility.status === 'compatible';
        return '<button class="item" data-index="' + index + '">' +
          '<strong>' + esc(item.quantization) + ' ' + esc(item.fileName) + '</strong>' +
          '<span class="status ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Compatible' : 'Not compatible') + '</span>' +
          '<span class="meta">' + esc(formatBytes(item.sizeBytes)) + ' file, ' + esc(formatBytes(item.compatibility.requiredMemoryBytes)) + ' runtime memory</span>' +
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

    function renderRuntime() {
      const runtime = state.runtime || {};
      if (!runtime.running) {
        els.runtime.textContent = runtime.message || 'No model is running.';
        renderCursorSetup();
        renderAgentSurface();
        return;
      }
      els.runtime.textContent = runtime.message + ' Base URL: ' + runtime.baseUrl + ' Model ID: ' + runtime.modelId;
      renderCursorSetup();
      renderAgentSurface();
    }

    function renderCursorSetup() {
      const viewModel = state.cursorSetupViewModel;
      if (!viewModel) {
        els.cursorSetupFields.textContent = '';
        document.getElementById('prepareCursor').disabled = true;
        document.getElementById('verifyCursor').disabled = true;
        document.getElementById('cursorSettings').disabled = true;
        renderAgentSurface();
        return;
      }
      document.getElementById('prepareCursor').disabled = !viewModel.isRunning;
      document.getElementById('verifyCursor').disabled = !viewModel.isRunning;
      document.getElementById('cursorSettings').disabled = !viewModel.isRunning;
      const fields = [
        ['apiKey', 'OpenAI API Key', viewModel.apiKey],
        ['baseUrl', 'Override OpenAI Base URL', viewModel.baseUrl],
        ['modelId', 'Add Custom Model', viewModel.modelId],
        ['setupBlock', 'Full setup block', viewModel.setupBlock]
      ];
      const statusLines = [
        state.cursorSetupFreshness && state.cursorSetupFreshness.status !== 'not-copied' && state.cursorSetupFreshness.message,
        state.verification && state.verification.message,
        state.settings && state.settings.message
      ].filter(Boolean);
      els.cursorSetupFields.innerHTML =
        fields.map(([key, label, value]) => {
          const result = state.copyResults[key];
          const disabled = key !== 'apiKey' && !viewModel.isRunning;
          return '<div class="setup-field">' +
            '<span>' + esc(label) + '</span>' +
            '<code>' + esc(value || 'Start a model first') + '</code>' +
            '<button class="copy" data-key="' + esc(key) + '"' + (disabled ? ' disabled' : '') + '>Copy</button>' +
            (result ? '<span class="meta">' + esc(result.message) + '</span>' : '') +
            '</div>';
        }).join('') +
        (state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'stale' && viewModel.isRunning
          ? '<div class="actions"><button class="copy" data-key="setupBlock">Copy Updated Setup</button></div>'
          : '') +
        '<ol class="checklist">' + (viewModel.steps || []).map(step => '<li>' + esc(step) + '</li>').join('') + '</ol>' +
        (statusLines.length ? '<p class="notice">' + esc(statusLines.join(' ')) + '</p>' : '');
      for (const button of els.cursorSetupFields.querySelectorAll('button.copy')) {
        button.addEventListener('click', () => {
          vscode.postMessage({ command: 'copyCursorValue', key: button.dataset.key });
        });
      }
      renderAgentSurface();
    }

    function renderAgentSurface() {
      const runtime = state.runtime || {};
      const running = Boolean(runtime.running);
      const busy = state.automagicalSetupRunning;
      const current = state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'current';
      const stale = state.cursorSetupFreshness && state.cursorSetupFreshness.status === 'stale';

      els.agentDot.className = 'state-dot' + (running ? ' ready' : busy ? ' busy' : '');
      if (busy) {
        els.agentTitle.textContent = 'Starting local agent';
        els.agentSummary.textContent = state.progressMessage || 'Local Motion is choosing the best fit, loading it, and preparing Cursor.';
      } else if (running && current) {
        els.agentTitle.textContent = 'Local agent is ready for Cursor';
        els.agentSummary.textContent = 'The model is loaded locally. If Cursor does not list it yet, open Cursor Settings > Models and click Add Custom Model.';
      } else if (running) {
        els.agentTitle.textContent = 'Local agent is loaded';
        els.agentSummary.textContent = stale
          ? 'Cursor setup values need a refresh before Cursor uses this local model.'
          : 'Connect Cursor once. Local Motion will copy the values; Cursor still needs Add Custom Model.';
      } else {
        els.agentTitle.textContent = 'Local agent is off';
        els.agentSummary.textContent = 'Turn it on and Local Motion will choose a model, load it, and prepare Cursor.';
      }

      els.primaryAction.textContent = running ? (current ? 'Free Memory' : 'Connect Cursor') : 'Turn On Local Agent';
      els.primaryAction.disabled = busy;
      els.memoryAction.textContent = 'Free Memory';
      els.memoryAction.disabled = busy || !running;
      els.cursorPrimary.disabled = busy || !running;
      els.cursorPrimary.textContent = current ? 'Open Cursor Models' : 'Connect Cursor';

      if (!running) {
        els.cursorSummary.textContent = 'Cursor will get Add Custom Model values after the local agent starts.';
      } else if (current) {
        els.cursorSummary.textContent = 'Cursor has the current Local Motion endpoint. Select the Local Motion model when it appears in Cursor.';
      } else if (stale) {
        els.cursorSummary.textContent = 'Cursor may still point at an old local endpoint. Refresh the connection.';
      } else {
        els.cursorSummary.textContent = 'One handoff remains: copy the setup values, open Cursor Models, and click Add Custom Model.';
      }

      if (state.machine) {
        els.memorySummary.textContent = running
          ? 'Free Memory unloads the local model immediately. Available now: ' + state.machine.availableMemory + '.'
          : 'Local Motion will stay within this Mac\\'s conservative memory budget: ' + state.machine.budget + '.';
      }
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

    function esc(value) {
      return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}
