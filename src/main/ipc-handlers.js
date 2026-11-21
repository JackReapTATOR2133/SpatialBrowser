'use strict';

const { ipcMain } = require('electron');

function createIPCHandlers(mainWindow, windowManager, browserViewManager, bookmarksManager) {
  ipcMain.handle('create-window', (_event, url, title) => {
    return windowManager.createWindow(url || null, title || null);
  });

  ipcMain.handle('close-window', (_event, id) => {
    if (!id || typeof id !== 'string') return false;
    return windowManager.closeWindow(id);
  });

  ipcMain.handle('set-active-window', (_event, id) => {
    if (!id || typeof id !== 'string') return false;
    windowManager.setActiveWindow(id);
    return true;
  });

  ipcMain.handle('update-view-bounds', (_event, id, bounds) => {
    if (!id || !bounds) return false;
    browserViewManager.setBounds(id, bounds);
    return true;
  });

  ipcMain.handle('navigate-window', (_event, id, direction) => {
    if (!id) return false;
    windowManager.navigateWindow(id, direction);
    return true;
  });

  ipcMain.handle('load-url', (_event, id, url) => {
    if (!id || typeof url !== 'string') return false;
    windowManager.loadURL(id, url);
    return true;
  });

  ipcMain.handle('get-window-list', () => {
    return windowManager.getWindowList();
  });

  ipcMain.handle('get-active-window', () => {
    return windowManager.getActiveWindowId();
  });

  ipcMain.handle('bring-to-front', (_event, id) => {
    if (!id) return false;
    browserViewManager.bringToFront(id);
    return true;
  });

  ipcMain.handle('move-active-window-by', (_event, dx, dy) => {
    const activeId = windowManager.getActiveWindowId();
    if (!activeId) return false;
    const entry = browserViewManager.windows.get(activeId);
    if (!entry) return false;

    const current = entry.bounds;
    const newBounds = {
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    };
    browserViewManager.setBounds(activeId, newBounds);
    mainWindow.webContents.send('active-window-moved', { id: activeId, bounds: newBounds });
    return true;
  });

  ipcMain.handle('set-views-visible', (_event, visible) => {
    browserViewManager.setVisibleAll(!!visible);
    return true;
  });

  ipcMain.handle('set-dragging', (_event, isDragging) => {
    browserViewManager.setDragging(!!isDragging);
    return true;
  });

  ipcMain.handle('minimize-window', (_event, id, minimized) => {
    if (!id) return false;
    return browserViewManager.minimizeWindow(id, minimized);
  });

  ipcMain.handle('set-toolbar-collapsed', (_event, collapsed) => {
    browserViewManager.setToolbarCollapsed(!!collapsed);
    return true;
  });

  ipcMain.handle('toggle-fullscreen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      return mainWindow.isFullScreen();
    }
    return false;
  });

  ipcMain.handle('cascade-windows', () => {
    const list = windowManager.getWindowList();
    if (!list || list.length === 0) return false;
    const contentSize = mainWindow.getContentSize();
    const tbHeight = browserViewManager.toolbarCollapsed ? 0 : 56;
    let startX = 40;
    let startY = tbHeight + 20;
    list.forEach((w, index) => {
      const x = startX + (index % 8) * 30;
      const y = startY + (index % 8) * 30;
      const width = Math.min(800, contentSize[0] - 60);
      const height = Math.min(540, contentSize[1] - tbHeight - 60);
      browserViewManager.syncBounds(w.id, x, y, width, height, 100 + index);
    });
    mainWindow.webContents.send('main-window-resized');
    return true;
  });

  ipcMain.handle('copy-text', (_event, text) => {
    if (typeof text === 'string') {
      const { clipboard } = require('electron');
      clipboard.writeText(text);
      return true;
    }
    return false;
  });

  ipcMain.handle('app-exit', () => {
    const { app } = require('electron');
    app.quit();
    return true;
  });

  // Bookmarks IPC handlers
  ipcMain.handle('get-bookmarks', () => {
    return bookmarksManager.getBookmarks();
  });

  ipcMain.handle('add-bookmark', (_event, data) => {
    return bookmarksManager.addBookmark(data);
  });

  ipcMain.handle('update-bookmark', (_event, id, data) => {
    return bookmarksManager.updateBookmark(id, data);
  });

  ipcMain.handle('delete-bookmark', (_event, id) => {
    return bookmarksManager.deleteBookmark(id);
  });

  ipcMain.handle('reorder-bookmarks', (_event, orderedIds) => {
    return bookmarksManager.reorderBookmarks(orderedIds);
  });
}

module.exports = { createIPCHandlers };
