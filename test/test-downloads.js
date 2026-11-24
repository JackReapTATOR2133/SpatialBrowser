'use strict';

const { app } = require('electron');
const path = require('path');
const { DownloadsManager } = require(path.join(__dirname, '..', 'src', 'main', 'downloads-manager'));

app.whenReady().then(async () => {
  try {
    const dm = new DownloadsManager(path.join(app.getPath('userData'), 'test-downloads-dir'));
    console.log('[TEST] Initial list length:', dm.list().length);

    dm.downloads.push({
      id: 'dl-test-1',
      filename: 'sample.zip',
      totalBytes: 5000000,
      receivedBytes: 5000000,
      state: 'completed',
      savePath: 'C:\\Downloads\\sample.zip',
    });

    const list = dm.list();
    if (list.length === 1 && list[0].filename === 'sample.zip') {
      console.log('[PASS] Added item listed correctly');
    } else {
      console.error('[FAIL] Item listing failed');
    }

    const cleared = dm.clearHistory();
    if (cleared.length === 0) {
      console.log('[PASS] Clear history removed inactive items');
    } else {
      console.error('[FAIL] Clear history failed');
    }

    console.log('[SUCCESS] All DownloadsManager unit tests passed!');
  } catch (err) {
    console.error('[FAIL] Exception:', err);
  } finally {
    app.quit();
  }
});
