'use strict';

const { ipcMain, dialog } = require('electron');

function registerExtensionHandlers(mainWindow, windowManager, extensionsManager) {
  if (!extensionsManager) return;

  const ok = (data) => ({ ok: true, data });
  const fail = (err) => ({ ok: false, error: err && err.message ? err.message : String(err) });
  const isKey = (k) => typeof k === 'string' && /^[a-z0-9-]{1,80}$/.test(k);

  ipcMain.handle('extensions-list', () => extensionsManager.list());

  // The file picker runs in the main process: the renderer never supplies arbitrary paths
  ipcMain.handle('extensions-install-dialog', async (_event, mode) => {
    try {
      const isFolder = mode === 'folder';
      const result = await dialog.showOpenDialog(mainWindow, isFolder
        ? { title: 'Виберіть папку розширення (з manifest.json)', properties: ['openDirectory'] }
        : {
            title: 'Встановити розширення',
            properties: ['openFile'],
            filters: [
              { name: 'Розширення (Firefox / Chrome)', extensions: ['xpi', 'crx', 'zip'] },
              { name: 'Усі файли', extensions: ['*'] },
            ],
          });
      if (result.canceled || !result.filePaths.length) return ok(null);
      return ok(await extensionsManager.install(result.filePaths[0]));
    } catch (err) {
      return fail(err);
    }
  });

  // Drag & drop: path comes from webUtils.getPathForFile of a user-dropped file
  ipcMain.handle('extensions-install-path', async (_event, filePath) => {
    try {
      if (typeof filePath !== 'string' || !/\.(xpi|crx|zip)$/i.test(filePath)) {
        throw new Error('Перетягніть файл .xpi, .crx або .zip');
      }
      return ok(await extensionsManager.install(filePath));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('extensions-set-enabled', async (_event, key, enabled) => {
    try {
      if (!isKey(key)) throw new Error('Некоректний ідентифікатор');
      return ok(await extensionsManager.setEnabled(key, !!enabled));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('extensions-remove', async (_event, key) => {
    try {
      if (!isKey(key)) throw new Error('Некоректний ідентифікатор');
      return ok(await extensionsManager.remove(key));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('extensions-open-popup', (_event, key, anchor) => {
    if (!isKey(key)) return false;
    const a = anchor && typeof anchor === 'object'
      ? { x: +anchor.x || 0, y: +anchor.y || 0, width: +anchor.width || 0, height: +anchor.height || 0 }
      : null;
    return extensionsManager.openPopup(key, a);
  });

  ipcMain.handle('extensions-close-popup', () => {
    extensionsManager.closePopup();
    return true;
  });

  ipcMain.handle('extensions-open-options', (_event, key) => {
    if (!isKey(key)) return false;
    const url = extensionsManager.getOptionsUrl(key);
    if (!url) return false;
    windowManager.createWindow(url, 'Налаштування розширення');
    return true;
  });
}

function createIPCHandlers(mainWindow, windowManager, browserViewManager, bookmarksManager, extensionsManager, downloadsManager) {
  registerExtensionHandlers(mainWindow, windowManager, extensionsManager);

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

  // Downloads IPC handlers
  if (downloadsManager) {
    ipcMain.handle('downloads-list', () => {
      return downloadsManager.list();
    });

    ipcMain.handle('download-pause', (_event, id) => {
      return downloadsManager.pause(id);
    });

    ipcMain.handle('download-resume', (_event, id) => {
      return downloadsManager.resume(id);
    });

    ipcMain.handle('download-cancel', (_event, id) => {
      return downloadsManager.cancel(id);
    });

    ipcMain.handle('download-open-file', async (_event, id) => {
      return downloadsManager.openFile(id);
    });

    ipcMain.handle('download-show-in-folder', (_event, id) => {
      return downloadsManager.showInFolder(id);
    });

    ipcMain.handle('download-clear-history', () => {
      return downloadsManager.clearHistory();
    });

    ipcMain.handle('download-open-folder', () => {
      return downloadsManager.openDownloadsFolder();
    });
  }

  // Context Menu IPC handler for UI elements
  ipcMain.handle('show-context-menu', (_event, type, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const { Menu, clipboard } = require('electron');

    let template = [];

    if (type === 'tab' && payload && payload.id) {
      const id = payload.id;
      const win = browserViewManager.windows.get(id);
      template = [
        {
          label: 'Закрити вікно',
          accelerator: 'CmdOrCtrl+W',
          click: () => windowManager.closeWindow(id),
        },
        {
          label: 'Дублювати вікно',
          click: () => {
            const url = win ? (win.view?.webContents?.getURL() || win.url) : 'https://www.google.com';
            windowManager.createWindow(url);
          },
        },
        {
          label: 'Перезавантажити',
          accelerator: 'CmdOrCtrl+R',
          click: () => windowManager.navigateWindow(id, 'reload'),
        },
        {
          label: win && win.minimized ? 'Розгорнути вікно' : 'Згорнути вікно',
          click: () => browserViewManager.minimizeWindow(id, win ? !win.minimized : true),
        },
        { type: 'separator' },
        {
          label: 'Закрити всі інші вікна',
          click: () => {
            const all = windowManager.getWindowList();
            for (const w of all) {
              if (w.id !== id) windowManager.closeWindow(w.id);
            }
          },
        },
      ];
    } else if (type === 'titlebar' && payload && payload.id) {
      const id = payload.id;
      const win = browserViewManager.windows.get(id);
      template = [
        {
          label: 'Назад',
          accelerator: 'Alt+Left',
          click: () => windowManager.navigateWindow(id, 'back'),
        },
        {
          label: 'Вперед',
          accelerator: 'Alt+Right',
          click: () => windowManager.navigateWindow(id, 'forward'),
        },
        {
          label: 'Перезавантажити',
          accelerator: 'CmdOrCtrl+R',
          click: () => windowManager.navigateWindow(id, 'reload'),
        },
        { type: 'separator' },
        {
          label: 'Дублювати вікно',
          click: () => {
            const url = win ? (win.view?.webContents?.getURL() || win.url) : 'https://www.google.com';
            windowManager.createWindow(url);
          },
        },
        {
          label: 'Копіювати URL',
          click: () => {
            const url = win ? (win.view?.webContents?.getURL() || win.url) : '';
            if (url) clipboard.writeText(url);
          },
        },
        {
          label: win && win.minimized ? 'Розгорнути вікно' : 'Згорнути вікно',
          click: () => browserViewManager.minimizeWindow(id, win ? !win.minimized : true),
        },
        { type: 'separator' },
        {
          label: 'Закрити вікно',
          accelerator: 'CmdOrCtrl+W',
          click: () => windowManager.closeWindow(id),
        },
      ];
    } else if (type === 'workspace') {
      template = [
        {
          label: 'Нове просторове вікно',
          accelerator: 'CmdOrCtrl+N',
          click: () => windowManager.createWindow('https://www.google.com'),
        },
        {
          label: 'Home Hub (Закладки)',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('shortcut-action', 'toggle-hub'),
        },
        {
          label: 'Завантаження',
          accelerator: 'CmdOrCtrl+J',
          click: () => mainWindow.webContents.send('shortcut-action', 'toggle-downloads'),
        },
        {
          label: 'Менеджер вікон',
          accelerator: 'Alt+T',
          click: () => mainWindow.webContents.send('shortcut-action', 'toggle-tab-manager'),
        },
        { type: 'separator' },
        {
          label: 'Каскадне розташування',
          click: () => {
            const list = windowManager.getWindowList();
            if (!list || list.length === 0) return;
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
          },
        },
        {
          label: 'Згорнути всі вікна',
          click: () => {
            const all = windowManager.getWindowList();
            for (const w of all) browserViewManager.minimizeWindow(w.id, true);
          },
        },
        {
          label: 'Відновити всі вікна',
          click: () => {
            const all = windowManager.getWindowList();
            for (const w of all) browserViewManager.minimizeWindow(w.id, false);
          },
        },
      ];
    }

    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow });
      return true;
    }
    return false;
  });
}

module.exports = { createIPCHandlers };
