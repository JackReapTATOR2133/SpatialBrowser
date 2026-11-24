'use strict';

class DownloadsUI {
  constructor(app) {
    this.app = app;
    this.api = app.api;

    this.btn = document.getElementById('downloads-btn');
    this.badge = document.getElementById('downloads-badge');
    this.panel = document.getElementById('downloads-panel');
    this.listEl = document.getElementById('downloads-list');
    this.btnOpenFolder = document.getElementById('downloads-open-folder-btn');
    this.btnClear = document.getElementById('downloads-clear-btn');
    this.btnClose = document.getElementById('downloads-close-btn');

    this.isOpen = false;
    this.items = [];

    this._bindEvents();
    this.refresh();
  }

  _bindEvents() {
    if (this.btn) {
      this.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => {
        this.close();
      });
    }

    if (this.btnOpenFolder) {
      this.btnOpenFolder.addEventListener('click', async () => {
        if (this.api && this.api.openDownloadsFolder) {
          await this.api.openDownloadsFolder();
        }
      });
    }

    if (this.btnClear) {
      this.btnClear.addEventListener('click', async () => {
        if (this.api && this.api.clearDownloads) {
          this.items = (await this.api.clearDownloads()) || [];
          this.render();
          this.updateBadge();
        }
      });
    }

    // Outside click closes panel
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      if (this.panel && !this.panel.contains(e.target) && !this.btn.contains(e.target)) {
        this.close();
      }
    });

    // Listen to real-time download events from Main Process
    if (this.api) {
      if (this.api.onDownloadStarted) {
        this.api.onDownloadStarted((dl) => {
          this._handleDownloadUpdated(dl);
          // If a new download starts, show panel or animate badge
          this.animateButton();
        });
      }

      if (this.api.onDownloadUpdated) {
        this.api.onDownloadUpdated((dl) => {
          this._handleDownloadUpdated(dl);
        });
      }

      if (this.api.onDownloadDone) {
        this.api.onDownloadDone((dl) => {
          this._handleDownloadUpdated(dl);
        });
      }
    }
  }

  _handleDownloadUpdated(dl) {
    const idx = this.items.findIndex((item) => item.id === dl.id);
    if (idx >= 0) {
      this.items[idx] = dl;
    } else {
      this.items.unshift(dl);
    }
    this.updateBadge();
    if (this.isOpen) {
      this.render();
    }
  }

  async refresh() {
    if (!this.api || !this.api.getDownloads) return;
    try {
      this.items = (await this.api.getDownloads()) || [];
      this.updateBadge();
      if (this.isOpen) {
        this.render();
      }
    } catch (err) {
      console.error('Failed to load downloads:', err);
    }
  }

  updateBadge() {
    if (!this.badge) return;
    const activeCount = this.items.filter((item) => item.state === 'progressing').length;
    if (activeCount > 0) {
      this.badge.textContent = activeCount > 99 ? '99+' : String(activeCount);
      this.badge.classList.remove('hidden');
    } else {
      this.badge.classList.add('hidden');
    }
  }

  animateButton() {
    if (this.btn) {
      this.btn.classList.add('dl-pulse');
      setTimeout(() => this.btn.classList.remove('dl-pulse'), 1200);
    }
  }

  open() {
    // Close other overlays
    if (this.app.hub && this.app.hub.isOpen) this.app.hub.close();
    if (this.app.tabManager && this.app.tabManager.isOpen) this.app.tabManager.close();
    if (this.app.extensions && this.app.extensions.isOpen) this.app.extensions.close();

    const appMenu = document.getElementById('app-dropdown-menu');
    if (appMenu) appMenu.classList.add('hidden');

    this.isOpen = true;
    if (this.panel) {
      this.panel.classList.remove('hidden');
      requestAnimationFrame(() => this.panel.classList.add('open'));
    }

    if (this.btn) {
      this.btn.classList.add('active');
    }

    // Hide native views so they don't occlude the dropdown
    this.app.setViewsVisible(false);

    this.refresh();
  }

  close() {
    this.isOpen = false;
    if (this.panel) {
      this.panel.classList.remove('open');
      setTimeout(() => {
        if (!this.isOpen) this.panel.classList.add('hidden');
      }, 200);
    }

    if (this.btn) {
      this.btn.classList.remove('active');
    }

    // Restore native view visibility
    this.app.setViewsVisible(true);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0));
    return `${val} ${sizes[i]}`;
  }

  formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    return `${this.formatBytes(bytesPerSec)}/с`;
  }

  render() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (!this.items || this.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'dl-empty';
      empty.innerHTML = `
        <div class="dl-empty-icon">📥</div>
        <div class="dl-empty-title">Завантажень немає</div>
        <div class="dl-empty-desc">Файли, які ви завантажуєте з вебсторінок, з'являтимуться тут.</div>
      `;
      this.listEl.appendChild(empty);
      return;
    }

    this.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = `dl-item dl-${item.state}`;
      row.dataset.id = item.id;

      const isProgressing = item.state === 'progressing';
      const isCompleted = item.state === 'completed';
      const isCancelled = item.state === 'cancelled';
      const isInterrupted = item.state === 'interrupted';

      const total = item.totalBytes > 0 ? item.totalBytes : 0;
      const received = item.receivedBytes || 0;
      const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

      // File icon detection
      const ext = (item.filename || '').split('.').pop().toLowerCase();
      let fileIcon = '📄';
      if (/^(zip|rar|7z|tar|gz|xpi|crx)$/.test(ext)) fileIcon = '📦';
      else if (/^(exe|msi|bat|cmd)$/.test(ext)) fileIcon = '⚙️';
      else if (/^(png|jpg|jpeg|gif|webp|svg)$/.test(ext)) fileIcon = '🖼️';
      else if (/^(mp4|mkv|webm|avi|mov)$/.test(ext)) fileIcon = '🎬';
      else if (/^(mp3|wav|ogg|flac)$/.test(ext)) fileIcon = '🎵';
      else if (/^(pdf|doc|docx|txt|md)$/.test(ext)) fileIcon = '📝';

      // Status text
      let statusText = '';
      if (isProgressing) {
        const speedText = this.formatSpeed(item.speed);
        const percentText = total > 0 ? `${percent}%` : '';
        statusText = `${this.formatBytes(received)} з ${total > 0 ? this.formatBytes(total) : '?'} ${percentText ? '• ' + percentText : ''} ${speedText ? '• ' + speedText : ''}`;
      } else if (isCompleted) {
        statusText = `Завершено • ${this.formatBytes(received || total)}`;
      } else if (isCancelled) {
        statusText = 'Скасовано';
      } else {
        statusText = 'Помилка завантаження';
      }

      row.innerHTML = `
        <div class="dl-item-icon">${fileIcon}</div>
        <div class="dl-item-body">
          <div class="dl-item-filename" title="${this._escapeHtml(item.filename)}">${this._escapeHtml(item.filename)}</div>
          <div class="dl-item-meta">${statusText}</div>
          ${isProgressing ? `
            <div class="dl-progress-bar-bg">
              <div class="dl-progress-bar-fill" style="width: ${percent > 0 ? percent : 10}%;"></div>
            </div>
          ` : ''}
        </div>
        <div class="dl-item-actions">
          ${isProgressing ? `
            ${item.paused ? `
              <button class="btn btn-sm btn-icon dl-btn-resume" title="Продовжити">▶</button>
            ` : `
              <button class="btn btn-sm btn-icon dl-btn-pause" title="Пауза">⏸</button>
            `}
            <button class="btn btn-sm btn-icon dl-btn-cancel" title="Скасувати">✕</button>
          ` : `
            ${isCompleted ? `
              <button class="btn btn-sm btn-primary dl-btn-open" title="Відкрити файл">Відкрити</button>
              <button class="btn btn-sm btn-icon dl-btn-folder" title="Показати у папці">📁</button>
            ` : `
              <button class="btn btn-sm btn-icon dl-btn-folder" title="Показати у папці">📁</button>
            `}
          `}
        </div>
      `;

      // Action event listeners
      const btnOpen = row.querySelector('.dl-btn-open');
      if (btnOpen) {
        btnOpen.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.api && this.api.openDownloadedFile) {
            await this.api.openDownloadedFile(item.id);
          }
        });
      }

      const btnFolder = row.querySelector('.dl-btn-folder');
      if (btnFolder) {
        btnFolder.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.api && this.api.showDownloadedItemInFolder) {
            await this.api.showDownloadedItemInFolder(item.id);
          }
        });
      }

      const btnPause = row.querySelector('.dl-btn-pause');
      if (btnPause) {
        btnPause.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.api && this.api.pauseDownload) {
            await this.api.pauseDownload(item.id);
          }
        });
      }

      const btnResume = row.querySelector('.dl-btn-resume');
      if (btnResume) {
        btnResume.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.api && this.api.resumeDownload) {
            await this.api.resumeDownload(item.id);
          }
        });
      }

      const btnCancel = row.querySelector('.dl-btn-cancel');
      if (btnCancel) {
        btnCancel.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.api && this.api.cancelDownload) {
            await this.api.cancelDownload(item.id);
          }
        });
      }

      // Clicking row when completed opens the file
      if (isCompleted) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', async () => {
          if (this.api && this.api.openDownloadedFile) {
            await this.api.openDownloadedFile(item.id);
          }
        });
      }

      this.listEl.appendChild(row);
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.DownloadsUI = DownloadsUI;
