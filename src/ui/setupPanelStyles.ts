import { setupPanelStorageStyles } from "./setupPanelStorage";

export function setupPanelStyles(): string {
  return `
    :root {
      color-scheme: light dark;
      --line: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      --muted: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
      --faint: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
      --ok: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #2f8f5b));
      --bad: var(--vscode-testing-iconFailed, var(--vscode-errorForeground, #c94f4f));
      --busy: var(--vscode-progressBar-background, var(--vscode-focusBorder));
      --panel: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground));
      /* Selection accent = the primary button's color. focusBorder exists
         for keyboard rings, and many themes tune it near-invisible. */
      --accent: var(--vscode-button-background, var(--vscode-focusBorder));
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

    .model-chooser {
      margin-top: 18px;
      display: grid;
      gap: 8px;
    }
    .model-chooser h2 {
      margin: 0;
      color: var(--faint);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .model-options {
      display: grid;
      gap: 8px;
    }
    .model-option {
      appearance: none;
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      align-items: center;
      text-align: left;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }
    .model-option:hover {
      background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
    }
    .model-option.selected {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 9%, transparent);
    }
    .model-option.active .model-status {
      color: var(--ok);
    }
    .model-option.skeleton {
      cursor: default;
      color: var(--faint);
    }
    .model-title {
      min-width: 0;
      display: flex;
      gap: 8px;
      align-items: baseline;
      overflow-wrap: anywhere;
    }
    /* Selection is a visible radio, not a caption change three inches away.
       Hollow when unselected, filled when the primary button will act here. */
    .model-radio {
      position: relative;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid var(--faint);
      flex: 0 0 auto;
      align-self: center;
      transition: border-color 160ms ease;
    }
    .model-option.selected .model-radio { border-color: var(--accent); }
    .model-option.selected .model-radio::after {
      content: '';
      position: absolute;
      inset: 2.5px;
      border-radius: 50%;
      background: var(--accent);
    }
    .model-title strong {
      font-size: 14px;
      font-weight: 650;
    }
    .model-title span {
      color: var(--muted);
      font-size: 13px;
    }
    .model-meta {
      grid-column: 1 / -1;
      color: var(--faint);
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .model-status {
      color: var(--faint);
      font-size: 12px;
      white-space: nowrap;
      justify-self: end;
    }
    /* Running earns a quiet pill; selected-vs-running stay two signals. */
    .model-option.active .model-status {
      border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent);
      border-radius: 999px;
      padding: 1px 8px;
    }
    .model-repo-row {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .model-repo {
      flex: 1;
      min-width: 0;
      color: var(--faint);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    /* Replace is rare: a bare glyph that only earns an input row on demand. */
    .btn.icon {
      width: 26px;
      min-height: 24px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      background: transparent;
      border: none;
      color: var(--faint);
      border-radius: 4px;
    }
    .btn.icon:hover:not(:disabled) {
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
    }
    /* The quantization chooser sits quietly between status and repo: the
       same input treatment as the replace field, no added chrome. */
    .model-quant {
      grid-column: 1 / -1;
      margin-top: 2px;
    }
    .model-quant select {
      width: 100%;
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 9px;
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      background: var(--vscode-input-background, transparent);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }
    .model-replace {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      margin-top: 2px;
    }
    .model-replace input {
      width: 100%;
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 9px;
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      background: var(--vscode-input-background, transparent);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
    }

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
    .model-option:focus-visible,
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
      .model-radio { transition: none; }
      .progress > .fill { transition: none; }
      .settle { animation: none; }
      details.advanced > summary::before { transition: none; }
      .btn.primary { transition: none; }
    }
  `;
}
