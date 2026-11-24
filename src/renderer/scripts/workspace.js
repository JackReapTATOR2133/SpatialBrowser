'use strict';

class Workspace {
  constructor(app) {
    this.app = app;
    this.workspaceEl = document.getElementById('workspace');
    this.container = document.getElementById('phantom-frames');
    this.placeholder = document.getElementById('workspace-placeholder');
    this.frames = new Map();
    this.activeId = null;
    this.windowControls = new WindowControls(this);

    this._setupPlaceholder();
    this._setupWindowMoveListener();
  }

  _setupWindowMoveListener() {
    if (this.app && this.app.api && this.app.api.onActiveWindowMoved) {
      this.app.api.onActiveWindowMoved((data) => {
        if (!data || !data.id) return;
        const targetFrame = this.frames.get(data.id);
        if (targetFrame && data.bounds) {
          const wsRect = this.getWorkspaceRect();
          targetFrame.style.left = `${data.bounds.x - wsRect.left}px`;
          targetFrame.style.top = `${data.bounds.y - wsRect.top}px`;
        }
      });
    }

    if (this.app && this.app.api && this.app.api.onWindowMinimizedChanged) {
      this.app.api.onWindowMinimizedChanged((data) => {
        if (!data || !data.id) return;
        this._applyMinimizedState(data.id, !!data.minimized);
      });
    }
  }

  _setupPlaceholder() {
    if (this.workspaceEl) {
      this.workspaceEl.addEventListener('contextmenu', (e) => {
        if (e.target === this.workspaceEl || e.target === this.placeholder || (e.target && e.target.closest('#workspace-placeholder'))) {
          e.preventDefault();
          if (this.app.api && this.app.api.showContextMenu) {
            this.app.api.showContextMenu('workspace');
          }
        }
      });
    }

    const btnNew = document.getElementById('placeholder-new-window');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        this.app.createWindow('https://www.google.com');
      });
    }

    const btnHub = document.getElementById('placeholder-open-hub');
    if (btnHub) {
      btnHub.addEventListener('click', () => {
        this.app.hub.open();
      });
    }
  }

  getWorkspaceRect() {
    return this.workspaceEl.getBoundingClientRect();
  }

  createPhantomFrame(id, title, url, initialBounds = null) {
    if (this.frames.has(id)) return this.frames.get(id);

    const frame = document.createElement('div');
    frame.className = 'phantom-frame';
    frame.dataset.id = id;

    const wsRect = this.getWorkspaceRect();
    const width = initialBounds?.width || Math.min(760, Math.max(380, Math.round(wsRect.width * 0.6)));
    const height = initialBounds?.height || Math.min(520, Math.max(280, Math.round(wsRect.height * 0.65)));

    // Ensure left & top are within workspace coordinates
    let left = 40;
    let top = 20;

    if (initialBounds && typeof initialBounds.x === 'number') {
      left = initialBounds.x;
      // If bounds y includes toolbar (>= 56), convert to workspace-relative
      top = initialBounds.y >= 56 ? (initialBounds.y - 56) : initialBounds.y;
    } else {
      left = Math.max(20, Math.round((wsRect.width - width) / 2));
      top = Math.max(20, Math.round((wsRect.height - height) / 2));
    }

    // Clamp within workspace
    const maxL = Math.max(0, wsRect.width - width);
    const maxT = Math.max(0, wsRect.height - height);
    left = Math.max(0, Math.min(maxL, left));
    top = Math.max(0, Math.min(maxT, top));

    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.zIndex = '100';

    const safeTitle = this._escapeHtml(title || 'Нова сторінка');

    frame.innerHTML = `
      <div class="phantom-titlebar">
        <div class="phantom-titlebar-left">
          <div class="phantom-titlebar-actions">
            <button class="phantom-btn" data-action="back" title="Назад">◂</button>
            <button class="phantom-btn" data-action="forward" title="Вперед">▸</button>
          </div>
          <span class="phantom-favicon-fallback" data-role="favicon-container">🌐</span>
          <span class="phantom-title" title="${safeTitle}">${safeTitle}</span>
        </div>
        <div class="phantom-titlebar-actions">
          <button class="phantom-btn phantom-btn-minimize" data-action="minimize" title="Згорнути / Розгорнути">─</button>
          <button class="phantom-btn phantom-btn-close" data-action="close" title="Закрити вікно">✕</button>
        </div>
      </div>
      <div class="phantom-content"></div>
      <div class="phantom-resize-handle n"></div>
      <div class="phantom-resize-handle s"></div>
      <div class="phantom-resize-handle e"></div>
      <div class="phantom-resize-handle w"></div>
      <div class="phantom-resize-handle ne"></div>
      <div class="phantom-resize-handle nw"></div>
      <div class="phantom-resize-handle se"></div>
      <div class="phantom-resize-handle sw"></div>
    `;

    // Navigation buttons inside frame
    const btnMinimize = frame.querySelector('[data-action="minimize"]');
    if (btnMinimize) {
      btnMinimize.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMinimize(id);
      });
    }

    const btnClose = frame.querySelector('[data-action="close"]');
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.closeWindow(id);
    });

    const btnBack = frame.querySelector('[data-action="back"]');
    btnBack.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.navigateWindow(id, 'back');
    });

    const btnFwd = frame.querySelector('[data-action="forward"]');
    btnFwd.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.navigateWindow(id, 'forward');
    });

    const titlebar = frame.querySelector('.phantom-titlebar');
    if (titlebar) {
      titlebar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.app.api && this.app.api.showContextMenu) {
          this.app.api.showContextMenu('titlebar', { id });
        }
      });
    }

    this.windowControls.attachFrameEvents(id, frame);

    this.container.appendChild(frame);
    this.frames.set(id, frame);

    this.updatePlaceholder();

    // Sync bounds immediately and after initial render pass
    this.syncFrameBounds(id, frame);
    requestAnimationFrame(() => {
      this.syncFrameBounds(id, frame);
    });

    return frame;
  }

  // Alias for test-runner.js compatibility
  addWindow(id, url, title, bounds) {
    return this.createPhantomFrame(id, title, url, bounds);
  }

  removePhantomFrame(id) {
    const frame = this.frames.get(id);
    if (frame) {
      frame.remove();
      this.frames.delete(id);
      if (this.activeId === id) {
        this.activeId = null;
      }
      this.updatePlaceholder();
    }
  }

  // Alias for test-runner.js compatibility
  removeWindow(id) {
    return this.removePhantomFrame(id);
  }

  setActive(id, isActive) {
    const frame = this.frames.get(id);
    if (!frame) return;

    if (isActive) {
      this.activeId = id;
      frame.classList.add('active');
      this.bringToFront(id);
    } else {
      frame.classList.remove('active');
    }
  }

  toggleMinimize(id, forceState) {
    const frame = this.frames.get(id);
    if (!frame) return;

    const isCurrentlyMinimized = frame.classList.contains('minimized');
    const newState = forceState !== undefined ? !!forceState : !isCurrentlyMinimized;

    if (this.app && this.app.api && this.app.api.minimizeWindow) {
      this.app.api.minimizeWindow(id, newState);
    }

    this._applyMinimizedState(id, newState);
  }

  _applyMinimizedState(id, isMinimized) {
    const frame = this.frames.get(id);
    if (!frame) return;

    const btn = frame.querySelector('[data-action="minimize"]');

    if (isMinimized) {
      frame.classList.add('minimized');
      if (btn) {
        btn.textContent = '▢';
        btn.title = 'Розгорнути вікно';
      }
    } else {
      frame.classList.remove('minimized');
      if (btn) {
        btn.textContent = '─';
        btn.title = 'Згорнути вікно';
      }
      this.syncFrameBounds(id, frame);
    }

    if (this.app && this.app.toolbar && this.app.toolbar.updateChipState) {
      this.app.toolbar.updateChipState(id, { minimized: isMinimized });
    }
  }

  bringToFront(id) {
    const frame = this.frames.get(id);
    if (!frame) return;

    this.activeId = id;
    let maxZ = 100;
    this.frames.forEach((f) => {
      const z = parseInt(f.style.zIndex, 10) || 100;
      if (z > maxZ) maxZ = z;
    });

    frame.style.zIndex = String(maxZ + 1);
  }

  getActiveId() {
    return this.activeId;
  }

  updateTitle(id, title) {
    const frame = this.frames.get(id);
    if (!frame) return;

    const titleEl = frame.querySelector('.phantom-title');
    if (titleEl) {
      const safe = this._escapeHtml(title || 'Untitled');
      titleEl.textContent = safe;
      titleEl.title = safe;
    }
  }

  updateFavicon(id, faviconUrl) {
    const frame = this.frames.get(id);
    if (!frame) return;

    const container = frame.querySelector('[data-role="favicon-container"]');
    if (!container) return;

    if (faviconUrl && typeof faviconUrl === 'string') {
      container.innerHTML = `<img src="${this._escapeHtml(faviconUrl)}" class="phantom-favicon" alt="" onerror="this.parentElement.textContent='🌐'"/>`;
    } else {
      container.innerHTML = '🌐';
    }
  }

  showLoadError(id, url, errorCode, errorDescription) {
    const frame = this.frames.get(id);
    if (!frame) return;

    const content = frame.querySelector('.phantom-content');
    if (!content) return;

    content.innerHTML = `
      <div class="phantom-error">
        <h3>Помилка завантаження сторінки</h3>
        <code>${this._escapeHtml(url || '')}</code>
        <p style="margin-top:10px; font-size:12px; color:var(--text-muted);">
          ${this._escapeHtml(errorDescription || 'Не вдалося підключитися')} (код: ${errorCode})
        </p>
      </div>
    `;
  }

  syncFrameBounds(id, frame) {
    if (!frame) return;
    const contentEl = frame.querySelector('.phantom-content');
    const contentRect = contentEl ? contentEl.getBoundingClientRect() : frame.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    // Exact screen-level coordinates inside the Electron BrowserWindow contentView
    const bounds = {
      // Window frame coordinates
      x: Math.round(frameRect.left),
      y: Math.round(frameRect.top),
      width: Math.round(frameRect.width),
      height: Math.round(frameRect.height),
      // Exact inner content coordinates for native WebContentsView
      contentX: Math.round(contentRect.left),
      contentY: Math.round(contentRect.top),
      contentWidth: Math.round(contentRect.width),
      contentHeight: Math.round(contentRect.height),
      zIndex: parseInt(frame.style.zIndex, 10) || 100,
    };

    this.app.updateViewBounds(id, bounds);
  }

  repositionAll() {
    const wsRect = this.getWorkspaceRect();
    this.frames.forEach((frame, id) => {
      const rect = frame.getBoundingClientRect();
      let left = rect.left - wsRect.left;
      let top = rect.top - wsRect.top;
      let width = rect.width;
      let height = rect.height;

      const maxX = Math.max(0, wsRect.width - width);
      const maxY = Math.max(0, wsRect.height - height);

      left = Math.max(0, Math.min(maxX, left));
      top = Math.max(0, Math.min(maxY, top));

      frame.style.left = `${left}px`;
      frame.style.top = `${top}px`;

      this.syncFrameBounds(id, frame);
    });
  }

  updatePlaceholder() {
    if (!this.placeholder) return;
    const hasWindows = this.frames.size > 0;
    const hubOpen = this.app.hub && this.app.hub.isOpen;
    this.placeholder.style.display = (!hasWindows && !hubOpen) ? 'flex' : 'none';
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.Workspace = Workspace;
window.WorkspaceManager = null;
