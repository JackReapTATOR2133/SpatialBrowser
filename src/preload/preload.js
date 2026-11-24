'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const api = {
  // Add-ons (WebExtensions)
  listExtensions: () => ipcRenderer.invoke('extensions-list'),
  installExtensionDialog: (mode) => ipcRenderer.invoke('extensions-install-dialog', mode),
  installExtensionFromFile: (file) => {
    const filePath = file && webUtils ? webUtils.getPathForFile(file) : '';
    return ipcRenderer.invoke('extensions-install-path', filePath);
  },
  setExtensionEnabled: (key, enabled) => ipcRenderer.invoke('extensions-set-enabled', key, enabled),
  removeExtension: (key) => ipcRenderer.invoke('extensions-remove', key),
  openExtensionPopup: (key, anchor) => ipcRenderer.invoke('extensions-open-popup', key, anchor),
  closeExtensionPopup: () => ipcRenderer.invoke('extensions-close-popup'),
  openExtensionOptions: (key) => ipcRenderer.invoke('extensions-open-options', key),
  onExtensionsChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('extensions-changed', handler);
    return () => ipcRenderer.removeListener('extensions-changed', handler);
  },

  // Window Operations
  createWindow: (url, title) => ipcRenderer.invoke('create-window', url, title),
  closeWindow: (id) => ipcRenderer.invoke('close-window', id),
  setActiveWindow: (id) => ipcRenderer.invoke('set-active-window', id),
  updateViewBounds: (id, bounds) => ipcRenderer.invoke('update-view-bounds', id, bounds),
  navigateWindow: (id, direction) => ipcRenderer.invoke('navigate-window', id, direction),
  loadURL: (id, url) => ipcRenderer.invoke('load-url', id, url),
  getWindowList: () => ipcRenderer.invoke('get-window-list'),
  getActiveWindow: () => ipcRenderer.invoke('get-active-window'),
  bringToFront: (id) => ipcRenderer.invoke('bring-to-front', id),
  setViewsVisible: (visible) => ipcRenderer.invoke('set-views-visible', visible),
  moveActiveWindowBy: (dx, dy) => ipcRenderer.invoke('move-active-window-by', dx, dy),
  setDragging: (isDragging) => ipcRenderer.invoke('set-dragging', isDragging),
  minimizeWindow: (id, minimized) => ipcRenderer.invoke('minimize-window', id, minimized),
  setToolbarCollapsed: (collapsed) => ipcRenderer.invoke('set-toolbar-collapsed', collapsed),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  cascadeWindows: () => ipcRenderer.invoke('cascade-windows'),
  appExit: () => ipcRenderer.invoke('app-exit'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  showContextMenu: (type, payload) => ipcRenderer.invoke('show-context-menu', type, payload),

  // Bookmarks Operations
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (data) => ipcRenderer.invoke('add-bookmark', data),
  updateBookmark: (id, data) => ipcRenderer.invoke('update-bookmark', id, data),
  deleteBookmark: (id) => ipcRenderer.invoke('delete-bookmark', id),
  reorderBookmarks: (orderedIds) => ipcRenderer.invoke('reorder-bookmarks', orderedIds),

  // Downloads Operations
  getDownloads: () => ipcRenderer.invoke('downloads-list'),
  pauseDownload: (id) => ipcRenderer.invoke('download-pause', id),
  resumeDownload: (id) => ipcRenderer.invoke('download-resume', id),
  cancelDownload: (id) => ipcRenderer.invoke('download-cancel', id),
  openDownloadedFile: (id) => ipcRenderer.invoke('download-open-file', id),
  showDownloadedItemInFolder: (id) => ipcRenderer.invoke('download-show-in-folder', id),
  clearDownloads: () => ipcRenderer.invoke('download-clear-history'),
  openDownloadsFolder: () => ipcRenderer.invoke('download-open-folder'),
  onDownloadStarted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-started', handler);
    return () => ipcRenderer.removeListener('download-started', handler);
  },
  onDownloadUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-updated', handler);
    return () => ipcRenderer.removeListener('download-updated', handler);
  },
  onDownloadDone: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download-done', handler);
    return () => ipcRenderer.removeListener('download-done', handler);
  },

  // Event Subscriptions
  onWindowCreated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('window-created', handler);
    return () => ipcRenderer.removeListener('window-created', handler);
  },
  onWindowClosed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('window-closed', handler);
    return () => ipcRenderer.removeListener('window-closed', handler);
  },
  onActiveWindowChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('active-window-changed', handler);
    return () => ipcRenderer.removeListener('active-window-changed', handler);
  },
  onActiveWindowMoved: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('active-window-moved', handler);
    return () => ipcRenderer.removeListener('active-window-moved', handler);
  },
  onViewNavigated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('view-navigated', handler);
    return () => ipcRenderer.removeListener('view-navigated', handler);
  },
  onViewLoadError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('view-load-error', handler);
    return () => ipcRenderer.removeListener('view-load-error', handler);
  },
  onMainWindowResized: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('main-window-resized', handler);
    return () => ipcRenderer.removeListener('main-window-resized', handler);
  },
  onWindowOpenNewTab: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('window-open-new-tab', handler);
    return () => ipcRenderer.removeListener('window-open-new-tab', handler);
  },
  onViewFocused: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('view-focused', handler);
    return () => ipcRenderer.removeListener('view-focused', handler);
  },
  onWindowMinimizedChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('window-minimized-changed', handler);
    return () => ipcRenderer.removeListener('window-minimized-changed', handler);
  },
  onShortcutAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('shortcut-action', handler);
    return () => ipcRenderer.removeListener('shortcut-action', handler);
  },
};

contextBridge.exposeInMainWorld('spatialAPI', api);
contextBridge.exposeInMainWorld('spatialBrowser', api);
