'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
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

  // Bookmarks Operations
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (data) => ipcRenderer.invoke('add-bookmark', data),
  updateBookmark: (id, data) => ipcRenderer.invoke('update-bookmark', id, data),
  deleteBookmark: (id) => ipcRenderer.invoke('delete-bookmark', id),
  reorderBookmarks: (orderedIds) => ipcRenderer.invoke('reorder-bookmarks', orderedIds),

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
};

contextBridge.exposeInMainWorld('spatialAPI', api);
contextBridge.exposeInMainWorld('spatialBrowser', api);
