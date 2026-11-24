'use strict';

const { app, BrowserWindow, Menu, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIPCHandlers } = require('./ipc-handlers');
const { WindowManager } = require('./window-manager');
const { WorkspaceManager } = require('./workspace-manager');
const { BrowserViewManager } = require('./browser-view-manager');
const { BookmarksManager } = require('./bookmarks-manager');
const { ExtensionsManager } = require('./extensions-manager');
const { DownloadsManager } = require('./downloads-manager');

const isTest = process.argv.includes('--test');

// Profile isolation:
// 1. In test mode: clean temporary directory
// 2. In dev mode (npm start): separate 'spatial-browser-dev' profile so you can
//    work in your main browser simultaneously without cache/file collisions
// 3. In packaged production: normal user profile
if (isTest) {
  const testUserData = path.join(os.tmpdir(), `spatial-browser-test-${Date.now()}`);
  app.setPath('userData', testUserData);
} else if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'spatial-browser-dev'));
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
} else {
  // Prevent duplicate instances from conflicting over the user profile & disk cache
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

let mainWindow = null;
let browserViewManager = null;
let workspaceManager = null;
let windowManager = null;
let bookmarksManager = null;
let extensionsManager = null;
let downloadsManager = null;

/**
 * In a packaged build the app folder is a read-only asar archive, so user data
 * (bookmarks) must live in the per-user profile directory. The bundled
 * data/bookmarks.json is used as the initial seed.
 */
function resolveBookmarksPath() {
  const bundled = path.join(__dirname, '..', '..', 'data', 'bookmarks.json');
  const target = path.join(app.getPath('userData'), 'bookmarks.json');
  try {
    if (!fs.existsSync(target) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(bundled, target);
    }
  } catch (err) {
    console.error('Failed to seed bookmarks:', err.message);
  }
  return target;
}

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
  bookmarksManager = new BookmarksManager(resolveBookmarksPath());
  extensionsManager.attachWindow(mainWindow);
  if (downloadsManager) downloadsManager.attachWindow(mainWindow);

  createIPCHandlers(mainWindow, windowManager, browserViewManager, bookmarksManager, extensionsManager, downloadsManager);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('resize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-window-resized');
    }
    if (extensionsManager) extensionsManager.closePopup();
  });

  mainWindow.on('close', () => {
    if (extensionsManager) extensionsManager.closePopup();
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

app.whenReady().then(async () => {
  // Add-ons must be loaded into the session BEFORE any web page is created,
  // so content scripts and request filters apply to every spatial window.
  extensionsManager = new ExtensionsManager(
    session.defaultSession,
    path.join(app.getPath('userData'), 'extensions')
  );
  try {
    await extensionsManager.init();
  } catch (err) {
    console.error('Extensions init failed:', err);
  }

  downloadsManager = new DownloadsManager(path.join(app.getPath('userData')));
  downloadsManager.attachSession(session.defaultSession);

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
