'use strict';

const fs = require('fs');
const path = require('path');

class BookmarksManager {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '..', '..', 'data', 'bookmarks.json');
    this.bookmarks = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        this.bookmarks = JSON.parse(raw);
        if (!Array.isArray(this.bookmarks)) {
          this.bookmarks = [];
        }
        // Remove Hacker News if previously saved in profile
        const filtered = this.bookmarks.filter(b => !/ycombinator\.com|hacker\s*news/i.test((b.url || '') + ' ' + (b.title || '')));
        if (filtered.length !== this.bookmarks.length) {
          this.bookmarks = filtered;
          this._save();
        }
      } else {
        this.bookmarks = this._defaultBookmarks();
        this._save();
      }
    } catch (err) {
      console.error('Failed to load bookmarks.json:', err);
      this.bookmarks = this._defaultBookmarks();
    }
  }

  _defaultBookmarks() {
    return [
      { id: 'bm-1', title: 'Google', url: 'https://www.google.com', icon: 'https://www.google.com/favicon.ico', order: 0 },
      { id: 'bm-2', title: 'Wikipedia', url: 'https://www.wikipedia.org', icon: 'https://en.wikipedia.org/favicon.ico', order: 1 },
      { id: 'bm-3', title: 'GitHub', url: 'https://github.com', icon: 'https://github.githubassets.com/favicons/favicon.png', order: 2 },
      { id: 'bm-4', title: 'YouTube', url: 'https://www.youtube.com', icon: 'https://www.youtube.com/favicon.ico', order: 3 },
      { id: 'bm-6', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', icon: 'https://developer.mozilla.org/favicon-48x48.png', order: 4 }
    ];
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.bookmarks, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Failed to save bookmarks.json:', err);
      return false;
    }
  }

  getBookmarks() {
    return [...this.bookmarks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  addBookmark({ title, url, icon }) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid URL is required');
    }
    const safeTitle = (title && typeof title === 'string' && title.trim()) || url;
    let safeUrl = url.trim();
    if (!/^https?:\/\//i.test(safeUrl)) {
      safeUrl = 'https://' + safeUrl;
    }

    let safeIcon = icon;
    if (!safeIcon) {
      try {
        const parsed = new URL(safeUrl);
        safeIcon = `${parsed.origin}/favicon.ico`;
      } catch {
        safeIcon = '';
      }
    }

    const newId = 'bm-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const maxOrder = this.bookmarks.reduce((max, b) => Math.max(max, b.order ?? 0), -1);

    const bookmark = {
      id: newId,
      title: safeTitle,
      url: safeUrl,
      icon: safeIcon,
      order: maxOrder + 1
    };

    this.bookmarks.push(bookmark);
    this._save();
    return bookmark;
  }

  updateBookmark(id, { title, url, icon, order }) {
    const idx = this.bookmarks.findIndex(b => b.id === id);
    if (idx === -1) return null;

    if (title !== undefined) this.bookmarks[idx].title = String(title).trim() || this.bookmarks[idx].title;
    if (url !== undefined) {
      let safeUrl = String(url).trim();
      if (!/^https?:\/\//i.test(safeUrl)) {
        safeUrl = 'https://' + safeUrl;
      }
      this.bookmarks[idx].url = safeUrl;
    }
    if (icon !== undefined) this.bookmarks[idx].icon = String(icon).trim();
    if (order !== undefined) this.bookmarks[idx].order = Number(order);

    this._save();
    return this.bookmarks[idx];
  }

  deleteBookmark(id) {
    const prevLength = this.bookmarks.length;
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
    if (this.bookmarks.length !== prevLength) {
      // Re-index orders
      this.bookmarks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      this.bookmarks.forEach((b, i) => { b.order = i; });
      this._save();
      return true;
    }
    return false;
  }

  reorderBookmarks(orderedIds) {
    if (!Array.isArray(orderedIds)) return false;
    const map = new Map(this.bookmarks.map(b => [b.id, b]));
    const reordered = [];
    orderedIds.forEach((id, idx) => {
      const b = map.get(id);
      if (b) {
        b.order = idx;
        reordered.push(b);
        map.delete(id);
      }
    });
    // Add any remaining
    let currentIdx = reordered.length;
    for (const b of map.values()) {
      b.order = currentIdx++;
      reordered.push(b);
    }
    this.bookmarks = reordered;
    this._save();
    return this.getBookmarks();
  }
}

module.exports = { BookmarksManager };
