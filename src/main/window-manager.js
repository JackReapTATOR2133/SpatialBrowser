'use strict';

class WindowManager {
  constructor(browserViewManager, mainWindow, workspaceManager) {
    this.browserViewManager = browserViewManager;
    this.mainWindow = mainWindow;
    this.workspaceManager = workspaceManager;
    this.windows = new Map();
    this.activeWindowId = null;
    this.counter = 1;
  }

  createWindow(url, title) {
    const id = `win-${this.counter++}`;
    const entry = this.browserViewManager.createWebWindow(url, id);

    if (this.workspaceManager) {
      const pos = this.workspaceManager.getNextWindowPosition();
      this.browserViewManager.syncBounds(id, pos.x, pos.y, pos.width, pos.height);
    }

    const windowData = {
      id,
      title: title || 'Нова вкладка',
      url: url || 'about:blank',
      favicon: '',
      createdAt: Date.now(),
    };

    this.windows.set(id, windowData);
    this.setActiveWindow(id);

    const info = this.browserViewManager.getViewInfo(id);

    this.mainWindow.webContents.send('window-created', {
      id,
      url: info ? info.url : windowData.url,
      title: info ? info.title : windowData.title,
      favicon: info ? info.favicon : '',
      bounds: info ? info.bounds : null,
    });

    return id;
  }

  closeWindow(id) {
    const win = this.windows.get(id);
    if (!win) return false;

    this.browserViewManager.closeWebWindow(id);
    this.windows.delete(id);

    this.mainWindow.webContents.send('window-closed', { id });

    if (this.activeWindowId === id) {
      const remaining = Array.from(this.windows.keys());
      if (remaining.length > 0) {
        this.setActiveWindow(remaining[remaining.length - 1]);
      } else {
        this.activeWindowId = null;
        this.mainWindow.webContents.send('active-window-changed', { id: null });
      }
    }

    return true;
  }

  setActiveWindow(id) {
    if (!this.windows.has(id)) return;

    this.activeWindowId = id;
    this.browserViewManager.setActiveId(id);

    const info = this.browserViewManager.getViewInfo(id);
    this.mainWindow.webContents.send('active-window-changed', {
      id,
      url: info ? info.url : '',
      title: info ? info.title : '',
      favicon: info ? info.favicon : '',
      canGoBack: info ? info.canGoBack : false,
      canGoForward: info ? info.canGoForward : false,
    });
  }

  navigateWindow(id, direction) {
    if (!this.windows.has(id)) return;
    this.browserViewManager.navigate(id, direction);
  }

  loadURL(id, url) {
    if (!this.windows.has(id)) return;
    this.browserViewManager.loadURL(id, url);
  }

  getWindowList() {
    return Array.from(this.windows.values()).map(win => {
      const info = this.browserViewManager.getViewInfo(win.id);
      return {
        id: win.id,
        url: info ? info.url : win.url,
        title: info ? info.title : win.title,
        favicon: info ? info.favicon : win.favicon,
        isActive: win.id === this.activeWindowId,
        bounds: info ? info.bounds : null,
        canGoBack: info ? info.canGoBack : false,
        canGoForward: info ? info.canGoForward : false,
      };
    });
  }

  getActiveWindowId() {
    return this.activeWindowId;
  }
}

module.exports = { WindowManager };
