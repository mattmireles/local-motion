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

export function setupPanelStorageScript(): string {
  return `
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
      els.storageText.textContent = formatBytes(state.downloadedModelsSizeBytes) + ' downloaded in ' + models.length + ' model' + (models.length === 1 ? '' : 's');
      els.manageStorage.textContent = state.storageOpen ? 'Hide' : 'Manage';
      els.manageStorage.setAttribute('aria-expanded', state.storageOpen ? 'true' : 'false');

      if (!state.storageOpen) {
        els.storagePanel.classList.add('hidden');
        return;
      }

      els.storagePanel.classList.remove('hidden');
      els.storageList.innerHTML = models.map((model, index) => {
        const labels = [
          model.active ? 'Running' : '',
          !model.active && model.installed ? 'Installed' : '',
          model.partial ? 'Partial' : ''
        ].filter(Boolean).join(' · ');
        return '<div class="storage-item">' +
          '<div>' +
            '<div class="storage-name">' + esc(model.fileName) + '</div>' +
            '<div class="storage-meta">' + esc(formatBytes(model.sizeBytes)) + (labels ? ' · ' + esc(labels) : '') + '</div>' +
          '</div>' +
          '<button class="btn danger" data-index="' + index + '" aria-label="Delete ' + esc(model.fileName) + ', ' + esc(formatBytes(model.sizeBytes)) + '"' + (state.setupOperationRunning ? ' disabled' : '') + '>Delete</button>' +
        '</div>';
      }).join('');

      for (const button of els.storageList.querySelectorAll('button[data-index]')) {
        button.addEventListener('click', () => {
          if (state.setupOperationRunning) return;
          const model = models[Number(button.dataset.index)];
          if (!model) return;
          vscode.postMessage({ command: 'deleteDownloadedModel', id: model.id });
        });
      }
    }
  `;
}
