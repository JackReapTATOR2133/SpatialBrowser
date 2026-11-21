'use strict';

/**
 * test-runner.js
 * Automated integration test for Spatial Browser.
 */

async function runTests(mainWindow, browserViewManager, app) {
  console.log('\n========================================');
  console.log('   SPATIAL BROWSER INTEGRATION TESTS   ');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Wait for renderer to load
    await new Promise(r => setTimeout(r, 1000));

    // 2. Check DOM components
    const domCheck = await mainWindow.webContents.executeJavaScript(`
      ({
        hasToolbar: !!document.getElementById('toolbar'),
        hasUrlInput: !!document.getElementById('url-input'),
        hasNavigateBtn: !!document.getElementById('navigate-btn'),
        hasNewWindowBtn: !!document.getElementById('new-window-btn'),
        hasSidebar: !!document.getElementById('sidebar'),
        hasSidebarToggle: !!document.getElementById('sidebar-toggle-btn'),
        hasWorkspace: !!document.getElementById('workspace'),
        hasSpatialBrowserAPI: !!window.spatialBrowser,
        hasWindowsPopupBtn: !!document.getElementById('windows-popup-btn'),
        hasWindowsPopupMenu: !!document.getElementById('windows-popup-menu')
      })
    `);

    assert(domCheck.hasToolbar, '1. Toolbar container exists in DOM');
    assert(domCheck.hasUrlInput, '2. Address bar (URL input) exists in navigation sidebar');
    assert(domCheck.hasNavigateBtn, '3. Navigate button exists in navigation sidebar');
    assert(domCheck.hasNewWindowBtn, '4. New window button exists in navigation sidebar');
    assert(domCheck.hasSidebar, '5. Sidebar exists in DOM');
    assert(domCheck.hasSidebarToggle, '6. Sidebar toggle button exists on workspace');
    assert(domCheck.hasWorkspace, '7. Workspace area exists');
    assert(domCheck.hasSpatialBrowserAPI, '8. ContextBridge API (spatialBrowser) exposed securely');
    assert(domCheck.hasWindowsPopupBtn, '8a. Floating windows popup button exists on workspace');
    assert(domCheck.hasWindowsPopupMenu, '8b. Windows switcher popup menu exists on workspace');

    // 3. Test Sidebar Toggle
    const sidebarInitial = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('sidebar').classList.contains('open')
    `);
    assert(!sidebarInitial, '9. Sidebar is initially hidden (not taking workspace space)');

    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('sidebar-toggle-btn').click();
    `);
    const sidebarOpened = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('sidebar').classList.contains('open')
    `);
    assert(sidebarOpened, '10. Sidebar opens when toggle button clicked');

    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('sidebar-toggle-btn').click();
    `);
    const sidebarClosedAgain = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('sidebar').classList.contains('open')
    `);
    assert(!sidebarClosedAgain, '11. Sidebar closes when toggle button clicked again');

    // 3b. Test Windows Switcher Popup Menu Toggle
    const menuInitialHidden = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-menu').classList.contains('hidden')
    `);
    assert(menuInitialHidden, '11a. Windows popup menu is initially hidden');

    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-btn').click();
    `);
    const menuOpened = await mainWindow.webContents.executeJavaScript(`
      !document.getElementById('windows-popup-menu').classList.contains('hidden')
    `);
    assert(menuOpened, '11b. Windows popup menu opens when floating button clicked');

    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-btn').click();
    `);
    const menuClosedAgain = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-menu').classList.contains('hidden')
    `);
    assert(menuClosedAgain, '11c. Windows popup menu closes when floating button clicked again');

    // 4. Test opening multiple independent web windows (at least 3)
    console.log('\n--- Testing independent WebContentsView creation ---');
    const win1 = browserViewManager.createWebWindow('https://example.com');
    const win2 = browserViewManager.createWebWindow('https://example.org');
    const win3 = browserViewManager.createWebWindow('https://example.net');

    assert(win1 && win1.id, '12. Created Window 1 (https://example.com)');
    assert(win2 && win2.id, '13. Created Window 2 (https://example.org)');
    assert(win3 && win3.id, '14. Created Window 3 (https://example.net)');

    const allWindows = browserViewManager.getWindows();
    assert(allWindows.length >= 3, `15. Main process tracks at least 3 active windows (count: ${allWindows.length})`);

    // Add matching frames in renderer
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        window.WorkspaceManager.addWindow(${win1.id}, 'https://example.com', 'Example 1');
        window.WorkspaceManager.addWindow(${win2.id}, 'https://example.org', 'Example 2');
        window.WorkspaceManager.addWindow(${win3.id}, 'https://example.net', 'Example 3');
        return true;
      })()
    `);

    const frameCount = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.frames.size
    `);
    assert(frameCount >= 3, `16. Renderer tracks matching window frames (count: ${frameCount})`);

    // 5. Test move and bounds synchronization
    console.log('\n--- Testing bounds synchronization (move & resize) ---');
    browserViewManager.syncBounds(win1.id, 120, 80, 700, 500, 0);
    const win1Entry = browserViewManager.windows.get(win1.id);
    assert(
      win1Entry && win1Entry.lastBounds && win1Entry.lastBounds.x === 120 && win1Entry.lastBounds.y === 80,
      '17. syncBounds correctly updates window position (x=120, y=80)'
    );

    // 6. Test resize
    browserViewManager.syncBounds(win1.id, 120, 80, 900, 650, 0);
    assert(
      win1Entry.lastBounds.width === 900 && win1Entry.lastBounds.height === 650,
      '18. syncBounds correctly updates window dimensions (900x650)'
    );

    // 7. Test Z-index and bringToFront
    console.log('\n--- Testing Z-index & Window Activation ---');
    browserViewManager.bringToFront(win1.id);
    const z1 = browserViewManager.windows.get(win1.id).zIndex;
    browserViewManager.bringToFront(win2.id);
    const z2 = browserViewManager.windows.get(win2.id).zIndex;
    assert(z2 > z1, `19. bringToFront sets higher zIndex for active window (z2=${z2} > z1=${z1})`);

    await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.bringToFront(${win2.id});
    `);
    const activeFrameId = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.getActiveId()
    `);
    assert(activeFrameId === win2.id, '20. Active window switching reflected in renderer workspace');

    // 8. Test Navigation
    console.log('\n--- Testing Navigation ---');
    browserViewManager.navigateTo(win3.id, 'https://example.org');
    const updatedUrl = browserViewManager.windows.get(win3.id).url;
    assert(updatedUrl === 'https://example.org', '21. navigateTo updates target window URL');

    // 9. Test Close and Resource Cleanup
    console.log('\n--- Testing Close & Resource Cleanup ---');
    browserViewManager.closeWebWindow(win2.id);
    const existsAfterClose = browserViewManager.windows.has(win2.id);
    assert(!existsAfterClose, '22. closeWebWindow cleanly removes WebContentsView and unregisters ID');

    await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.removeWindow(${win2.id});
    `);
    const frameCountAfterClose = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.frames.size
    `);
    assert(frameCountAfterClose === frameCount - 1, '23. Frame removed from renderer DOM upon close');

    console.log('\n========================================');
    console.log(`   RESULTS: ${passed} PASSED, ${failed} FAILED   `);
    console.log('========================================\n');

    if (failed === 0) {
      console.log('ALL PHASE 1 CRITERIA SUCCESSFULLY VERIFIED!\n');
      process.exitCode = 0;
    } else {
      console.error('SOME TESTS FAILED!\n');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Exception during integration tests:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}

module.exports = { runTests };
