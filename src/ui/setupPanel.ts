import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { LocalMotionController } from "../app/localMotionController";
import { isCursorSetupValueKey } from "../cursor/cursorIntegration";
import type { AutomagicalSetupCompleteResponse, SetupRequest, SetupResponse } from "../setupProtocol";
import type { CandidateQuantization } from "../types";

export class SetupPanel {
  private static current: SetupPanel | undefined;
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | undefined;
  private isReady = false;

  static show(
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ): SetupPanel {
    if (SetupPanel.current) {
      SetupPanel.current.panel.reveal(vscode.ViewColumn.One);
      void SetupPanel.current.postInitialState();
      return SetupPanel.current;
    }

    const panel = vscode.window.createWebviewPanel("localMotionSetup", "Local Motion", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    });
    SetupPanel.current = new SetupPanel(panel, controller, output);
    return SetupPanel.current;
  }

  static async runAutomagicalSetup(
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return SetupPanel.show(controller, output).automagicalSetup();
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly controller: LocalMotionController,
    private readonly output: vscode.OutputChannel
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => {
      SetupPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: SetupRequest) => void this.handleMessage(message));
  }

  private async handleMessage(message: SetupRequest): Promise<void> {
    try {
      switch (message.command) {
        case "ready":
          this.markReady();
          await this.postInitialState();
          break;
        case "search":
          await this.post(await this.controller.search(message.query ?? ""));
          break;
        case "quantizations":
          await this.post(await this.controller.quantizations(message.repoId ?? this.controller.defaultRepo()));
          break;
        case "installRun":
          if (!message.candidate) {
            throw new Error("No quantization was selected.");
          }
          await this.installRun(message.candidate);
          break;
        case "automagicalSetup":
          await this.automagicalSetup();
          break;
        case "stop":
          await this.post(await this.controller.stop());
          break;
        case "prepareCursor":
          await this.post(await this.controller.prepareCursor());
          break;
        case "copyCursorValue":
          if (!isCursorSetupValueKey(message.key)) {
            throw new Error("No Cursor setup value was selected.");
          }
          await this.post(await this.controller.copyCursorValue(message.key));
          break;
        case "verifyCursorEndpoint":
          await this.post(await this.controller.verifyCursorEndpoint());
          break;
        case "openCursorSettings":
          await this.post(await this.controller.openCursorSettings());
          break;
        default:
          throw new Error("Unknown setup command.");
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.output.appendLine(messageText);
      await this.post({ type: "error", message: messageText });
      void vscode.window.showErrorMessage(messageText);
    }
  }

  private async postInitialState(): Promise<void> {
    await this.post(await this.controller.initialState());
    await this.post(await this.controller.quantizations(this.controller.defaultRepo()));
  }

  private async installRun(candidate: CandidateQuantization): Promise<void> {
    const payload = await this.controller.installRun(candidate, (progress) => {
      void this.post({ type: "installProgress", progress });
    });
    if (payload) {
      await this.post(payload);
    }
  }

  private async automagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
    await this.waitUntilReady();
    await this.post({ type: "automagicalSetupStarted" });
    const payload = await this.controller.automagicalSetup((progress) => {
      void this.post({ type: "installProgress", progress });
    });
    if (payload) {
      await this.post(payload);
    }
    return payload;
  }

  private markReady(): void {
    if (this.isReady) {
      return;
    }
    this.isReady = true;
    this.resolveReady?.();
  }

  private async waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return;
    }
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 3_000);
      })
    ]);
  }

  private async post(payload: SetupResponse): Promise<void> {
    await this.panel.webview.postMessage(payload);
  }

  private html(): string {
    const nonce = crypto.randomBytes(16).toString("hex");
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
    .header-actions {
      margin-top: 0;
      justify-content: flex-end;
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
        <p>Install a compatible GGUF coding model and run it through a local OpenAI-compatible endpoint.</p>
      </div>
      <div class="actions header-actions">
        <button id="autoSetup">Automagical Setup</button>
        <button id="stop" class="secondary">Stop Model</button>
      </div>
    </header>

    <section>
      <h2>This Mac</h2>
      <div id="machine" class="grid"></div>
    </section>

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
        <button id="install" disabled>Install and Run</button>
      </div>
    </section>

    <section>
      <h2>Cursor</h2>
      <p id="runtime">Start a model to get the Cursor base URL and model ID.</p>
      <div class="actions">
        <button id="prepareCursor">Prepare Cursor</button>
        <button id="verifyCursor" class="secondary">Verify Endpoint</button>
        <button id="cursorSettings" class="secondary">Open Settings</button>
      </div>
      <div id="cursorSetupFields" class="setup-grid"></div>
    </section>

    <section>
      <h2>Status</h2>
      <pre id="status">Waiting for machine profile.</pre>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = { selected: undefined, installed: undefined, runtime: undefined, copyResults: {} };
    const els = {
      repo: document.getElementById('repo'),
      machine: document.getElementById('machine'),
      searchResults: document.getElementById('searchResults'),
      quantizations: document.getElementById('quantizations'),
      install: document.getElementById('install'),
      status: document.getElementById('status'),
      runtime: document.getElementById('runtime'),
      cursorSetupFields: document.getElementById('cursorSetupFields')
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
    document.getElementById('autoSetup').addEventListener('click', () => {
      vscode.postMessage({ command: 'automagicalSetup' });
    });
    document.getElementById('stop').addEventListener('click', () => {
      vscode.postMessage({ command: 'stop' });
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
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderMachine(message.machine);
        renderRuntime();
        setStatus('Ready.');
      }
      if (message.type === 'searchResults') renderSearchResults(message.results);
      if (message.type === 'quantizations') renderQuantizations(message.quantizations);
      if (message.type === 'installProgress') setStatus('Downloading ' + Math.round(message.progress.percent || 0) + '%');
      if (message.type === 'automagicalSetupStarted') {
        document.getElementById('autoSetup').disabled = true;
        document.getElementById('install').disabled = true;
        setStatus('Selecting a compatible model, starting it, and preparing Cursor.');
      }
      if (message.type === 'installed') {
        state.installed = message.installed;
        state.runtime = message.runtime;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderRuntime();
        setStatus('Running ' + message.installed.displayName);
      }
      if (message.type === 'runtime') {
        state.runtime = message.runtime;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        renderRuntime();
        setStatus(message.runtime.message);
      }
      if (message.type === 'automagicalSetupComplete') {
        state.installed = message.installed;
        state.runtime = message.runtime;
        resetCursorActionStateIfEndpointChanged(message.cursorSetupViewModel);
        state.cursorSetupViewModel = message.cursorSetupViewModel;
        state.cursorSetupFreshness = message.cursorSetupFreshness;
        state.verification = message.cursor && message.cursor.verification;
        state.settings = message.cursor && message.cursor.settings;
        if (message.cursor && message.cursor.copy) state.copyResults.setupBlock = message.cursor.copy;
        document.getElementById('autoSetup').disabled = false;
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
      if (message.type === 'error') setStatus(message.message);
      if (message.type === 'error') {
        document.getElementById('autoSetup').disabled = false;
        document.getElementById('install').disabled = !state.selected;
      }
    });

    function renderMachine(machine) {
      els.machine.innerHTML = [
        ['CPU', machine.cpu],
        ['Architecture', machine.arch + (machine.appleSilicon ? ' Apple Silicon' : '')],
        ['Memory', machine.memory + ' total'],
        ['Budget', machine.budget],
        ['Available RAM', machine.availableMemory],
        ['Free disk', machine.disk],
        ['Storage', machine.storageRoot]
      ].map(([label, value]) => '<div class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>').join('');
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
          els.install.disabled = false;
        });
      });
      const firstCompatible = items.findIndex(item => item.compatibility.status === 'compatible');
      if (firstCompatible >= 0 && buttons[firstCompatible]) buttons[firstCompatible].click();
      setStatus(items.length ? 'Compatible quantization selected. Use Automagical Setup or install manually.' : 'No GGUF files found in this repository.');
    }

    function renderRuntime() {
      const runtime = state.runtime || {};
      if (!runtime.running) {
        els.runtime.textContent = runtime.message || 'No model is running.';
        renderCursorSetup();
        return;
      }
      els.runtime.textContent = runtime.message + ' Base URL: ' + runtime.baseUrl + ' Model ID: ' + runtime.modelId;
      renderCursorSetup();
    }

    function renderCursorSetup() {
      const viewModel = state.cursorSetupViewModel;
      if (!viewModel) {
        els.cursorSetupFields.textContent = '';
        document.getElementById('prepareCursor').disabled = true;
        document.getElementById('verifyCursor').disabled = true;
        document.getElementById('cursorSettings').disabled = true;
        return;
      }
      document.getElementById('prepareCursor').disabled = !viewModel.isRunning;
      document.getElementById('verifyCursor').disabled = !viewModel.isRunning;
      document.getElementById('cursorSettings').disabled = !viewModel.isRunning;
      const fields = [
        ['apiKey', 'OpenAI API Key', viewModel.apiKey],
        ['baseUrl', 'Override OpenAI Base URL', viewModel.baseUrl],
        ['modelId', 'Custom Model / Model Name', viewModel.modelId],
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
}
