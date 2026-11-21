'use strict';

class TabManager {
  constructor(app) {
    this.app = app;
    this.sidebarEl = document.getElementById('windows-popup-menu');
    this.backdropEl = document.getElementById('tab-sidebar-backdrop');
    this.listEl = document.getElementById('popup-tab-list');
    this.countEl = document.getElementById('popup-tab-count');
    this.btnClose = document.getElementById('popup-close-btn');
    this.btnNew = document.getElementById('popup-new-tab-btn');
    this.btnCloseAll = document.getElementById('popup-close-all-btn');
    this.filterInput = document.getElementById('tab-filter-input');
    this.isOpen = false;
    this.cachedWindows = [];

    this._bindEvents();
  }

  _bindEvents() {
    // Explicit close button
    if (this.btnClose) {
      this.btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    // Backdrop click closes sidebar
    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => {
        this.close();
      });
    }

    // New window button
    if (this.btnNew) {
      this.btnNew.addEventListener('click', () => {
        this.app.createWindow('https://www.google.com');
        this.close();
      });
    }

    // Close all windows button
    if (this.btnCloseAll) {
      this.btnCloseAll.addEventListener('click', async () => {
        if (this.cachedWindows.length === 0) return;
        const ids = this.cachedWindows.map(w => w.id);
        for (const id of ids) {
          await this.app.closeWindow(id);
        }
        await this.refresh();
      });
    }

    // Filter input
    if (this.filterInput) {
      this.filterInput.addEventListener('input', () => {
        this.filterList(this.filterInput.value);
      });
    }

    // Outside click closes sidebar
    document.addEventListener('mousedown', (e) => {
      if (!this.isOpen) return;
      const toggleBtn = document.getElementById('windows-popup-btn') || document.getElementById('btn-tabs-toggle');
      if (
        this.sidebarEl && 
        !this.sidebarEl.contains(e.target) && 
        (!toggleBtn || !toggleBtn.contains(e.target))
      ) {
        this.close();
      }
    });

    // Escape key closes sidebar
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  async open() {
    this.isOpen = true;
    this.sidebarEl.classList.remove('hidden');

    if (this.backdropEl) {
      this.backdropEl.classList.add('active');
    }

    requestAnimationFrame(() => {
      this.sidebarEl.classList.add('open');
    });

    // Temporarily hide native WebContentsViews so slide-out sidebar is never occluded
    this.app.setViewsVisible(false);

    if (this.filterInput) {
      this.filterInput.value = '';
    }

    await this.refresh();

    if (this.filterInput) {
      setTimeout(() => this.filterInput.focus(), 150);
    }
  }

  close() {
    this.isOpen = false;
    this.sidebarEl.classList.remove('open');

    if (this.backdropEl) {
      this.backdropEl.classList.remove('active');
    }

    setTimeout(() => {
      if (!this.isOpen) {
        this.sidebarEl.classList.add('hidden');
      }
    }, 250);

    // Restore native WebContentsViews visibility
    this.app.setViewsVisible(true);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  async refresh() {
    try {
      const windows = await this.app.api.getWindowList();
      this.cachedWindows = windows || [];
      this.renderList(this.cachedWindows);
    } catch (err) {
      console.error('Failed to get window list:', err);
    }
  }

  filterList(query) {
    const term = query.toLowerCase().trim();
    if (!term) {
      this.renderList(this.cachedWindows);
      return;
    }
    const filtered = this.cachedWindows.filter(w =>
      (w.title && w.title.toLowerCase().includes(term)) ||
      (w.url && w.url.toLowerCase().includes(term))
    );
    this.renderList(filtered);
  }

  renderList(windows) {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (this.countEl) {
      this.countEl.textContent = String(windows.length);
    }

    if (windows.length === 0) {
      this.listEl.innerHTML = `
        <div class="popup-empty">
          <span>🗂️</span>
          <span>Немає відкритих вікон</span>
        </div>
      `;
      return;
    }

    windows.forEach((win) => {
      const item = document.createElement('div');
      item.className = 'tab-item' + (win.isActive ? ' active' : '');
      item.dataset.id = win.id;

      const safeTitle = this._escapeHtml(win.title || 'Нова сторінка');
      const safeUrl = this._escapeHtml(win.url || 'about:blank');

      item.innerHTML = `
        <div class="tab-item-left">
          ${win.favicon ? `<img src="${this._escapeHtml(win.favicon)}" class="tab-item-icon" alt="" onerror="this.outerHTML='<span class=\\'tab-item-icon\\'>🌐</span>'"/>` : `<span class="tab-item-icon">🌐</span>`}
          <div class="tab-item-info">
            <span class="tab-item-title" title="${safeTitle}">${safeTitle}</span>
            <span class="tab-item-url" title="${safeUrl}">${safeUrl}</span>
          </div>
        </div>
        <div class="tab-item-actions">
          ${win.isActive ? '<span class="tab-active-indicator">Активне</span>' : ''}
          <button class="tab-close-btn" data-action="close" title="Закрити вікно">✕</button>
        </div>
      `;

      // Select window on click
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) return;
        this.app.setActiveWindow(win.id);
        this.close();
      });

      // Close window button
      const btnClose = item.querySelector('[data-action="close"]');
      if (btnClose) {
        btnClose.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.app.closeWindow(win.id);
          await this.refresh();
        });
      }

      this.listEl.appendChild(item);
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.TabManager = TabManager;
