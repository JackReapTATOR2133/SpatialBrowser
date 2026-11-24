'use strict';

/**
 * Renderer side of the add-on system:
 *  - toolbar icons for every enabled extension (click -> native popup view)
 *  - manager modal: install (file / folder / drag & drop), enable/disable, options, remove
 */
class ExtensionsUI {
  constructor(app) {
    this.app = app;
    this.api = app.api;
    this.items = [];
    this.isOpen = false;

    this.bar = document.getElementById('extensions-bar');
    this.btn = document.getElementById('extensions-btn');
    this.modal = document.getElementById('extensions-modal');
    this.list = document.getElementById('ext-list');
    this.status = document.getElementById('ext-status');
    this.dropzone = document.getElementById('ext-dropzone');

    this._bind();
    this.refresh();
  }

  _bind() {
    if (this.btn) this.btn.addEventListener('click', () => this.toggle());

    const closeBtn = document.getElementById('ext-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const fileBtn = document.getElementById('ext-install-file-btn');
    if (fileBtn) fileBtn.addEventListener('click', () => this.installDialog('file'));

    const folderBtn = document.getElementById('ext-install-folder-btn');
    if (folderBtn) folderBtn.addEventListener('click', () => this.installDialog('folder'));

    if (this.modal) {
      this.modal.addEventListener('mousedown', (e) => {
        if (e.target === this.modal) this.close();
      });
    }

    // Never let a dropped file navigate the browser UI itself
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file && /\.(xpi|crx|zip)$/i.test(file.name)) {
        if (!this.isOpen) this.open();
        this.installFile(file);
      }
    });

    if (this.dropzone) {
      this.dropzone.addEventListener('dragenter', () => this.dropzone.classList.add('dragover'));
      this.dropzone.addEventListener('dragleave', (e) => {
        if (!this.dropzone.contains(e.relatedTarget)) this.dropzone.classList.remove('dragover');
      });
      this.dropzone.addEventListener('drop', () => this.dropzone.classList.remove('dragover'));
    }

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    if (this.api.onExtensionsChanged) {
      this.api.onExtensionsChanged(() => this.refresh());
    }
  }

  /* --------------------------------- data --------------------------------- */
  async refresh() {
    try {
      this.items = (await this.api.listExtensions()) || [];
    } catch (err) {
      console.error('Failed to list extensions:', err);
      this.items = [];
    }
    this.renderBar();
    if (this.isOpen) this.renderList();
  }

  /* ------------------------------ toolbar icons ------------------------------ */
  renderBar() {
    if (!this.bar) return;
    this.bar.innerHTML = '';

    this.items.filter(x => x.enabled && x.loaded).forEach((ext) => {
      const b = document.createElement('button');
      b.className = 'ext-action-btn';
      b.title = ext.title || ext.name;
      b.dataset.key = ext.key;
      b.appendChild(this._iconEl(ext, 'ext-action-icon'));

      b.addEventListener('click', () => {
        if (ext.hasPopup) {
          const r = b.getBoundingClientRect();
          this.api.openExtensionPopup(ext.key, { x: r.left, y: r.top, width: r.width, height: r.height });
        } else if (ext.hasOptions) {
          this.api.openExtensionOptions(ext.key);
        } else {
          this.open();
        }
      });
      this.bar.appendChild(b);
    });

    if (this.btn) {
      const active = this.items.filter(x => x.enabled).length;
      this.btn.classList.toggle('has-extensions', active > 0);
    }
  }

  _iconEl(ext, cls) {
    if (ext.icon) {
      const img = document.createElement('img');
      img.className = cls;
      img.src = ext.icon;
      img.alt = '';
      img.draggable = false;
      return img;
    }
    const span = document.createElement('span');
    span.className = `${cls} ext-icon-fallback`;
    span.textContent = (ext.name || '?').trim().charAt(0).toUpperCase() || '🧩';
    return span;
  }

  /* --------------------------------- modal --------------------------------- */
  open() {
    if (this.isOpen) return;
    if (this.app.hub && this.app.hub.isOpen) this.app.hub.close();
    if (this.app.tabManager && this.app.tabManager.isOpen) this.app.tabManager.close();
    if (this.app.downloads && this.app.downloads.isOpen) this.app.downloads.close();
    this.api.closeExtensionPopup();

    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.app.setViewsVisible(false); // native web views would cover the DOM modal
    this._setStatus('');
    this.refresh();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modal.classList.add('hidden');
    this.app.setViewsVisible(true);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _setStatus(text, kind = 'info') {
    if (!this.status) return;
    if (!text) {
      this.status.className = 'ext-status hidden';
      this.status.textContent = '';
      return;
    }
    this.status.className = `ext-status ext-status-${kind}`;
    this.status.textContent = text;
  }

  async _handleInstallResult(promise) {
    this._setStatus('Встановлення…', 'info');
    try {
      const res = await promise;
      if (!res || !res.ok) {
        this._setStatus(`Помилка: ${(res && res.error) || 'невідома помилка'}`, 'error');
      } else if (!res.data) {
        this._setStatus('');
      } else if (res.data.error) {
        this._setStatus(`«${res.data.name}» встановлено, але Chromium не зміг його завантажити: ${res.data.error}`, 'warn');
      } else {
        this._setStatus(`✓ «${res.data.name}» ${res.data.version} встановлено та активовано`, 'success');
      }
    } catch (err) {
      this._setStatus(`Помилка: ${err.message || err}`, 'error');
    }
    await this.refresh();
  }

  installDialog(mode) {
    return this._handleInstallResult(this.api.installExtensionDialog(mode));
  }

  installFile(file) {
    return this._handleInstallResult(this.api.installExtensionFromFile(file));
  }

  renderList() {
    if (!this.list) return;
    this.list.innerHTML = '';

    if (!this.items.length) {
      const empty = document.createElement('div');
      empty.className = 'ext-empty';
      empty.textContent = 'Розширень ще не встановлено. Завантажте .xpi з addons.mozilla.org або .crx / розпаковану папку Chrome-розширення.';
      this.list.appendChild(empty);
      return;
    }

    this.items.forEach((ext) => {
      const row = document.createElement('div');
      row.className = 'ext-item' + (ext.enabled ? '' : ' disabled');

      row.appendChild(this._iconEl(ext, 'ext-item-icon'));

      const info = document.createElement('div');
      info.className = 'ext-item-info';

      const title = document.createElement('div');
      title.className = 'ext-item-title';
      title.textContent = ext.name;
      const meta = document.createElement('span');
      meta.className = 'ext-item-meta';
      meta.textContent = ` v${ext.version || '?'} · MV${ext.manifestVersion || '?'} · ${String(ext.source || '').toUpperCase()}`;
      title.appendChild(meta);
      info.appendChild(title);

      if (ext.description) {
        const desc = document.createElement('div');
        desc.className = 'ext-item-desc';
        desc.textContent = ext.description;
        info.appendChild(desc);
      }

      if (ext.enabled && ext.error) {
        const err = document.createElement('div');
        err.className = 'ext-item-error';
        err.textContent = `⚠ ${ext.error}`;
        info.appendChild(err);
      }
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'ext-item-actions';

      if (ext.hasOptions && ext.loaded) {
        const opt = document.createElement('button');
        opt.className = 'btn btn-icon';
        opt.title = 'Налаштування розширення';
        opt.textContent = '⚙';
        opt.addEventListener('click', () => {
          this.close();
          this.api.openExtensionOptions(ext.key);
        });
        actions.appendChild(opt);
      }

      const toggle = document.createElement('label');
      toggle.className = 'ext-switch';
      toggle.title = ext.enabled ? 'Вимкнути' : 'Увімкнути';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = ext.enabled;
      input.addEventListener('change', async () => {
        const res = await this.api.setExtensionEnabled(ext.key, input.checked);
        if (!res || !res.ok) this._setStatus(`Помилка: ${(res && res.error) || ''}`, 'error');
        this.refresh();
      });
      const slider = document.createElement('span');
      slider.className = 'ext-switch-slider';
      toggle.appendChild(input);
      toggle.appendChild(slider);
      actions.appendChild(toggle);

      const del = document.createElement('button');
      del.className = 'btn btn-icon ext-remove-btn';
      del.title = 'Видалити розширення';
      del.textContent = '🗑';
      del.addEventListener('click', async () => {
        if (!confirm(`Видалити розширення «${ext.name}»?`)) return;
        const res = await this.api.removeExtension(ext.key);
        if (!res || !res.ok) this._setStatus(`Помилка: ${(res && res.error) || ''}`, 'error');
        else this._setStatus(`«${ext.name}» видалено`, 'info');
        this.refresh();
      });
      actions.appendChild(del);

      row.appendChild(actions);
      this.list.appendChild(row);
    });
  }
}

window.ExtensionsUI = ExtensionsUI;
