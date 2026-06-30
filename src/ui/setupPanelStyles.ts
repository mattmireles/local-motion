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
  `;
}
