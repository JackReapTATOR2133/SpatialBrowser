'use strict';

const { WebContentsView } = require('electron');
const path = require('path');

const TOOLBAR_HEIGHT = 56;
const WINDOW_TITLEBAR_HEIGHT = 34;
const BORDER_WIDTH = 2;

class BrowserViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.windows = new Map(); // id -> { id, view, bounds, lastBounds, contentBounds, zIndex, url, title, favicon, canGoBack, canGoForward }
    this.zCounter = 100;
    this.allVisible = true;
    this.activeId = null;
    this.isDragging = false;
    this.toolbarCollapsed = false;

    // Create native active titlebar view that sits at the top of the native View hierarchy
    this._initActiveTitlebar();

    this._onWindowResize = () => this.repositionAllViews();
    mainWindow.on('resize', this._onWindowResize);
    mainWindow.on('closed', () => {
      mainWindow.removeListener('resize', this._onWindowResize);
    });
  }

  // Backwards and test-friendly alias
  get views() {
    return this.windows;
  }

  _getContentView() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;
    try {
      return this.mainWindow.contentView;
    } catch (_) {
      return null;
    }
  }

  _initActiveTitlebar() {
    try {
      this.activeTitlebarView = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, '..', 'preload', 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      this.activeTitlebarView.setBackgroundColor('#1e2235');
      const cv = this._getContentView();
      if (cv) {
        cv.addChildView(this.activeTitlebarView);
      }
      this.activeTitlebarView.setBounds({ x: -2000, y: -2000, width: 100, height: 35 });
      this.activeTitlebarView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'titlebar.html'));
    } catch (err) {
      console.error('Failed to init activeTitlebarView:', err);
    }
  }

  setDragging(isDragging) {
    this.isDragging = !!isDragging;
    if (this.isDragging) {
      if (this.activeTitlebarView) {
        this.activeTitlebarView.setBounds({ x: -2000, y: -2000, width: 100, height: 35 });
      }
    } else {
      this._updateActiveTitlebar();
    }
  }

  setToolbarCollapsed(collapsed) {
    this.toolbarCollapsed = !!collapsed;
    this.repositionAllViews();
    this._updateActiveTitlebar();
  }

  minimizeWindow(id, isMinimized) {
    const entry = this.windows.get(id);
    if (!entry) return false;

    entry.minimized = isMinimized !== undefined ? !!isMinimized : !entry.minimized;
    if (entry.minimized) {
      entry.view.setVisible(false);
    } else {
      if (this.allVisible) {
        entry.view.setVisible(true);
      }
    }

    this._updateActiveTitlebar();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('window-minimized-changed', { id, minimized: entry.minimized });
    }
    return entry.minimized;
  }

  setActiveId(id) {
    this.activeId = id;
    this.bringToFront(id);
    this._updateActiveTitlebar();
  }

  _updateActiveTitlebar() {
    if (!this.activeTitlebarView) return;

    if (this.isDragging || !this.allVisible || !this.activeId || !this.windows.has(this.activeId)) {
      this.activeTitlebarView.setBounds({ x: -2000, y: -2000, width: 100, height: 35 });
      return;
    }

    const entry = this.windows.get(this.activeId);
    if (!entry || entry.minimized) {
      this.activeTitlebarView.setBounds({ x: -2000, y: -2000, width: 100, height: 35 });
      return;
    }

    const tbHeight = this.toolbarCollapsed ? 0 : TOOLBAR_HEIGHT;
    const absY = entry.bounds.y < tbHeight ? entry.bounds.y + tbHeight : entry.bounds.y;
    const titleBounds = {
      x: Math.round(entry.bounds.x),
      y: Math.round(absY),
      width: Math.round(entry.bounds.width),
      height: 35
    };

    this.activeTitlebarView.setBounds(titleBounds);
    // Re-attach as topmost native view
    const cv = this._getContentView();
    if (cv) {
      try { cv.addChildView(this.activeTitlebarView); } catch (_) {}
    }

    const title = entry.title || 'Untitled';
    const favicon = entry.favicon || '';
    const payload = JSON.stringify({ id: entry.id, title, favicon });
    this.activeTitlebarView.webContents.executeJavaScript(`
      if (window.electronAPI && window.electronAPI.updateInfo) {
        window.electronAPI.updateInfo(${payload});
      }
    `).catch(() => {});
  }

  createWebWindow(url, customId = null) {
    const id = customId || `win-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    view.setBackgroundColor('#161822');
    const cv = this._getContentView();
    if (cv) {
      try { cv.addChildView(view); } catch (_) {}
    }

    const defaultBounds = {
      x: 40,
      y: TOOLBAR_HEIGHT + 20,
      width: 720,
      height: 480
    };

    const entry = {
      id,
      view,
      url: url || 'about:blank',
      title: 'Нове вікно',
      favicon: '',
      bounds: { ...defaultBounds },
      lastBounds: { ...defaultBounds },
      contentBounds: null,
      zIndex: ++this.zCounter,
      canGoBack: false,
      canGoForward: false,
      minimized: false,
    };

    this.windows.set(id, entry);

    const nativeBounds = this.calculateViewBounds(id);
    view.setBounds(nativeBounds);
    if (!this.allVisible) {
      view.setVisible(false);
    }

    if (url && url !== 'about:blank') {
      view.webContents.loadURL(this.normalizeURL(url));
    }

    this._wireViewEvents(id, view, entry);

    view.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      this.mainWindow.webContents.send('window-open-new-tab', { url: targetUrl });
      return { action: 'deny' };
    });

    return entry;
  }

  // Alias for createWindow
  createView(id, url) {
    return this.createWebWindow(url, id).view;
  }

  _canGoBack(wc) {
    if (!wc || wc.isDestroyed()) return false;
    if (wc.navigationHistory && typeof wc.navigationHistory.canGoBack === 'function') {
      return wc.navigationHistory.canGoBack();
    }
    return typeof wc.canGoBack === 'function' ? wc.canGoBack() : false;
  }

  _canGoForward(wc) {
    if (!wc || wc.isDestroyed()) return false;
    if (wc.navigationHistory && typeof wc.navigationHistory.canGoForward === 'function') {
      return wc.navigationHistory.canGoForward();
    }
    return typeof wc.canGoForward === 'function' ? wc.canGoForward() : false;
  }

  _goBack(wc) {
    if (!wc || wc.isDestroyed()) return;
    if (wc.navigationHistory && typeof wc.navigationHistory.goBack === 'function') {
      wc.navigationHistory.goBack();
    } else if (typeof wc.goBack === 'function') {
      wc.goBack();
    }
  }

  _goForward(wc) {
    if (!wc || wc.isDestroyed()) return;
    if (wc.navigationHistory && typeof wc.navigationHistory.goForward === 'function') {
      wc.navigationHistory.goForward();
    } else if (typeof wc.goForward === 'function') {
      wc.goForward();
    }
  }

  _wireViewEvents(id, view, entry) {
    const notifyNavigated = () => {
      if (!this.windows.has(id)) return;
      const wc = view.webContents;
      entry.url = wc.getURL() || entry.url;
      entry.title = wc.getTitle() || entry.title || 'Untitled';
      entry.canGoBack = this._canGoBack(wc);
      entry.canGoForward = this._canGoForward(wc);

      this.mainWindow.webContents.send('view-navigated', {
        id,
        url: entry.url,
        title: entry.title,
        favicon: entry.favicon,
        canGoBack: entry.canGoBack,
        canGoForward: entry.canGoForward,
      });

      if (id === this.activeId) {
        this._updateActiveTitlebar();
      }
    };

    view.webContents.on('focus', () => {
      this.setActiveId(id);
      this.mainWindow.webContents.send('view-focused', { id });
    });

    view.webContents.on('did-finish-load', notifyNavigated);
    view.webContents.on('did-navigate', notifyNavigated);
    view.webContents.on('did-navigate-in-page', notifyNavigated);

    view.webContents.on('page-title-updated', (_event, title) => {
      if (!this.windows.has(id)) return;
      entry.title = title || 'Untitled';
      notifyNavigated();
    });

    view.webContents.on('page-favicon-updated', (_event, favicons) => {
      if (!this.windows.has(id)) return;
      if (favicons && favicons.length > 0) {
        entry.favicon = favicons[0];
        notifyNavigated();
      }
    });

    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (!this.windows.has(id)) return;
      this.mainWindow.webContents.send('view-load-error', {
        id,
        url: validatedURL || view.webContents.getURL() || entry.url,
        errorCode,
        errorDescription,
      });
    });
  }

  normalizeURL(input) {
    if (!input || typeof input !== 'string' || input.trim() === '') return 'about:blank';
    const trimmed = input.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^file:\/\//i.test(trimmed)) return trimmed;
    if (/^about:/i.test(trimmed)) return trimmed;
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  calculateViewBounds(id) {
    const entry = this.windows.get(id);
    if (!entry) return { x: 0, y: 0, width: 100, height: 100 };

    const tbHeight = this.toolbarCollapsed ? 0 : TOOLBAR_HEIGHT;
    const bounds = entry.bounds;
    const absY = bounds.y < tbHeight ? bounds.y + tbHeight : bounds.y;
    const absX = bounds.x;

    return {
      x: Math.round(absX) + BORDER_WIDTH,
      y: Math.round(absY) + WINDOW_TITLEBAR_HEIGHT + 1,
      width: Math.max(100, Math.round(bounds.width) - BORDER_WIDTH * 2),
      height: Math.max(100, Math.round(bounds.height) - WINDOW_TITLEBAR_HEIGHT - 1 - BORDER_WIDTH),
    };
  }

  syncBounds(id, x, y, width, height, z) {
    const entry = this.windows.get(id);
    if (!entry) return;

    const clamped = this._clampToWorkspace({ x, y, width, height });
    entry.bounds = clamped;
    entry.lastBounds = { ...clamped };
    entry.contentBounds = null;
    if (typeof z === 'number' && !isNaN(z)) {
      entry.zIndex = z;
    }

    entry.view.setBounds(this.calculateViewBounds(id));
    if (id === this.activeId) {
      this._updateActiveTitlebar();
    }
  }

  setBounds(id, bounds) {
    const entry = this.windows.get(id);
    if (!entry || !bounds) return;

    if (bounds.contentX !== undefined && bounds.contentWidth !== undefined) {
      entry.bounds = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };
      entry.lastBounds = { ...entry.bounds };
      if (typeof bounds.zIndex === 'number') {
        entry.zIndex = bounds.zIndex;
      }

      entry.contentBounds = {
        x: Math.max(0, Math.round(bounds.contentX)),
        y: Math.max(0, Math.round(bounds.contentY)),
        width: Math.max(100, Math.round(bounds.contentWidth)),
        height: Math.max(100, Math.round(bounds.contentHeight))
      };

      entry.view.setBounds(entry.contentBounds);
      if (id === this.activeId) {
        this._updateActiveTitlebar();
      }
    } else {
      this.syncBounds(id, bounds.x, bounds.y, bounds.width, bounds.height, bounds.zIndex);
    }
  }

  _clampToWorkspace(bounds) {
    const contentSize = this.mainWindow.getContentSize();
    const minX = 0;
    const minY = TOOLBAR_HEIGHT;
    const minWidth = 260;
    const minHeight = 160;

    const width = Math.max(minWidth, Math.min(contentSize[0], bounds.width || minWidth));
    const height = Math.max(minHeight, Math.min(contentSize[1] - minY, bounds.height || minHeight));

    const maxX = Math.max(minX, contentSize[0] - width);
    const maxY = Math.max(minY, contentSize[1] - height);

    const x = Math.max(minX, Math.min(maxX, bounds.x ?? minX));
    const y = Math.max(minY, Math.min(maxY, bounds.y ?? minY));

    return { x, y, width, height };
  }

  bringToFront(id) {
    const target = this.windows.get(id);
    if (!target) return;

    target.zIndex = ++this.zCounter;

    const cv = this._getContentView();
    if (cv) {
      // Sort views by zIndex and re-attach in order
      const sorted = Array.from(this.windows.values()).sort((a, b) => a.zIndex - b.zIndex);
      for (const item of sorted) {
        try { cv.addChildView(item.view); } catch (_) {}
      }

      // Always re-attach the active titlebar view as the topmost view
      if (this.activeTitlebarView) {
        try { cv.addChildView(this.activeTitlebarView); } catch (_) {}
      }
    }
  }

  closeWebWindow(id) {
    const entry = this.windows.get(id);
    if (!entry) return false;

    const cv = this._getContentView();
    if (cv && entry.view) {
      try { cv.removeChildView(entry.view); } catch (_) {}
    }

    const wc = entry.view?.webContents;
    if (wc && !wc.isDestroyed()) {
      try { wc.close(); } catch (_) {}
    }

    this.windows.delete(id);
    if (this.activeId === id) {
      this.activeId = null;
      this._updateActiveTitlebar();
    }
    return true;
  }

  closeView(id) {
    return this.closeWebWindow(id);
  }

  navigateTo(id, url) {
    const entry = this.windows.get(id);
    if (!entry) return;

    const wc = entry.view.webContents;
    if (!wc || wc.isDestroyed()) return;

    const norm = this.normalizeURL(url);
    entry.url = norm;
    wc.loadURL(norm);
  }

  loadURL(id, url) {
    this.navigateTo(id, url);
  }

  navigate(id, direction) {
    const entry = this.windows.get(id);
    if (!entry) return;

    const wc = entry.view.webContents;
    if (!wc || wc.isDestroyed()) return;

    if (direction === 'back' && this._canGoBack(wc)) {
      this._goBack(wc);
    } else if (direction === 'forward' && this._canGoForward(wc)) {
      this._goForward(wc);
    } else if (direction === 'reload') {
      wc.reload();
    }
  }

  setVisibleAll(visible) {
    this.allVisible = !!visible;
    for (const entry of this.windows.values()) {
      try {
        if (entry.view && typeof entry.view.setVisible === 'function') {
          entry.view.setVisible(this.allVisible && !entry.minimized);
        }
      } catch (err) {
        console.error('Error toggling view visibility:', err);
      }
    }
    if (this.activeTitlebarView) {
      this.activeTitlebarView.setVisible(this.allVisible);
      if (this.allVisible) {
        this._updateActiveTitlebar();
      }
    }
  }

  repositionAllViews() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('main-window-resized');
    }
  }

  destroyAll() {
    const cv = this._getContentView();
    for (const [id, entry] of this.windows) {
      try {
        if (cv && entry.view) {
          try { cv.removeChildView(entry.view); } catch (_) {}
        }
        const wc = entry.view?.webContents;
        if (wc && !wc.isDestroyed()) {
          wc.close();
        }
      } catch (_) {}
      this.windows.delete(id);
    }
    if (this.activeTitlebarView) {
      try {
        if (cv) {
          try { cv.removeChildView(this.activeTitlebarView); } catch (_) {}
        }
        const twc = this.activeTitlebarView.webContents;
        if (twc && !twc.isDestroyed()) {
          twc.close();
        }
      } catch (_) {}
      this.activeTitlebarView = null;
    }
  }

  getViewInfo(id) {
    const entry = this.windows.get(id);
    if (!entry) return null;

    const wc = entry.view.webContents;
    return {
      id,
      url: (wc && !wc.isDestroyed()) ? wc.getURL() : entry.url,
      title: (wc && !wc.isDestroyed()) ? wc.getTitle() : entry.title,
      favicon: entry.favicon,
      bounds: entry.bounds,
      canGoBack: this._canGoBack(wc),
      canGoForward: this._canGoForward(wc),
    };
  }

  getWindows() {
    return Array.from(this.windows.values()).map(w => this.getViewInfo(w.id));
  }

  getAllViewIds() {
    return Array.from(this.windows.keys());
  }

  hasView(id) {
    return this.windows.has(id);
  }
}

module.exports = { BrowserViewManager, TOOLBAR_HEIGHT, WINDOW_TITLEBAR_HEIGHT };
