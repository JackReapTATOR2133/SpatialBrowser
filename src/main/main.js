'use strict';

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { createIPCHandlers } = require('./ipc-handlers');
const { WindowManager } = require('./window-manager');
const { WorkspaceManager } = require('./workspace-manager');
const { BrowserViewManager } = require('./browser-view-manager');
const { BookmarksManager } = require('./bookmarks-manager');

let mainWindow = null;
let browserViewManager = null;
let workspaceManager = null;
let windowManager = null;
let bookmarksManager = null;

function createMainWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 840,
    minHeight: 600,
    title: 'Spatial Browser',
    autoHideMenuBar: true,
    backgroundColor: '#0d0f17',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  browserViewManager = new BrowserViewManager(mainWindow);
  workspaceManager = new WorkspaceManager(browserViewManager, mainWindow);
  windowManager = new WindowManager(browserViewManager, mainWindow, workspaceManager);
  bookmarksManager = new BookmarksManager();

  createIPCHandlers(mainWindow, windowManager, browserViewManager, bookmarksManager);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-window-resized');
    }
  });

  mainWindow.on('close', () => {
    if (browserViewManager) {
      try {
        browserViewManager.destroyAll();
      } catch (_) {}
    }
  });

  mainWindow.on('closed', () => {
    if (browserViewManager) {
      try {
        browserViewManager.destroyAll();
      } catch (_) {}
    }
    mainWindow = null;
  });

  // Check for test mode
  if (process.argv.includes('--test')) {
    const { runTests } = require(path.join(__dirname, '..', '..', 'test', 'test-runner.js'));
    mainWindow.webContents.once('did-finish-load', () => {
      runTests(mainWindow, browserViewManager, app, windowManager, bookmarksManager);
    });
  }
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
