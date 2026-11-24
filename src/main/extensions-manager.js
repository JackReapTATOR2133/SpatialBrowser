'use strict';

/**
 * ExtensionsManager — WebExtensions (Firefox .xpi / Chrome .crx / .zip / unpacked folder)
 *
 * - Installs add-ons into <userData>/extensions/<key>/ (never modifies the user's source files)
 * - Unpacks ZIP/XPI/CRX archives without external dependencies (zlib only)
 * - Applies a lightweight Firefox compatibility layer (`browser` -> `chrome` alias,
 *   Firefox-MV3 `background.scripts` -> Chromium `service_worker`)
 * - Loads enabled add-ons into the default session used by every spatial WebContentsView
 * - Renders toolbar-action popups in a dedicated topmost WebContentsView
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebContentsView } = require('electron');

// Note: Chromium reserves file names starting with "_" inside extensions
const COMPAT_FILE = 'spatial-compat.js';
const BG_WRAPPER_FILE = 'spatial-background.js';
const ARCHIVE_EXTS = new Set(['.xpi', '.crx', '.zip']);

const COMPAT_SOURCE = `/* Spatial Browser: Firefox WebExtensions compatibility layer */
(function () {
  try {
    if (typeof globalThis.browser === 'undefined' && typeof globalThis.chrome !== 'undefined') {
      globalThis.browser = globalThis.chrome;
    }
    const c = globalThis.chrome || globalThis.browser;
    if (c) {
      const noop = () => {};
      const eventStub = { addListener: noop, removeListener: noop, hasListener: () => false };
      if (!c.contextMenus) {
        c.contextMenus = {
          create: noop,
          update: noop,
          remove: noop,
          removeAll: noop,
          onClicked: eventStub,
        };
      }
      if (!c.notifications) {
        c.notifications = {
          create: (_id, _opts, cb) => { if (cb) cb('notif-stub'); },
          clear: (_id, cb) => { if (cb) cb(true); },
          onClicked: eventStub,
          onClosed: eventStub,
        };
      }
      if (!c.webNavigation) {
        c.webNavigation = {
          onBeforeNavigate: eventStub,
          onCommitted: eventStub,
          onDOMContentLoaded: eventStub,
          onCompleted: eventStub,
          onErrorOccurred: eventStub,
        };
      }
    }
  } catch (e) { /* ignore */ }
})();
`;

/* ----------------------------- ZIP / CRX unpacking ----------------------------- */

function zipStartOffset(buf) {
  // CRX files are a ZIP archive prefixed with a signed header ("Cr24")
  if (buf.length > 16 && buf.toString('latin1', 0, 4) === 'Cr24') {
    const version = buf.readUInt32LE(4);
    if (version === 3) return 12 + buf.readUInt32LE(8);
    if (version === 2) return 16 + buf.readUInt32LE(8) + buf.readUInt32LE(12);
    throw new Error(`Непідтримувана версія CRX: ${version}`);
  }
  return 0;
}

function unzipBuffer(input, destDir) {
  const zip = input.subarray(zipStartOffset(input));

  // Locate End Of Central Directory record
  let eocd = -1;
  const minPos = Math.max(0, zip.length - 65557);
  for (let i = zip.length - 22; i >= minPos; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Файл не є коректним ZIP/XPI/CRX архівом');

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const root = path.resolve(destDir);
  fs.mkdirSync(root, { recursive: true });

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Пошкоджений центральний каталог архіву');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;

    // Zip-slip protection
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Небезпечний шлях в архіві: ${name}`);
    }

    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }

    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const data = zip.subarray(dataStart, dataStart + compSize);

    let content;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data);
    else throw new Error(`Непідтримуваний метод стиснення (${method}) для ${name}`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

/* --------------------------------- helpers --------------------------------- */

function findManifestRoot(dir) {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  // Archive may wrap everything into a single top-level folder
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory());
  for (const e of entries) {
    const sub = path.join(dir, e.name);
    if (fs.existsSync(path.join(sub, 'manifest.json'))) return sub;
  }
  return null;
}

function readJson(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}

function sanitizeKey(name) {
  const base = String(name || 'extension')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'extension';
  return `${base}-${Date.now().toString(36)}`;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  }[ext] || 'application/octet-stream';
}

function pickIcon(iconSpec) {
  if (!iconSpec) return null;
  if (typeof iconSpec === 'string') return iconSpec;
  const sizes = Object.keys(iconSpec).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (!sizes.length) return null;
  const preferred = sizes.find(s => s >= 32) || sizes[sizes.length - 1];
  return iconSpec[String(preferred)];
}

function injectScriptTag(htmlFile, src) {
  if (!fs.existsSync(htmlFile)) return;
  let html = fs.readFileSync(htmlFile, 'utf8');
  if (html.includes(COMPAT_FILE)) return;
  const tag = `<script src="${src}"></script>`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => `${m}\n${tag}`);
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, m => `${m}\n${tag}`);
  else html = `${tag}\n${html}`;
  fs.writeFileSync(htmlFile, html);
}

/* ------------------------------ ExtensionsManager ------------------------------ */

class ExtensionsManager {
  constructor(ses, baseDir) {
    this.ses = ses;
    this.baseDir = baseDir;
    this.registryPath = path.join(baseDir, 'extensions.json');
    this.entries = [];       // persisted records
    this.runtime = new Map(); // key -> { id, error }
    this.mainWindow = null;
    this.popup = null;       // { key, view }
    this._lastPopupClose = { key: null, at: 0 };

    fs.mkdirSync(baseDir, { recursive: true });
    this._loadRegistry();
  }

  /* ---------- Electron API compatibility (session.extensions since v36) ---------- */
  get _api() {
    return this.ses.extensions && typeof this.ses.extensions.loadExtension === 'function'
      ? this.ses.extensions
      : this.ses;
  }

  attachWindow(mainWindow) {
    this.mainWindow = mainWindow;
    mainWindow.on('closed', () => {
      this.popup = null;
      this.mainWindow = null;
    });
  }

  /* --------------------------------- registry --------------------------------- */
  _loadRegistry() {
    try {
      if (fs.existsSync(this.registryPath)) {
        const data = readJson(this.registryPath);
        this.entries = Array.isArray(data) ? data.filter(e => e && e.key && e.dir) : [];
      }
    } catch (err) {
      console.error('[Extensions] Failed to read registry:', err.message);
      this.entries = [];
    }
  }

  _saveRegistry() {
    fs.writeFileSync(this.registryPath, JSON.stringify(this.entries, null, 2), 'utf8');
  }

  _notifyChanged() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('extensions-changed');
    }
  }

  /* ---------------------------------- lifecycle ---------------------------------- */
  async init() {
    for (const entry of this.entries) {
      if (entry.enabled) await this._load(entry);
    }
  }

  async _load(entry) {
    try {
      if (!fs.existsSync(path.join(entry.dir, 'manifest.json'))) {
        throw new Error('Файли розширення не знайдено на диску');
      }
      this._applyCompat(entry.dir);
      const ext = await this._api.loadExtension(entry.dir, { allowFileAccess: true });
      this.runtime.set(entry.key, { id: ext.id, error: null });
      return ext;
    } catch (err) {
      console.error(`[Extensions] Failed to load "${entry.name}":`, err.message);
      this.runtime.set(entry.key, { id: null, error: err.message });
      return null;
    }
  }

  _unload(entry) {
    const rt = this.runtime.get(entry.key);
    if (rt && rt.id) {
      try { this._api.removeExtension(rt.id); } catch (_) {}
    }
    this.runtime.delete(entry.key);
    if (this.popup && this.popup.key === entry.key) this.closePopup();
  }

  /* -------------------------------- installation -------------------------------- */
  async install(sourcePath) {
    if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('Не вказано шлях');
    const resolved = path.resolve(sourcePath);
    if (!fs.existsSync(resolved)) throw new Error('Файл або папку не знайдено');

    const stat = fs.statSync(resolved);
    let source;
    const tmpDir = path.join(this.baseDir, `.tmp-${Date.now().toString(36)}`);

    try {
      if (stat.isDirectory()) {
        source = 'folder';
        fs.cpSync(resolved, tmpDir, { recursive: true });
      } else {
        let ext = path.extname(resolved).toLowerCase();
        if (path.basename(resolved).toLowerCase() === 'manifest.json') {
          source = 'folder';
          fs.cpSync(path.dirname(resolved), tmpDir, { recursive: true });
        } else if (ARCHIVE_EXTS.has(ext)) {
          source = ext.slice(1);
          unzipBuffer(fs.readFileSync(resolved), tmpDir);
        } else {
          throw new Error('Підтримуються файли .xpi, .crx, .zip або папка з manifest.json');
        }
      }

      const root = findManifestRoot(tmpDir);
      if (!root) throw new Error('У розширенні відсутній manifest.json');

      const manifest = readJson(path.join(root, 'manifest.json'));
      if (![2, 3].includes(manifest.manifest_version)) {
        throw new Error(`Непідтримувана manifest_version: ${manifest.manifest_version}`);
      }

      const meta = this._readMeta(root, manifest);
      const key = sanitizeKey(meta.name);
      const finalDir = path.join(this.baseDir, key);
      fs.renameSync(root, finalDir);
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });

      this._applyCompat(finalDir);

      const entry = {
        key,
        dir: finalDir,
        name: meta.name,
        version: manifest.version || '',
        source,
        enabled: true,
        installedAt: new Date().toISOString(),
      };
      this.entries.push(entry);
      this._saveRegistry();

      await this._load(entry);
      this._notifyChanged();
      return this._describe(entry);
    } catch (err) {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
  }

  /** Firefox compatibility: alias `browser` -> `chrome` everywhere scripts run, sanitize unsupported permissions & schemas. */
  _applyCompat(dir) {
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = readJson(manifestPath);
    fs.writeFileSync(path.join(dir, COMPAT_FILE), COMPAT_SOURCE, 'utf8');

    // Clean unsupported permissions that trigger Electron ExtensionLoadWarnings
    const UNSUPPORTED_PERMISSIONS = new Set([
      'contextMenus',
      'notifications',
      'webNavigation',
      'management',
      'privacy',
      'proxy',
      'geolocation',
    ]);

    if (Array.isArray(manifest.permissions)) {
      manifest.permissions = manifest.permissions.filter(p => !UNSUPPORTED_PERMISSIONS.has(p));
    }
    if (Array.isArray(manifest.optional_permissions)) {
      manifest.optional_permissions = manifest.optional_permissions.filter(p => !UNSUPPORTED_PERMISSIONS.has(p));
    }

    // Strip Gecko-specific manifest sections
    delete manifest.applications;
    delete manifest.browser_specific_settings;

    // Content scripts
    if (Array.isArray(manifest.content_scripts)) {
      for (const cs of manifest.content_scripts) {
        // 'world' property is only valid in Chromium MV3
        if (manifest.manifest_version < 3 && cs.world) {
          delete cs.world;
        }
        if (Array.isArray(cs.js) && cs.js.length && !cs.js.includes(COMPAT_FILE)) {
          cs.js.unshift(COMPAT_FILE);
        }
      }
    }

    // Background
    const bg = manifest.background;
    if (bg) {
      if (manifest.manifest_version === 3 && Array.isArray(bg.scripts) && !bg.service_worker) {
        // Firefox MV3 uses background.scripts; Chromium MV3 requires a service worker
        const imports = [COMPAT_FILE, ...bg.scripts].map(s => JSON.stringify('/' + s.replace(/^\/+/, '')));
        fs.writeFileSync(path.join(dir, BG_WRAPPER_FILE), `importScripts(${imports.join(', ')});\n`, 'utf8');
        manifest.background = { service_worker: BG_WRAPPER_FILE };
      } else if (Array.isArray(bg.scripts) && !bg.scripts.includes(COMPAT_FILE)) {
        bg.scripts.unshift(COMPAT_FILE);
      } else if (typeof bg.page === 'string') {
        injectScriptTag(path.join(dir, bg.page), `/${COMPAT_FILE}`);
      }
    }

    // Popup and options pages
    const action = manifest.action || manifest.browser_action || manifest.page_action;
    if (action && typeof action.default_popup === 'string') {
      injectScriptTag(path.join(dir, action.default_popup.split('?')[0]), `/${COMPAT_FILE}`);
    }
    const optionsPage = (manifest.options_ui && manifest.options_ui.page) || manifest.options_page;
    if (typeof optionsPage === 'string') {
      injectScriptTag(path.join(dir, optionsPage.split('?')[0]), `/${COMPAT_FILE}`);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  /* ------------------------------ management actions ------------------------------ */
  async setEnabled(key, enabled) {
    const entry = this.entries.find(e => e.key === key);
    if (!entry) throw new Error('Розширення не знайдено');
    entry.enabled = !!enabled;
    this._saveRegistry();
    if (entry.enabled) await this._load(entry);
    else this._unload(entry);
    this._notifyChanged();
    return this._describe(entry);
  }

  async remove(key) {
    const idx = this.entries.findIndex(e => e.key === key);
    if (idx < 0) return false;
    const entry = this.entries[idx];
    this._unload(entry);
    this.entries.splice(idx, 1);
    this._saveRegistry();

    // Only delete inside our own extensions directory
    const dir = path.resolve(entry.dir);
    if (dir.startsWith(path.resolve(this.baseDir) + path.sep)) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    this._notifyChanged();
    return true;
  }

  /* ---------------------------------- metadata ---------------------------------- */
  _resolveMessage(dir, manifest, value) {
    if (typeof value !== 'string') return '';
    const m = value.match(/^__MSG_(.+)__$/);
    if (!m) return value;
    const locales = [manifest.default_locale, 'uk', 'en', 'en_US'].filter(Boolean);
    for (const loc of locales) {
      const file = path.join(dir, '_locales', loc, 'messages.json');
      try {
        if (fs.existsSync(file)) {
          const messages = readJson(file);
          const hit = Object.keys(messages).find(k => k.toLowerCase() === m[1].toLowerCase());
          if (hit && messages[hit].message) return messages[hit].message;
        }
      } catch (_) {}
    }
    return m[1];
  }

  _readMeta(dir, manifest) {
    const action = manifest.action || manifest.browser_action || manifest.page_action || null;
    const iconRel = pickIcon(action && action.default_icon) || pickIcon(manifest.icons);
    let icon = '';
    if (iconRel) {
      const iconPath = path.join(dir, String(iconRel).replace(/^\/+/, ''));
      try {
        if (fs.existsSync(iconPath)) {
          icon = `data:${mimeFor(iconPath)};base64,${fs.readFileSync(iconPath).toString('base64')}`;
        }
      } catch (_) {}
    }
    const popup = action && typeof action.default_popup === 'string' ? action.default_popup.replace(/^\/+/, '') : '';
    const options = (manifest.options_ui && manifest.options_ui.page) || manifest.options_page || '';

    return {
      name: this._resolveMessage(dir, manifest, manifest.name) || 'Розширення',
      description: this._resolveMessage(dir, manifest, manifest.description),
      icon,
      popup,
      options: typeof options === 'string' ? options.replace(/^\/+/, '') : '',
      title: this._resolveMessage(dir, manifest, action && action.default_title),
      manifestVersion: manifest.manifest_version,
    };
  }

  _describe(entry) {
    let meta = { name: entry.name, description: '', icon: '', popup: '', options: '', title: '', manifestVersion: null };
    try {
      meta = this._readMeta(entry.dir, readJson(path.join(entry.dir, 'manifest.json')));
    } catch (_) {}
    const rt = this.runtime.get(entry.key) || {};
    return {
      key: entry.key,
      name: meta.name || entry.name,
      version: entry.version,
      description: meta.description,
      icon: meta.icon,
      title: meta.title || meta.name,
      hasPopup: !!meta.popup,
      hasOptions: !!meta.options,
      manifestVersion: meta.manifestVersion,
      source: entry.source,
      enabled: !!entry.enabled,
      loaded: !!rt.id,
      runtimeId: rt.id || null,
      error: rt.error || null,
    };
  }

  list() {
    return this.entries.map(e => this._describe(e));
  }

  _extensionUrl(key, page) {
    const entry = this.entries.find(e => e.key === key);
    const rt = this.runtime.get(key);
    if (!entry || !rt || !rt.id || !page) return null;
    return `chrome-extension://${rt.id}/${page}`;
  }

  getOptionsUrl(key) {
    const entry = this.entries.find(e => e.key === key);
    if (!entry) return null;
    const meta = this._readMeta(entry.dir, readJson(path.join(entry.dir, 'manifest.json')));
    return this._extensionUrl(key, meta.options);
  }

  /* ------------------------------------ popup ------------------------------------ */
  openPopup(key, anchor) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    // Clicking the same icon again toggles the popup (blur already closed it)
    if (this._lastPopupClose.key === key && Date.now() - this._lastPopupClose.at < 350) return false;
    if (this.popup && this.popup.key === key) { this.closePopup(); return false; }
    this.closePopup();

    const entry = this.entries.find(e => e.key === key);
    if (!entry) return false;
    const meta = this._readMeta(entry.dir, readJson(path.join(entry.dir, 'manifest.json')));
    const url = this._extensionUrl(key, meta.popup);
    if (!url) return false;

    const view = new WebContentsView({
      webPreferences: { session: this.ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    view.setBackgroundColor('#ffffff');
    this.popup = { key, view };

    const place = (w, h) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      const [cw, ch] = this.mainWindow.getContentSize();
      const a = anchor || { x: cw - 40, y: 10, width: 30, height: 30 };
      const width = Math.max(180, Math.min(800, Math.round(w)));
      const height = Math.max(80, Math.min(ch - 70, 600, Math.round(h)));
      const x = Math.max(8, Math.min(cw - width - 8, Math.round(a.x + a.width - width)));
      const y = Math.round(a.y + a.height + 6);
      view.setBounds({ x, y, width, height });
    };
    // Start large so the page can lay out at its natural width, then shrink to content
    place(800, 600);
    this.mainWindow.contentView.addChildView(view);

    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url: target }) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('window-open-new-tab', { url: target });
      }
      this.closePopup();
      return { action: 'deny' };
    });
    wc.on('did-finish-load', async () => {
      try {
        // Shrink-to-fit measurement (scrollWidth/Height never go below the viewport size)
        const size = await wc.executeJavaScript(
          `(() => { const d = document.documentElement; const prev = d.style.display;
             d.style.display = 'inline-block'; const r = d.getBoundingClientRect();
             const w = Math.ceil(Math.max(r.width, document.body ? document.body.scrollWidth : 0));
             const h = Math.ceil(r.height); d.style.display = prev; return [w, h]; })()`
        );
        if (this.popup && this.popup.view === view) place(size[0], size[1]);
      } catch (_) {}
      if (!wc.isDestroyed()) wc.focus();
    });
    wc.on('blur', () => {
      if (this.popup && this.popup.view === view) {
        this._lastPopupClose = { key, at: Date.now() };
        this.closePopup();
      }
    });
    wc.on('destroyed', () => {
      if (this.popup && this.popup.view === view) this.popup = null;
      try { this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.contentView.removeChildView(view); } catch (_) {}
    });

    wc.loadURL(url).catch(err => console.error('[Extensions] Popup load failed:', err.message));
    return true;
  }

  closePopup() {
    if (!this.popup) return;
    const { view } = this.popup;
    this.popup = null;
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.contentView.removeChildView(view);
    } catch (_) {}
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch (_) {}
  }
}

module.exports = { ExtensionsManager, unzipBuffer };
