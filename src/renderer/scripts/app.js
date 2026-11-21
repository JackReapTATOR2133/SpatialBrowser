'use strict';

class SpatialApp {
  constructor() {
    this.api = window.spatialAPI || window.spatialBrowser;
    if (!this.api) {
      console.error('Fatal: Spatial API is not exposed!');
      return;
    }

    this.windows = new Map();
    this.activeWindowId = null;

    this.workspace = new Workspace(this);
    window.WorkspaceManager = this.workspace; // Backward compatibility for tests

    this.toolbar = new Toolbar(this);
    this.hub = new HomeHub(this);
    this.tabManager = new TabManager(this);

    this._bindAPI();
    this._syncInitial();
  }

  _bindAPI() {
    this.api.onWindowCreated((data) => {
      this._onWindowCreated(data);
    });

    this.api.onWindowClosed((data) => {
      this._onWindowClosed(data);
    });

    this.api.onActiveWindowChanged((data) => {
      this._onActiveWindowChanged(data);
    });

    this.api.onViewNavigated((data) => {
      this._onViewNavigated(data);
    });

    this.api.onViewLoadError((data) => {
      this._onViewLoadError(data);
    });

    this.api.onMainWindowResized(() => {
      this._onMainWindowResized();
    });

    this.api.onWindowOpenNewTab((data) => {
      if (data && data.url) {
        this.createWindow(data.url);
      }
    });

    this.api.onViewFocused((data) => {
      if (data && data.id && data.id !== this.activeWindowId) {
        this.setActiveWindow(data.id);
      }
    });
  }

  async _syncInitial() {
    try {
      const list = await this.api.getWindowList();
      if (list && list.length > 0) {
        list.forEach(w => {
          this._onWindowCreated(w);
        });
        const active = await this.api.getActiveWindow();
        if (active) {
          this.setActiveWindow(active);
        }
      } else {
        this.workspace.updatePlaceholder();
      }
    } catch (err) {
      console.error('Initial sync error:', err);
    }
  }

  async createWindow(url, title) {
    try {
      const id = await this.api.createWindow(url || 'about:blank', title);
      return id;
    } catch (err) {
      console.error('Failed to create window:', err);
      return null;
    }
  }

  async closeWindow(id) {
    try {
      await this.api.closeWindow(id);
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  }

  async setActiveWindow(id) {
    try {
      await this.api.setActiveWindow(id);
    } catch (err) {
      console.error('Failed to set active window:', err);
    }
  }

  async updateViewBounds(id, bounds) {
    try {
      await this.api.updateViewBounds(id, bounds);
    } catch (err) {
      console.error('Failed to update view bounds:', err);
    }
  }

  async navigateWindow(id, direction) {
    try {
      await this.api.navigateWindow(id, direction);
    } catch (err) {
      console.error('Failed to navigate window:', err);
    }
  }

  async loadURL(id, url) {
    try {
      await this.api.loadURL(id, url);
    } catch (err) {
      console.error('Failed to load URL:', err);
    }
  }

  async bringToFront(id) {
    try {
      await this.api.bringToFront(id);
    } catch (err) {
      console.error('Failed to bring to front:', err);
    }
  }

  async setViewsVisible(visible) {
    try {
      await this.api.setViewsVisible(visible);
    } catch (err) {
      console.error('Failed to toggle views visibility:', err);
    }
  }

  getActiveWindow() {
    return this.activeWindowId;
  }

  _onWindowCreated(data) {
    this.windows.set(data.id, {
      id: data.id,
      url: data.url,
      title: data.title || 'Нова вкладка',
      favicon: data.favicon || '',
    });

    this.workspace.createPhantomFrame(data.id, data.title, data.url, data.bounds);
    this.toolbar.updateTabsBadge(this.windows.size);
    if (this.tabManager && this.tabManager.isOpen) {
      this.tabManager.refresh();
    }
  }

  _onWindowClosed(data) {
    this.windows.delete(data.id);
    this.workspace.removePhantomFrame(data.id);
    this.toolbar.updateTabsBadge(this.windows.size);

    if (this.windows.size === 0) {
      this.activeWindowId = null;
      this.toolbar.setAddressBar('');
    }

    if (this.tabManager && this.tabManager.isOpen) {
      this.tabManager.refresh();
    }
  }

  _onActiveWindowChanged(data) {
    this.activeWindowId = data ? data.id : null;

    this.windows.forEach((_, id) => {
      this.workspace.setActive(id, id === this.activeWindowId);
    });

    if (data && data.url) {
      this.toolbar.setAddressBar(data.url);
    }

    this.toolbar.updateTabsBadge(this.windows.size);

    if (this.tabManager && this.tabManager.isOpen) {
      this.tabManager.refresh();
    }
  }

  _onViewNavigated(data) {
    const win = this.windows.get(data.id);
    if (win) {
      win.url = data.url;
      win.title = data.title;
      win.favicon = data.favicon;
    }

    this.workspace.updateTitle(data.id, data.title);
    if (data.favicon) {
      this.workspace.updateFavicon(data.id, data.favicon);
    }

    if (data.id === this.activeWindowId) {
      this.toolbar.setAddressBar(data.url);
    }

    this.toolbar.updateTabsBadge(this.windows.size);

    if (this.tabManager && this.tabManager.isOpen) {
      this.tabManager.refresh();
    }
  }

  _onViewLoadError(data) {
    this.workspace.showLoadError(data.id, data.url, data.errorCode, data.errorDescription);
  }

  _onMainWindowResized() {
    this.workspace.repositionAll();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.spatialApp = new SpatialApp();
});
