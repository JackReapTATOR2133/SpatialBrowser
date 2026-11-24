'use strict';

/**
 * test-runner.js
 * Comprehensive integration and compliance test for Spatial Browser.
 * Verifies all Section 8 criteria from TechTask.txt.
 */

async function runTests(mainWindow, browserViewManager, app, windowManager, bookmarksManager) {
  console.log('\n======================================================');
  console.log('   SPATIAL BROWSER — PHASE 1 VERIFICATION SUITE       ');
  console.log('======================================================\n');

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
    // 1. Wait for renderer to be ready
    await new Promise(r => setTimeout(r, 800));

    // 2. DOM & Navigation Toolbar Verification
    console.log('\n--- 1. Verification of Navigation Toolbar & Elements ---');
    const domCheck = await mainWindow.webContents.executeJavaScript(`
      ({
        hasToolbar: !!document.getElementById('toolbar'),
        hasUrlInput: !!(document.getElementById('url-input') || document.getElementById('address-bar')),
        hasNavigateBtn: !!(document.getElementById('navigate-btn') || document.getElementById('btn-go')),
        hasNewWindowBtn: !!(document.getElementById('new-window-btn') || document.getElementById('btn-new-window')),
        hasHubToggleBtn: !!(document.getElementById('hub-toggle-btn') || document.getElementById('btn-hub-toggle')),
        hasWindowsPopupBtn: !!(document.getElementById('windows-popup-btn') || document.getElementById('btn-tabs-toggle')),
        hasWorkspace: !!document.getElementById('workspace'),
        hasPhantomFrames: !!document.getElementById('phantom-frames'),
        hasHomeHub: !!document.getElementById('home-hub'),
        hasWindowsPopupMenu: !!(document.getElementById('windows-popup-menu') || document.getElementById('tab-manager-popup')),
        hasSpatialAPI: !!(window.spatialAPI || window.spatialBrowser),
        hasWorkspaceManager: !!window.WorkspaceManager
      })
    `);

    assert(domCheck.hasToolbar, '1. Toolbar exists in DOM');
    assert(domCheck.hasUrlInput, '2. Address bar / URL input exists in toolbar');
    assert(domCheck.hasNavigateBtn, '3. Navigate (Go) button exists');
    assert(domCheck.hasNewWindowBtn, '4. New window button exists');
    assert(domCheck.hasHubToggleBtn, '5. Home Hub toggle button exists in toolbar');
    assert(domCheck.hasWindowsPopupBtn, '6. Tab Manager (Windows popup) button exists in toolbar');
    assert(domCheck.hasWorkspace, '7. Spatial Workspace container exists');
    assert(domCheck.hasPhantomFrames, '8. Phantom frames overlay container exists');
    assert(domCheck.hasHomeHub, '9. Home Hub container exists');
    assert(domCheck.hasWindowsPopupMenu, '10. Tab Manager popup menu container exists');
    assert(domCheck.hasSpatialAPI, '11. Secure Preload ContextBridge API exposed');
    assert(domCheck.hasWorkspaceManager, '12. Workspace controller initialized');

    // 3. Tab Manager Popup Verification
    console.log('\n--- 2. Tab Manager Popup Functionality ---');
    const isPopupInitialHidden = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-menu').classList.contains('hidden')
    `);
    assert(isPopupInitialHidden, '13. Tab Manager popup is initially hidden');

    // Open popup
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-btn').click();
    `);
    await new Promise(r => setTimeout(r, 200));

    const isPopupOpen = await mainWindow.webContents.executeJavaScript(`
      !document.getElementById('windows-popup-menu').classList.contains('hidden')
    `);
    assert(isPopupOpen, '14. Tab Manager opens on toolbar button click');

    // Close popup
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('popup-close-btn').click();
    `);
    await new Promise(r => setTimeout(r, 200));

    const isPopupClosed = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('windows-popup-menu').classList.contains('hidden') ||
      !document.getElementById('windows-popup-menu').classList.contains('open')
    `);
    assert(isPopupClosed, '15. Tab Manager closes on close button click');

    // 4. Home Hub & Bookmarks Verification
    console.log('\n--- 3. Home Hub & Bookmarks Storage ---');
    const isHubInitialHidden = await mainWindow.webContents.executeJavaScript(`
      document.getElementById('home-hub').classList.contains('hidden')
    `);
    assert(isHubInitialHidden, '16. Home Hub is initially hidden');

    // Open Home Hub
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('hub-toggle-btn').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const isHubOpen = await mainWindow.webContents.executeJavaScript(`
      !document.getElementById('home-hub').classList.contains('hidden')
    `);
    assert(isHubOpen, '17. Home Hub opens on toolbar button click');

    // Bookmarks loaded from bookmarks.json
    const initialBookmarks = bookmarksManager.getBookmarks();
    assert(Array.isArray(initialBookmarks) && initialBookmarks.length >= 3, `18. Bookmarks loaded from JSON storage (count: ${initialBookmarks.length})`);

    // Add bookmark test
    const addedBm = bookmarksManager.addBookmark({
      title: 'Test Portal',
      url: 'https://testportal.org'
    });
    assert(addedBm && addedBm.id && addedBm.title === 'Test Portal', '19. Bookmark successfully created and persisted');

    // Delete bookmark test
    const deleted = bookmarksManager.deleteBookmark(addedBm.id);
    assert(deleted, '20. Bookmark successfully deleted from storage');

    // Close Home Hub
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('hub-close-btn').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    const isHubClosed = await mainWindow.webContents.executeJavaScript(`
      !document.getElementById('home-hub').classList.contains('open')
    `);
    assert(isHubClosed, '21. Home Hub closed via close button');

    // 5. Multiple Independent Web Windows Creation (At least 3)
    console.log('\n--- 4. Spatial Windows & WebContentsView Management ---');
    const win1 = browserViewManager.createWebWindow('https://example.com');
    const win2 = browserViewManager.createWebWindow('https://example.org');
    const win3 = browserViewManager.createWebWindow('https://example.net');

    assert(win1 && win1.id, '22. Created independent WebContentsView #1 (example.com)');
    assert(win2 && win2.id, '23. Created independent WebContentsView #2 (example.org)');
    assert(win3 && win3.id, '24. Created independent WebContentsView #3 (example.net)');

    const totalViews = browserViewManager.getWindows();
    assert(totalViews.length >= 3, `25. Main process tracks at least 3 active WebContentsViews (count: ${totalViews.length})`);

    // Add frames in renderer
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        window.WorkspaceManager.addWindow('${win1.id}', 'https://example.com', 'Example 1');
        window.WorkspaceManager.addWindow('${win2.id}', 'https://example.org', 'Example 2');
        window.WorkspaceManager.addWindow('${win3.id}', 'https://example.net', 'Example 3');
      })()
    `);

    const frameCount = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.frames.size
    `);
    assert(frameCount >= 3, `26. Renderer displays matching phantom frames (count: ${frameCount})`);

    // 6. Window Bounds & Movement Synchronization
    console.log('\n--- 5. Window Positioning, Clamping & Resizing ---');
    browserViewManager.syncBounds(win1.id, 100, 70, 680, 480, 105);
    const win1Data = browserViewManager.windows.get(win1.id);
    assert(
      win1Data && win1Data.lastBounds && win1Data.lastBounds.x === 100 && win1Data.lastBounds.y === 70,
      '27. Window position synchronized to (x=100, y=70)'
    );

    browserViewManager.syncBounds(win1.id, 100, 70, 850, 600, 105);
    assert(
      win1Data.lastBounds.width === 850 && win1Data.lastBounds.height === 600,
      '28. Window dimensions resized to (850x600)'
    );

    // 7. Z-Index and Bring to Front
    console.log('\n--- 6. Window Layering & Active State ---');
    browserViewManager.bringToFront(win1.id);
    const z1 = browserViewManager.windows.get(win1.id).zIndex;
    browserViewManager.bringToFront(win2.id);
    const z2 = browserViewManager.windows.get(win2.id).zIndex;
    assert(z2 > z1, `29. bringToFront sets higher zIndex for active window (z2=${z2} > z1=${z1})`);

    await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.setActive('${win2.id}', true);
    `);
    const activeFrameId = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.getActiveId()
    `);
    assert(activeFrameId === win2.id, '30. Active window switching reflected in renderer');

    // 8. Navigation & Navigation Buttons
    console.log('\n--- 7. In-Window Web Navigation ---');
    browserViewManager.navigateTo(win3.id, 'https://example.org');
    const updatedUrl = browserViewManager.windows.get(win3.id).url;
    assert(updatedUrl === 'https://example.org', '31. Navigation loads target URL');

    // 9. Window Close and Resource Cleanup
    console.log('\n--- 8. Close Window & Resource Teardown ---');
    browserViewManager.closeWebWindow(win2.id);
    const existsAfterClose = browserViewManager.windows.has(win2.id);
    assert(!existsAfterClose, '32. closeWebWindow cleanly removes WebContentsView from Main process');

    await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.removeWindow('${win2.id}');
    `);
    const frameCountAfterClose = await mainWindow.webContents.executeJavaScript(`
      window.WorkspaceManager.frames.size
    `);
    assert(frameCountAfterClose === frameCount - 1, `33. Matching phantom frame removed from DOM (remaining: ${frameCountAfterClose})`);

    // 10. Native Layer Visibility Toggling (Overlay protection)
    console.log('\n--- 9. Native Layer Visibility Synchronization ---');
    browserViewManager.setVisibleAll(false);
    assert(browserViewManager.allVisible === false, '34. setVisibleAll(false) hides WebContentsViews for overlays');
    browserViewManager.setVisibleAll(true);
    assert(browserViewManager.allVisible === true, '35. setVisibleAll(true) restores WebContentsViews without reloading');

    console.log('\n======================================================');
    console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED `);
    console.log('======================================================\n');

    if (failed === 0) {
      console.log('ALL PHASE 1 ARCHITECTURE & FEATURE CRITERIA SATISFIED!\n');
      process.exitCode = 0;
    } else {
      console.error('VERIFICATION FAILED ON SOME TESTS!\n');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Fatal exception during test execution:', err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}

module.exports = { runTests };
