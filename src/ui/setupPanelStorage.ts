export function setupPanelStorageStyles(): string {
  return `
    .storage-summary {
      margin-top: 16px;
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      color: var(--faint);
      font-size: 12px;
      line-height: 1.4;
    }
    .storage-summary.hidden { display: none; }
    .storage-panel {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: var(--panel);
    }
    .storage-panel.hidden { display: none; }
    .storage-panel h2 {
      font-size: 12px;
      margin: 0 0 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--faint);
    }
    .storage-list {
      display: grid;
      gap: 8px;
    }
    .storage-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }
    .storage-item.active .storage-name {
      color: var(--vscode-foreground);
      font-weight: 600;
    }
    .storage-item:first-child {
      border-top: none;
      padding-top: 0;
    }
    .storage-actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .storage-name {
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .storage-meta {
      margin-top: 4px;
      color: var(--faint);
      font-size: 12px;
      line-height: 1.4;
    }
    .storage-file {
      margin-top: 2px;
      color: var(--faint);
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .storage-badges {
      margin-top: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .storage-badge {
      display: inline-flex;
      align-items: center;
      min-height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--faint);
      font-size: 11px;
      line-height: 1;
    }
    .storage-badge.active {
      color: var(--ok);
      border-color: color-mix(in srgb, var(--ok) 44%, transparent);
    }
  `;
}

export function setupPanelStorageMarkup(): string {
  return `
    <div id="storageSummary" class="storage-summary hidden">
      <span id="storageText"></span>
      <button id="manageStorage" class="btn link" aria-expanded="false" aria-controls="storagePanel">Manage</button>
    </div>

    <section id="storagePanel" class="storage-panel hidden" aria-label="Model library">
      <h2>Model Library</h2>
      <div id="storageList" class="storage-list"></div>
    </section>
  `;
}
