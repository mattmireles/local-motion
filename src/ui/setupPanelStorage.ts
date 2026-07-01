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
    .storage-item:first-child {
      border-top: none;
      padding-top: 0;
    }
    .storage-actions {
      display: flex;
      gap: 6px;
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
  `;
}

export function setupPanelStorageMarkup(): string {
  return `
    <div id="storageSummary" class="storage-summary hidden">
      <span id="storageText"></span>
      <button id="manageStorage" class="btn link" aria-expanded="false" aria-controls="storagePanel">Manage</button>
    </div>

    <section id="storagePanel" class="storage-panel hidden" aria-label="Downloaded models">
      <h2>Downloaded Models</h2>
      <div id="storageList" class="storage-list"></div>
    </section>
  `;
}
