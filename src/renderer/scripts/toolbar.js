'use strict';

class Toolbar {
  constructor(app) {
    this.app = app;
    this.urlInput = document.getElementById('url-input') || document.getElementById('address-bar');
    this.navigateBtn = document.getElementById('navigate-btn') || document.getElementById('btn-go');
    this.newWindowBtn = document.getElementById('new-window-btn') || document.getElementById('btn-new-window');
    this.hubToggleBtn = document.getElementById('hub-toggle-btn') || document.getElementById('btn-hub-toggle');
    this.windowsPopupBtn = document.getElementById('windows-popup-btn') || document.getElementById('btn-tabs-toggle');
    this.openTabsBadge = document.getElementById('open-tabs-badge');

    // Master controls for active window
    this.btnBack = document.getElementById('toolbar-btn-back');
    this.btnForward = document.getElementById('toolbar-btn-forward');
    this.btnReload = document.getElementById('toolbar-btn-reload');
    this.btnCloseActive = document.getElementById('toolbar-btn-close-active');

    // Window Shelf
    this.shelf = document.getElementById('window-shelf');
    this.shelfList = document.getElementById('window-shelf-list');

    // Collapsible Toolbar
    this.toolbarEl = document.getElementById('toolbar');
    this.btnToggleToolbar = document.getElementById('btn-toggle-toolbar');
    this.expandTrigger = document.getElementById('toolbar-expand-trigger');
    this.isCollapsed = false;

    // App Menu Dropdown
    this.appMenuBtn = document.getElementById('app-menu-btn');
    this.appMenuDropdown = document.getElementById('app-dropdown-menu');

    this._bindEvents();
    this._bindMenuActions();
  }

  _bindEvents() {
    if (this.btnBack) {
      this.btnBack.addEventListener('click', () => {
        const id = this.app.getActiveWindow();
        if (id) this.app.navigateWindow(id, 'back');
      });
    }

    if (this.btnForward) {
      this.btnForward.addEventListener('click', () => {
        const id = this.app.getActiveWindow();
        if (id) this.app.navigateWindow(id, 'forward');
      });
    }

    if (this.btnReload) {
      this.btnReload.addEventListener('click', () => {
        const id = this.app.getActiveWindow();
        if (id) this.app.navigateWindow(id, 'reload');
      });
    }

    if (this.btnCloseActive) {
      this.btnCloseActive.addEventListener('click', () => {
        const id = this.app.getActiveWindow();
        if (id) this.app.closeWindow(id);
      });
    }

    if (this.navigateBtn) {
      this.navigateBtn.addEventListener('click', () => this.handleNavigate());
    }

    if (this.urlInput) {
      this.urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleNavigate();
        }
      });
    }

    if (this.newWindowBtn) {
      this.newWindowBtn.addEventListener('click', () => {
        if (this.app.hub && this.app.hub.isOpen) {
          this.app.hub.close();
        }
        this.app.createWindow('https://www.google.com');
      });
    }

    if (this.hubToggleBtn) {
      this.hubToggleBtn.addEventListener('click', () => {
        if (this.app.tabManager && this.app.tabManager.isOpen) {
          this.app.tabManager.close();
        }
        if (this.app.hub) {
          this.app.hub.toggle();
        }
      });
    }

    if (this.windowsPopupBtn) {
      this.windowsPopupBtn.addEventListener('click', () => {
        if (this.app.hub && this.app.hub.isOpen) {
          this.app.hub.close();
        }
        if (this.app.tabManager) {
          this.app.tabManager.toggle();
        }
      });
    }

    const brand = document.getElementById('brand-logo');
    if (brand) {
      brand.addEventListener('click', () => {
        if (this.app.hub) this.app.hub.toggle();
      });
    }

    // Horizontal wheel scroll for the tabs shelf with comfortable hitbox
    if (this.shelf) {
      this.shelf.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          this.shelf.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // Toggle Toolbar Collapse
    if (this.btnToggleToolbar) {
      this.btnToggleToolbar.addEventListener('click', () => {
        this.toggleToolbarCollapse();
      });
    }

    if (this.expandTrigger) {
      this.expandTrigger.addEventListener('click', () => {
        this.toggleToolbarCollapse(false);
      });
    }

    // App Menu dropdown toggle
    if (this.appMenuBtn && this.appMenuDropdown) {
      this.appMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.appMenuDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#app-dropdown-menu') && !e.target.closest('#app-menu-btn')) {
          this.appMenuDropdown.classList.add('hidden');
        }
      });
    }

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      // Ctrl+W closes active window
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        const id = this.app.getActiveWindow();
        if (id) {
          e.preventDefault();
          this.app.closeWindow(id);
        }
      }
      // F10 toggles toolbar collapse
      if (e.key === 'F10') {
        e.preventDefault();
        this.toggleToolbarCollapse();
      }
      // F11 toggles fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        if (this.app.api && this.app.api.toggleFullscreen) {
          this.app.api.toggleFullscreen();
        }
      }
    });
  }

  _bindMenuActions() {
    if (!this.appMenuDropdown) return;

    this.appMenuDropdown.querySelectorAll('.menu-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.appMenuDropdown.classList.add('hidden');
        this.handleMenuAction(action);
      });
    });
  }

  handleMenuAction(action) {
    const activeId = this.app.getActiveWindow();

    switch (action) {
      case 'new-window':
        this.app.createWindow('https://www.google.com');
        break;
      case 'open-hub':
        if (this.app.hub) this.app.hub.open();
        break;
      case 'close-active':
        if (activeId) this.app.closeWindow(activeId);
        break;
      case 'app-exit':
        if (this.app.api && this.app.api.appExit) this.app.api.appExit();
        break;
      case 'nav-back':
        if (activeId) this.app.navigateWindow(activeId, 'back');
        break;
      case 'nav-forward':
        if (activeId) this.app.navigateWindow(activeId, 'forward');
        break;
      case 'nav-reload':
        if (activeId) this.app.navigateWindow(activeId, 'reload');
        break;
      case 'copy-url':
        if (activeId && this.urlInput && this.app.api && this.app.api.copyText) {
          this.app.api.copyText(this.urlInput.value);
        }
        break;
      case 'toggle-toolbar':
        this.toggleToolbarCollapse();
        break;
      case 'toggle-fullscreen':
        if (this.app.api && this.app.api.toggleFullscreen) {
          this.app.api.toggleFullscreen();
        }
        break;
      case 'open-tab-manager':
        if (this.app.tabManager) this.app.tabManager.open();
        break;
      case 'cascade-windows':
        if (this.app.api && this.app.api.cascadeWindows) {
          this.app.api.cascadeWindows();
        }
        break;
      case 'minimize-all':
        this.app.windows.forEach((_, id) => {
          this.app.workspace.toggleMinimize(id, true);
        });
        break;
      case 'restore-all':
        this.app.windows.forEach((_, id) => {
          this.app.workspace.toggleMinimize(id, false);
        });
        break;
    }
  }

  toggleToolbarCollapse(forceState) {
    this.isCollapsed = forceState !== undefined ? !!forceState : !this.isCollapsed;

    if (this.toolbarEl) {
      this.toolbarEl.classList.toggle('collapsed', this.isCollapsed);
    }
    if (this.expandTrigger) {
      this.expandTrigger.classList.toggle('hidden', !this.isCollapsed);
    }

    const ws = document.getElementById('workspace');
    if (ws) {
      ws.classList.toggle('toolbar-collapsed', this.isCollapsed);
    }

    if (this.app.api && this.app.api.setToolbarCollapsed) {
      this.app.api.setToolbarCollapsed(this.isCollapsed);
    }

    if (this.app.workspace && this.app.workspace.repositionAll) {
      requestAnimationFrame(() => {
        this.app.workspace.repositionAll();
      });
    }
  }

  handleNavigate() {
    if (!this.urlInput) return;
    const rawVal = this.urlInput.value.trim();
    if (!rawVal) return;

    if (this.app.hub && this.app.hub.isOpen) {
      this.app.hub.close();
    }

    const activeId = this.app.getActiveWindow();
    if (activeId) {
      this.app.loadURL(activeId, rawVal);
    } else {
      this.app.createWindow(rawVal);
    }
  }

  setAddressBar(url) {
    if (!this.urlInput) return;
    if (document.activeElement !== this.urlInput) {
      this.urlInput.value = url || '';
    }
  }

  updateTabsBadge(count) {
    if (this.openTabsBadge) {
      this.openTabsBadge.textContent = String(count);
    }
    const hasActive = !!this.app.getActiveWindow();
    [this.btnBack, this.btnForward, this.btnReload, this.btnCloseActive].forEach(b => {
      if (b) {
        b.style.opacity = hasActive ? '1' : '0.4';
        b.style.pointerEvents = hasActive ? 'auto' : 'none';
      }
    });

    this.renderWindowShelf();
  }

  updateChipState(id, state) {
    if (!this.shelfList) return;
    const chip = this.shelfList.querySelector(`[data-id="${id}"]`);
    if (!chip) return;

    if (state.minimized !== undefined) {
      chip.classList.toggle('minimized', !!state.minimized);
    }
  }

  renderWindowShelf() {
    if (!this.shelfList) return;
    this.shelfList.innerHTML = '';

    const activeId = this.app.getActiveWindow();
    const windows = Array.from(this.app.windows.values());

    windows.forEach(win => {
      const chip = document.createElement('div');
      const isMin = this.app.workspace && this.app.workspace.frames.get(win.id)?.classList.contains('minimized');
      chip.className = 'window-chip' + (win.id === activeId ? ' active' : '') + (isMin ? ' minimized' : '');
      chip.dataset.id = win.id;

      const safeTitle = this._escapeHtml(win.title || 'Нова сторінка');

      chip.innerHTML = `
        <span class="chip-icon">${win.favicon ? `<img src="${this._escapeHtml(win.favicon)}" style="width:14px;height:14px;object-fit:contain;" alt="" onerror="this.outerHTML='🌐'"/>` : '🌐'}</span>
        <span class="chip-title" title="${safeTitle}">${safeTitle}</span>
        <button class="chip-close" data-action="close" title="Закрити вікно">✕</button>
      `;

      chip.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close"]')) return;
        // If minimized, restore it
        const frame = this.app.workspace.frames.get(win.id);
        if (frame && frame.classList.contains('minimized')) {
          this.app.workspace.toggleMinimize(win.id, false);
        }
        this.app.setActiveWindow(win.id);
      });

      const btnClose = chip.querySelector('[data-action="close"]');
      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          this.app.closeWindow(win.id);
        });
      }

      this.shelfList.appendChild(chip);
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.Toolbar = Toolbar;
