'use strict';

class WindowControls {
  constructor(workspace) {
    this.workspace = workspace;
    this.app = workspace.app;
    this.dragging = null;
    this.resizing = null;
    this._rafId = null;

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('mousemove', (e) => this._onMouseMove(e), { passive: false });
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
  }

  attachFrameEvents(id, frame) {
    const titlebar = frame.querySelector('.phantom-titlebar');
    if (titlebar) {
      titlebar.addEventListener('mousedown', (e) => this._startDrag(e, id, frame));
    }

    frame.addEventListener('mousedown', () => {
      this.app.setActiveWindow(id);
    });

    // Resize handles
    const handles = frame.querySelectorAll('.phantom-resize-handle');
    handles.forEach((handle) => {
      const dir = Array.from(handle.classList).find(c => c !== 'phantom-resize-handle');
      if (dir) {
        handle.addEventListener('mousedown', (e) => this._startResize(e, id, frame, dir));
      }
    });
  }

  _startDrag(e, id, frame) {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.app && this.app.api && this.app.api.setDragging) {
      this.app.api.setDragging(true);
    }

    this.app.setActiveWindow(id);

    const rect = frame.getBoundingClientRect();
    const wsRect = this.workspace.getWorkspaceRect();

    this.dragging = {
      id,
      frame,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left - wsRect.left,
      startTop: rect.top - wsRect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  _startResize(e, id, frame, dir) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.app && this.app.api && this.app.api.setDragging) {
      this.app.api.setDragging(true);
    }

    this.app.setActiveWindow(id);

    const rect = frame.getBoundingClientRect();
    const wsRect = this.workspace.getWorkspaceRect();

    this.resizing = {
      id,
      frame,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left - wsRect.left,
      startTop: rect.top - wsRect.top,
      startWidth: rect.width,
      startHeight: rect.height,
    };
  }

  _onMouseMove(e) {
    if (!this.dragging && !this.resizing) return;
    e.preventDefault();

    if (this.dragging) {
      const dx = e.clientX - this.dragging.startX;
      const dy = e.clientY - this.dragging.startY;

      let newLeft = this.dragging.startLeft + dx;
      let newTop = this.dragging.startTop + dy;

      const wsRect = this.workspace.getWorkspaceRect();
      const maxX = Math.max(0, wsRect.width - this.dragging.width);
      const maxY = Math.max(0, wsRect.height - this.dragging.height);

      newLeft = Math.max(0, Math.min(maxX, newLeft));
      newTop = Math.max(0, Math.min(maxY, newTop));

      this.dragging.frame.style.left = `${newLeft}px`;
      this.dragging.frame.style.top = `${newTop}px`;

      this._scheduleSync(this.dragging.id, this.dragging.frame);
      return;
    }

    if (this.resizing) {
      const dx = e.clientX - this.resizing.startX;
      const dy = e.clientY - this.resizing.startY;
      const { startLeft, startTop, startWidth, startHeight, dir } = this.resizing;

      let newLeft = startLeft;
      let newTop = startTop;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (dir.includes('e')) newWidth = startWidth + dx;
      if (dir.includes('s')) newHeight = startHeight + dy;
      if (dir.includes('w')) {
        newWidth = startWidth - dx;
        newLeft = startLeft + dx;
      }
      if (dir.includes('n')) {
        newHeight = startHeight - dy;
        newTop = startTop + dy;
      }

      const minW = 260;
      const minH = 160;

      if (newWidth < minW) {
        if (dir.includes('w')) newLeft = startLeft + startWidth - minW;
        newWidth = minW;
      }
      if (newHeight < minH) {
        if (dir.includes('n')) newTop = startTop + startHeight - minH;
        newHeight = minH;
      }

      const wsRect = this.workspace.getWorkspaceRect();
      if (newLeft < 0) {
        newWidth += newLeft;
        newLeft = 0;
      }
      if (newTop < 0) {
        newHeight += newTop;
        newTop = 0;
      }
      if (newLeft + newWidth > wsRect.width) {
        newWidth = wsRect.width - newLeft;
      }
      if (newTop + newHeight > wsRect.height) {
        newHeight = wsRect.height - newTop;
      }

      this.resizing.frame.style.left = `${newLeft}px`;
      this.resizing.frame.style.top = `${newTop}px`;
      this.resizing.frame.style.width = `${newWidth}px`;
      this.resizing.frame.style.height = `${newHeight}px`;

      this._scheduleSync(this.resizing.id, this.resizing.frame);
    }
  }

  _scheduleSync(id, frame) {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      if (frame && frame.isConnected) {
        this.workspace.syncFrameBounds(id, frame);
      }
    });
  }

  _onMouseUp() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    const wasActiveInteraction = !!(this.dragging || this.resizing);

    if (this.dragging) {
      const { id, frame } = this.dragging;
      this.dragging = null;
      this.workspace.syncFrameBounds(id, frame);
    }

    if (this.resizing) {
      const { id, frame } = this.resizing;
      this.resizing = null;
      this.workspace.syncFrameBounds(id, frame);
    }

    if (wasActiveInteraction && this.app && this.app.api && this.app.api.setDragging) {
      this.app.api.setDragging(false);
    }
  }
}

window.WindowControls = WindowControls;
