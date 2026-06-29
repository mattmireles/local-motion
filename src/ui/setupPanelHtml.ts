import { setupPanelStorageMarkup, setupPanelStorageScript, setupPanelStorageStyles } from "./setupPanelStorage";

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
      --line: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      --muted: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
      --faint: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
      --ok: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #2f8f5b));
      --bad: var(--vscode-testing-iconFailed, var(--vscode-errorForeground, #c94f4f));
      --busy: var(--vscode-progressBar-background, var(--vscode-focusBorder));
      --panel: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground));
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 22px 18px 28px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    /* Chrome: the product mark whispers. */
    .brand {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 26px;
    }
    .brand h1 {
      font-size: 17px;
      line-height: 1.2;
      margin: 0;
      font-weight: 600;
      letter-spacing: 0;
      color: var(--muted);
    }
    .brand .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--faint);
      flex: 0 0 auto;
      transform: translateY(1px);
      transition: background-color 240ms ease;
    }
    .brand .dot.on { background: var(--ok); }
    .brand .dot.off { background: var(--faint); }
    .brand .dot.busy {
      background: var(--busy);
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: translateY(1px) scale(1); }
      50% { opacity: 0.4; transform: translateY(1px) scale(0.78); }
    }

    /* The live state is the loudest thing on screen. */
    .stage { padding: 4px 0 6px; }
    .headline {
      font-size: 20px;
      line-height: 1.25;
      font-weight: 600;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .headline.error { color: var(--bad); }
    .subline {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 13px;
    }
    .subline.error { color: var(--bad); }

    /* Honest motion: a real determinate bar during download. */
    .progress {
      margin-top: 16px;
      height: 4px;
      border-radius: 999px;
      background: var(--line);
      overflow: hidden;
    }
    .progress > .fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: var(--busy);
      transition: width 320ms ease;
    }
    .progress.hidden { display: none; }

    /* The one primary control, in one fixed slot. */
    .primary-slot { margin-top: 22px; }
    .btn {
      appearance: none;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      cursor: pointer;
      border-radius: 6px;
      white-space: nowrap;
    }
    .btn.primary {
      width: 100%;
      min-height: 38px;
      padding: 0 16px;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font-weight: 600;
      transition: opacity 160ms ease;
    }
    .btn.primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
    }
    .btn:disabled { opacity: 0.5; cursor: default; }
    /* Keyboard focus must be visible inside the webview, not left to UA defaults. */
    .btn:focus-visible,
    .item:focus-visible,
    input:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    /* Quiet, ghost-weight secondary actions. */
    .btn.ghost {
      min-height: 32px;
      padding: 0 12px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-button-border, var(--line));
    }
    .btn.ghost:hover:not(:disabled) {
      background: color-mix(in srgb, var(--vscode-foreground) 7%, transparent);
    }
    /* The lead action inside a card carries weight without being full-width. */
    .btn.cta {
      min-height: 32px;
      padding: 0 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid var(--vscode-button-border, transparent);
      font-weight: 600;
    }
    .btn.cta:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
    }
    .btn.link {
      min-height: 0;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground, var(--vscode-foreground));
      text-decoration: none;
      font-size: 12px;
    }
    .btn.link:hover { text-decoration: underline; }
    .btn.danger {
      min-height: 28px;
      padding: 0 10px;
      background: transparent;
      color: var(--bad);
      border: 1px solid color-mix(in srgb, var(--bad) 42%, transparent);
    }
    .btn.danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--bad) 10%, transparent);
    }

    /* One quiet metadata line under the ON state. */
    .meta-line {
      margin-top: 16px;
      color: var(--faint);
      font-size: 12px;
      line-height: 1.4;
    }
    ${setupPanelStorageStyles()}

    /* The connect beat: its own element, never the primary slot. */
    .connect {
      margin-top: 20px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      background: var(--panel);
    }
    .connect.hidden { display: none; }
    .connect .connect-lead {
      margin: 0 0 14px;
      color: var(--muted);
      line-height: 1.5;
    }
    /* Each Cursor value sits on its own row, copyable on its own. */
    .fields { display: grid; gap: 12px; margin-bottom: 14px; }
    .field label {
      display: block;
      margin-bottom: 4px;
      color: var(--faint);
      font-size: 11px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .field-row { display: flex; gap: 8px; align-items: stretch; }
    .field-value {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      overflow-wrap: anywhere;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-editor-foreground, var(--vscode-foreground));
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground));
    }
    .field-row .copy { flex: 0 0 auto; align-self: center; }
    .connect .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .connect .note {
      margin-top: 10px;
      color: var(--faint);
      font-size: 12px;
    }

    /* One disclosure. Four competing triangles become one. */
    details.advanced {
      margin-top: 26px;
      border-top: 1px solid var(--line);
    }
    details.advanced > summary {
      cursor: pointer;
      list-style: none;
      padding: 16px 0 4px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }
    details.advanced > summary::-webkit-details-marker { display: none; }
    details.advanced > summary::before {
      content: "›";
      display: inline-block;
      margin-right: 8px;
      transition: transform 160ms ease;
    }
    details.advanced[open] > summary::before { transform: rotate(90deg); }
    .advanced-body { padding: 8px 0 4px; }
    .advanced-block { padding: 16px 0; }
    .advanced-block + .advanced-block { border-top: 1px solid var(--line); }
    .advanced-block h2 {
      font-size: 12px;
      margin: 0 0 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--faint);
    }

    label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
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
      border-radius: 6px;
      padding: 9px 10px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .list {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }
    .item {
      width: 100%;
      text-align: left;
      padding: 10px;
      color: var(--vscode-foreground);
      background: transparent;
      border: 1px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .item.selected {
      border-color: var(--vscode-focusBorder);
      background: color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent);
    }
    .item strong {
      display: block;
      margin-bottom: 4px;
      overflow-wrap: anywhere;
    }
    .item .meta {
      display: block;
      color: var(--faint);
      font-size: 12px;
      margin-top: 4px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      border: 1px solid var(--line);
    }
    .status.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, transparent); }
    .status.bad { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 45%, transparent); }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
    }
    .metric span {
      display: block;
      color: var(--faint);
      font-size: 11px;
      margin-bottom: 4px;
    }
    .metric strong {
      font-size: 13px;
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    pre#status {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.5;
      color: var(--muted);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground));
      max-height: 220px;
      overflow-y: auto;
    }

    /* A quiet settle when the ON state arrives. */
    .settle { animation: settle 360ms ease both; }
    @keyframes settle {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Two columns only when there is room. Mobile-first below. */
    @media (min-width: 720px) {
      .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    /* The narrowest sidebars get a single column so long paths do not crowd. */
    @media (max-width: 380px) {
      .grid { grid-template-columns: 1fr; }
    }

    @media (prefers-reduced-motion: reduce) {
      .brand .dot.busy { animation: none; }
      .progress > .fill { transition: none; }
      .settle { animation: none; }
      details.advanced > summary::before { transition: none; }
      .btn.primary { transition: none; }
      .brand .dot { transition: none; }
    }
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
      </div>
      <div class="row">
        <button id="openCursor" class="btn cta">Open Cursor Settings</button>
      </div>
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
      copyResults: {},
      automagicalSetupRunning: false,
      setupOperationRunning: false,
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
      if (state.runtime && state.runtime.running) {
        // Stop has a short grace period; give immediate, honest feedback.
        els.primary.disabled = true;
        els.primary.textContent = 'Turning Off…';
        vscode.postMessage({ command: 'stop' });
        return;
      }
      vscode.postMessage({ command: 'automagicalSetup' });
    });

    /* Each Cursor value copies on its own, outside the primary slot. */
    for (const button of document.querySelectorAll('.connect .copy')) {
      button.addEventListener('click', () => {
        vscode.postMessage({ command: 'copyCursorValue', key: button.dataset.key });
      });
    }
    els.openCursor.addEventListener('click', () => {
      vscode.postMessage({ command: 'prepareCursor' });
    });
    els.manageStorage.addEventListener('click', () => {
      state.storageOpen = !state.storageOpen;
      renderStorage();
    });

    els.load.addEventListener('click', () => {
      vscode.postMessage({ command: 'quantizations', repoId: els.repo.value });
    });
    els.search.addEventListener('click', () => {
      vscode.postMessage({ command: 'search', query: els.repo.value });
    });
    els.install.addEventListener('click', () => {
      state.setupOperationRunning = true;
      render();
      vscode.postMessage({ command: 'installRun', candidate: state.selected });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'state') {
        els.repo.value = message.defaultRepo;
        state.installed = message.installed;
        state.runtime = message.runtime;
        state.machine = message.machine;
        updateDownloadedStorage(message);
        state.setupOperationRunning = false;
        state.errorMessage = '';
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderMachine(message.machine);
        render();
        setStatus('Ready.');
      }
      if (message.type === 'searchResults') renderSearchResults(message.results);
      if (message.type === 'quantizations') renderQuantizations(message.quantizations);
      if (message.type === 'installProgress') {
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
      if (message.type === 'installModelSelected') {
        state.selectedModelName = message.modelName;
        state.progressMessage = 'Selected ' + message.modelName + '. Needs about ' + message.requiredMemory + ' runtime memory; ' + message.availableMemory + ' available now.';
        render();
        setStatus(state.progressMessage);
      }
      if (message.type === 'automagicalSetupStarted') {
        state.automagicalSetupRunning = true;
        state.setupOperationRunning = true;
        state.errorMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
        state.progressMessage = 'Choosing the recommended model for this Mac…';
        els.install.disabled = true;
        render();
        setStatus('Selecting a compatible model, starting it, and preparing Cursor.');
      }
      if (message.type === 'installed') {
        state.installed = message.installed;
        state.runtime = message.runtime;
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
      if (message.type === 'runtime') {
        state.runtime = message.runtime;
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
      if (message.type === 'automagicalSetupComplete') {
        state.automagicalSetupRunning = false;
        state.setupOperationRunning = false;
        state.errorMessage = '';
        state.progressMessage = '';
        state.progressPercent = undefined;
        state.selectedModelName = '';
        state.installed = message.installed;
        state.runtime = message.runtime;
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
      if (message.type === 'cursorSetupPrepared') {
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
      if (message.type === 'cursorCopyResult') {
        state.errorMessage = '';
        state.copyResults[message.key] = { ok: message.ok, message: message.message };
        state.connectMessage = message.message;
        if (message.cursorSetupFreshness) state.cursorSetupFreshness = message.cursorSetupFreshness;
        render();
        setStatus(message.message);
      }
      if (message.type === 'error') {
        state.automagicalSetupRunning = false;
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
      const phase = (errored && !running) ? 'error' : running ? 'on' : busy ? 'starting' : 'off';
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
      els.headline.textContent = 'Local agent is off';
      els.subline.textContent = 'Runs a coding model on this Mac for Cursor.';
      els.progress.classList.add('hidden');
      els.connect.classList.add('hidden');
      els.metaLine.style.display = 'none';
      els.primary.textContent = 'Turn On Local Agent';
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
      els.primary.textContent = 'Turn Off Local Agent';
      els.primary.title = 'Frees the model from memory';
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
        els.valModelId.textContent = viewModel.modelId || 'Local Motion';
        els.valApiKey.textContent = viewModel.apiKey || '';
        els.valBaseUrl.textContent = viewModel.baseUrl || 'Preparing the local endpoint…';
        els.connectNote.textContent = state.connectMessage || '';
        els.connectNote.style.display = state.connectMessage ? 'block' : 'none';
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

    ${setupPanelStorageScript()}

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

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
}
