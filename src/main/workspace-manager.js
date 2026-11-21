'use strict';

class WorkspaceManager {
  constructor(browserViewManager, mainWindow) {
    this.browserViewManager = browserViewManager;
    this.mainWindow = mainWindow;
    this.cascadeCounter = 0;
  }

  getNextWindowPosition() {
    const contentSize = this.mainWindow.getContentSize();
    const toolbarHeight = 56;
    const baseWidth = Math.min(840, Math.max(480, Math.round(contentSize[0] * 0.6)));
    const baseHeight = Math.min(580, Math.max(340, Math.round((contentSize[1] - toolbarHeight) * 0.7)));

    const offsetStep = 36;
    const maxCascade = 8;
    const index = this.cascadeCounter % maxCascade;
    this.cascadeCounter++;

    let x = 40 + (index * offsetStep);
    let y = toolbarHeight + 20 + (index * offsetStep);

    if (x + baseWidth > contentSize[0]) x = 40;
    if (y + baseHeight > contentSize[1]) y = toolbarHeight + 20;

    return {
      x,
      y,
      width: baseWidth,
      height: baseHeight
    };
  }

  resetCascade() {
    this.cascadeCounter = 0;
  }
}

module.exports = { WorkspaceManager };
