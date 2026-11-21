'use strict';

class HomeHub {
  constructor(app) {
    this.app = app;
    this.hubEl = document.getElementById('home-hub');
    this.gridEl = document.getElementById('bookmarks-grid');
    this.searchInput = document.getElementById('hub-search-input');
    this.btnClose = document.getElementById('hub-close-btn');
    this.btnAdd = document.getElementById('hub-add-btn');

    // Modal elements
    this.modalEl = document.getElementById('bookmark-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.inputTitle = document.getElementById('bm-title-input');
    this.inputUrl = document.getElementById('bm-url-input');
    this.inputIcon = document.getElementById('bm-icon-input');
    this.inputEditId = document.getElementById('bm-edit-id');
    this.btnModalCancel = document.getElementById('modal-cancel-btn');
    this.btnModalSave = document.getElementById('modal-save-btn');

    this.isOpen = false;
    this.bookmarks = [];

    this._bindEvents();
    this.loadBookmarks();
  }

  _bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.btnAdd) {
      this.btnAdd.addEventListener('click', () => this.openAddModal());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.filterBookmarks(this.searchInput.value));
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const query = this.searchInput.value.trim();
          if (query) {
            this.app.createWindow(query);
            this.close();
          }
        }
      });
    }

    // Modal actions
    if (this.btnModalCancel) {
      this.btnModalCancel.addEventListener('click', () => this.closeModal());
    }

    if (this.btnModalSave) {
      this.btnModalSave.addEventListener('click', () => this.saveModal());
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.closeModal();
        }
      });
    }

    // Esc closes Hub
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.modalEl && this.modalEl.style.display !== 'none') {
          this.closeModal();
        } else if (this.isOpen) {
          this.close();
        }
      }
    });
  }

  async loadBookmarks() {
    try {
      this.bookmarks = await this.app.api.getBookmarks();
      if (this.isOpen) {
        this.renderBookmarks(this.bookmarks);
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  }

  open() {
    this.isOpen = true;
    this.hubEl.classList.remove('hidden');
    // Force layout then animate
    requestAnimationFrame(() => {
      this.hubEl.classList.add('open');
    });

    // Hide native WebContentsViews so they do not overlay the hub
    this.app.setViewsVisible(false);

    if (this.app.workspace) {
      this.app.workspace.updatePlaceholder();
    }

    this.loadBookmarks();

    if (this.searchInput) {
      this.searchInput.value = '';
      setTimeout(() => this.searchInput.focus(), 100);
    }
  }

  close() {
    this.isOpen = false;
    this.hubEl.classList.remove('open');
    setTimeout(() => {
      if (!this.isOpen) {
        this.hubEl.classList.add('hidden');
      }
    }, 250);

    // Restore native WebContentsViews visibility
    this.app.setViewsVisible(true);

    if (this.app.workspace) {
      this.app.workspace.updatePlaceholder();
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  filterBookmarks(query) {
    const term = query.toLowerCase().trim();
    if (!term) {
      this.renderBookmarks(this.bookmarks);
      return;
    }
    const filtered = this.bookmarks.filter(b => 
      b.title.toLowerCase().includes(term) || b.url.toLowerCase().includes(term)
    );
    this.renderBookmarks(filtered);
  }

  renderBookmarks(list) {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';

    list.forEach((bm, idx) => {
      const card = document.createElement('div');
      card.className = 'bookmark-card';
      card.dataset.id = bm.id;

      const safeTitle = this._escapeHtml(bm.title);
      const safeUrl = this._escapeHtml(bm.url);
      const firstLetter = (bm.title || 'W').charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="bookmark-actions">
          <button class="bookmark-action-btn" data-action="up" title="Вгору">▲</button>
          <button class="bookmark-action-btn" data-action="down" title="Вниз">▼</button>
          <button class="bookmark-action-btn" data-action="edit" title="Редагувати">✎</button>
          <button class="bookmark-action-btn btn-delete" data-action="delete" title="Видалити">✕</button>
        </div>
        <div class="bookmark-icon-wrapper">
          ${bm.icon ? `<img src="${this._escapeHtml(bm.icon)}" class="bookmark-icon" alt="" onerror="this.outerHTML='<span class=\\'bookmark-letter-icon\\'>${firstLetter}</span>'"/>` : `<span class="bookmark-letter-icon">${firstLetter}</span>`}
        </div>
        <div class="bookmark-name" title="${safeTitle}">${safeTitle}</div>
        <div class="bookmark-url" title="${safeUrl}">${safeUrl}</div>
      `;

      // Open in Spatial Workspace
      card.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-actions')) return;
        this.app.createWindow(bm.url);
        this.close();
      });

      // Actions
      const btnDelete = card.querySelector('[data-action="delete"]');
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.app.api.deleteBookmark(bm.id);
        await this.loadBookmarks();
      });

      const btnEdit = card.querySelector('[data-action="edit"]');
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditModal(bm);
      });

      const btnUp = card.querySelector('[data-action="up"]');
      btnUp.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (idx > 0) {
          const ids = this.bookmarks.map(b => b.id);
          const temp = ids[idx];
          ids[idx] = ids[idx - 1];
          ids[idx - 1] = temp;
          await this.app.api.reorderBookmarks(ids);
          await this.loadBookmarks();
        }
      });

      const btnDown = card.querySelector('[data-action="down"]');
      btnDown.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (idx < this.bookmarks.length - 1) {
          const ids = this.bookmarks.map(b => b.id);
          const temp = ids[idx];
          ids[idx] = ids[idx + 1];
          ids[idx + 1] = temp;
          await this.app.api.reorderBookmarks(ids);
          await this.loadBookmarks();
        }
      });

      this.gridEl.appendChild(card);
    });

    // Add Card button
    const addCard = document.createElement('div');
    addCard.className = 'bookmark-card bookmark-card-add';
    addCard.innerHTML = `
      <div class="add-icon">+</div>
      <div class="bookmark-name">Додати сайт</div>
      <div class="bookmark-url">Створити нову закладку</div>
    `;
    addCard.addEventListener('click', () => this.openAddModal());
    this.gridEl.appendChild(addCard);
  }

  openAddModal() {
    this.modalTitle.textContent = 'Додати нову закладку';
    this.inputTitle.value = '';
    this.inputUrl.value = '';
    this.inputIcon.value = '';
    this.inputEditId.value = '';
    this.modalEl.style.display = 'flex';
    this.inputUrl.focus();
  }

  openEditModal(bm) {
    this.modalTitle.textContent = 'Редагувати закладку';
    this.inputTitle.value = bm.title || '';
    this.inputUrl.value = bm.url || '';
    this.inputIcon.value = bm.icon || '';
    this.inputEditId.value = bm.id;
    this.modalEl.style.display = 'flex';
    this.inputTitle.focus();
  }

  closeModal() {
    this.modalEl.style.display = 'none';
  }

  async saveModal() {
    const title = this.inputTitle.value.trim();
    const url = this.inputUrl.value.trim();
    const icon = this.inputIcon.value.trim();
    const editId = this.inputEditId.value;

    if (!url) {
      this.inputUrl.focus();
      return;
    }

    try {
      if (editId) {
        await this.app.api.updateBookmark(editId, { title, url, icon });
      } else {
        await this.app.api.addBookmark({ title, url, icon });
      }
      this.closeModal();
      await this.loadBookmarks();
    } catch (err) {
      console.error('Failed to save bookmark:', err);
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

window.HomeHub = HomeHub;
