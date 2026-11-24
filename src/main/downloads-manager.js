'use strict';

const fs = require('fs');
const path = require('path');
const { shell, app } = require('electron');

class DownloadsManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath || app.getPath('userData');
    this.storagePath = path.join(this.userDataPath, 'downloads.json');
    this.downloads = [];
    this.activeItems = new Map(); // id -> DownloadItem
    this.mainWindow = null;

    this._load();
  }

  attachWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  attachSession(ses) {
    if (!ses) return;

    ses.on('will-download', (event, item, webContents) => {
      const id = 'dl-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      const filename = item.getFilename();
      const totalBytes = item.getTotalBytes() || 0;
      const mimeType = item.getMimeType() || '';
      const url = item.getURL() || '';
      const startTime = Date.now();

      // Store in active items
      this.activeItems.set(id, item);

      const record = {
        id,
        filename,
        savePath: item.getSavePath() || path.join(app.getPath('downloads'), filename),
        totalBytes,
        receivedBytes: 0,
        state: 'progressing',
        url,
        startTime,
        completedTime: null,
        mimeType,
        speed: 0,
        paused: false,
      };

      // Put at the top of downloads list
      this.downloads.unshift(record);
      if (this.downloads.length > 100) {
        this.downloads = this.downloads.slice(0, 100);
      }
      this._save();

      this._notify('download-started', record);

      let lastBytes = 0;
      let lastTime = Date.now();

      item.on('updated', (_e, state) => {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        const currentBytes = item.getReceivedBytes();

        let speed = record.speed;
        if (timeDiff >= 0.5) {
          speed = Math.round((currentBytes - lastBytes) / timeDiff);
          lastBytes = currentBytes;
          lastTime = now;
        }

        record.receivedBytes = currentBytes;
        record.totalBytes = item.getTotalBytes() || record.totalBytes;
        record.savePath = item.getSavePath() || record.savePath;
        record.paused = item.isPaused();
        record.state = state; // 'progressing' or 'interrupted'
        record.speed = speed;

        this._notify('download-updated', record);
      });

      item.once('done', (_e, state) => {
        this.activeItems.delete(id);
        record.receivedBytes = item.getReceivedBytes();
        record.totalBytes = item.getTotalBytes() || record.receivedBytes;
        record.savePath = item.getSavePath() || record.savePath;
        record.completedTime = Date.now();
        record.speed = 0;
        record.paused = false;

        if (state === 'completed') {
          record.state = 'completed';
        } else if (state === 'cancelled') {
          record.state = 'cancelled';
        } else {
          record.state = 'interrupted';
        }

        this._save();
        this._notify('download-done', record);
      });
    });
  }

  _notify(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // If any items were left as 'progressing' when app closed, mark them as 'interrupted'
          this.downloads = parsed.map((item) => {
            if (item.state === 'progressing') {
              return { ...item, state: 'interrupted', speed: 0, paused: false };
            }
            return item;
          });
        }
      }
    } catch (err) {
      console.error('Failed to load downloads.json:', err);
      this.downloads = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.downloads, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save downloads.json:', err);
    }
  }

  list() {
    return this.downloads.map((dl) => {
      const item = this.activeItems.get(dl.id);
      return {
        ...dl,
        canResume: item ? item.canResume() : false,
        isPaused: item ? item.isPaused() : false,
        isActive: !!item,
      };
    });
  }

  pause(id) {
    const item = this.activeItems.get(id);
    if (item && !item.isPaused()) {
      item.pause();
      const rec = this.downloads.find((d) => d.id === id);
      if (rec) {
        rec.paused = true;
        this._notify('download-updated', rec);
      }
      return true;
    }
    return false;
  }

  resume(id) {
    const item = this.activeItems.get(id);
    if (item && item.canResume()) {
      item.resume();
      const rec = this.downloads.find((d) => d.id === id);
      if (rec) {
        rec.paused = false;
        this._notify('download-updated', rec);
      }
      return true;
    }
    return false;
  }

  cancel(id) {
    const item = this.activeItems.get(id);
    if (item) {
      item.cancel();
      this.activeItems.delete(id);
      const rec = this.downloads.find((d) => d.id === id);
      if (rec) {
        rec.state = 'cancelled';
        rec.speed = 0;
        this._save();
        this._notify('download-done', rec);
      }
      return true;
    }
    return false;
  }

  async openFile(id) {
    const rec = this.downloads.find((d) => d.id === id);
    if (rec && rec.savePath && fs.existsSync(rec.savePath)) {
      return shell.openPath(rec.savePath);
    }
    return 'File not found';
  }

  showInFolder(id) {
    const rec = this.downloads.find((d) => d.id === id);
    if (rec && rec.savePath) {
      if (fs.existsSync(rec.savePath)) {
        shell.showItemInFolder(rec.savePath);
        return true;
      }
    }
    return false;
  }

  openDownloadsFolder() {
    shell.openPath(app.getPath('downloads'));
    return true;
  }

  clearHistory() {
    this.downloads = this.downloads.filter((d) => this.activeItems.has(d.id));
    this._save();
    return this.list();
  }
}

module.exports = { DownloadsManager };
