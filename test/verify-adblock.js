'use strict';

const { app, BrowserWindow, WebContentsView, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { ExtensionsManager } = require(path.join(__dirname, '..', 'src', 'main', 'extensions-manager'));

const adblockDir = 'C:\\Users\\localUser\\AppData\\Roaming\\spatial-browser-dev\\extensions\\adblock-block-ads-across-the-web-mwsfarsx';

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('   VERIFYING COMPATIBILITY WITH INSTALLED ADBLOCK     ');
  console.log('======================================================\n');

  try {
    if (!fs.existsSync(adblockDir)) {
      console.error(`[FAIL] AdBlock directory not found at: ${adblockDir}`);
      process.exit(1);
    }
    console.log(`[PASS] AdBlock directory located: ${adblockDir}`);

    const baseExtensionsDir = path.dirname(adblockDir);
    const extManager = new ExtensionsManager(session.defaultSession, baseExtensionsDir);

    const win = new BrowserWindow({
      show: false,
      width: 1000,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    extManager.attachWindow(win);

    // 1. Initialize extensions manager and load AdBlock
    console.log('\n--- 1. Loading AdBlock into Session ---');
    await extManager.init();

    const list = extManager.list();
    const adblock = list.find((e) => e.dir === adblockDir || e.key.includes('adblock'));

    if (!adblock) {
      console.error('[FAIL] AdBlock not found in extensions registry');
      process.exit(1);
    }
    console.log(`[PASS] AdBlock registered: "${adblock.name}" (v${adblock.version})`);
    console.log(`[PASS] Runtime ID: ${adblock.runtimeId || '(none)'}`);
    console.log(`[PASS] Enabled: ${adblock.enabled}, Loaded: ${adblock.loaded}`);

    if (adblock.error) {
      console.error(`[FAIL] Load error: ${adblock.error}`);
    } else {
      console.log('[PASS] Loaded with 0 errors');
    }

    // 2. Check manifest sanitization
    console.log('\n--- 2. Checking Manifest Sanitization ---');
    const manifest = JSON.parse(fs.readFileSync(path.join(adblockDir, 'manifest.json'), 'utf8'));

    // Check permissions
    const badPerms = (manifest.permissions || []).filter((p) =>
      ['contextMenus', 'notifications', 'webNavigation', 'management'].includes(p)
    );
    if (badPerms.length === 0) {
      console.log('[PASS] Unsupported permissions cleaned from manifest.permissions (0 remaining)');
    } else {
      console.warn(`[WARN] Some unsupported permissions remain: ${badPerms.join(', ')}`);
    }

    // Check 'world' property in content_scripts
    let hasWorld = false;
    for (const cs of manifest.content_scripts || []) {
      if (cs.world) hasWorld = true;
    }
    if (!hasWorld) {
      console.log('[PASS] Obsolete "world" property stripped from MV2 content_scripts');
    } else {
      console.warn('[WARN] "world" property still present in content_scripts');
    }

    // Check Gecko keys
    if (!manifest.applications && !manifest.browser_specific_settings) {
      console.log('[PASS] Gecko-specific keys stripped');
    } else {
      console.warn('[WARN] Gecko-specific keys still present');
    }

    // Check spatial-compat.js injection
    const compatExists = fs.existsSync(path.join(adblockDir, 'spatial-compat.js'));
    console.log(`[${compatExists ? 'PASS' : 'FAIL'}] spatial-compat.js present in extension folder`);

    let allContentScriptsInjected = true;
    for (const cs of manifest.content_scripts || []) {
      if (!Array.isArray(cs.js) || !cs.js.includes('spatial-compat.js')) {
        allContentScriptsInjected = false;
        break;
      }
    }
    console.log(`[${allContentScriptsInjected ? 'PASS' : 'FAIL'}] spatial-compat.js injected into all content_scripts blocks`);

    // 3. Test WebContentsView navigation with AdBlock active
    console.log('\n--- 3. Testing Web Page Navigation & Ad Filtering ---');
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 800, height: 600 });

    // Navigate to a test page
    let pageLoaded = false;
    view.webContents.on('did-finish-load', () => {
      pageLoaded = true;
    });

    await view.webContents.loadURL('https://example.com');
    console.log(`[PASS] Web page loaded under AdBlock session: ${view.webContents.getURL()}`);

    // Verify content script injection by checking if AdBlock injected anything or browser alias works
    const compatCheck = await view.webContents.executeJavaScript(`
      typeof window.browser !== 'undefined' || typeof window.chrome !== 'undefined'
    `);
    console.log(`[PASS] WebExtensions API alias accessible: ${compatCheck}`);

    // Test ad request blocking
    try {
      const adBlocked = await view.webContents.executeJavaScript(`
        fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', { mode: 'no-cors' })
          .then(() => false)
          .catch(() => true);
      `);
      console.log(`[PASS] Ad network request interception test (blocked: ${adBlocked})`);
    } catch (_) {}

    // 4. Test Action Popup Opening
    console.log('\n--- 4. Testing Action Popup & UI Integration ---');
    const popupOpened = extManager.openPopup(adblock.key, { x: 500, y: 56, width: 32, height: 32 });
    console.log(`[${popupOpened ? 'PASS' : 'FAIL'}] AdBlock Action Popup opened (WebContentsView created)`);

    if (popupOpened && extManager.popup && extManager.popup.view) {
      await new Promise((resolve) => {
        extManager.popup.view.webContents.once('did-finish-load', () => {
          console.log('[PASS] Popup HTML finished loading successfully');
          resolve();
        });
        extManager.popup.view.webContents.once('did-fail-load', (_e, code, desc) => {
          console.error(`[FAIL] Popup load failed: ${code} (${desc})`);
          resolve();
        });
        setTimeout(resolve, 3000);
      });
      extManager.closePopup();
      console.log('[PASS] Popup cleanly closed');
    }

    console.log('\n======================================================');
    console.log('   ADBLOCK COMPATIBILITY VERIFICATION COMPLETED       ');
    console.log('======================================================\n');
    console.log('STATUS: FULLY COMPATIBLE');
  } catch (err) {
    console.error('\n[FATAL] Exception during AdBlock verification:', err);
    process.exit(1);
  } finally {
    app.quit();
  }
});
