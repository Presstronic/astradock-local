const { createBrowserWindowOptions } = require('./electronSecurity');
const { normalizeOverlayFilters } = require('./overlayFilters');

const DEFAULT_OVERLAY_PREFERENCES = Object.freeze({ alwaysOnTop: true, opacity: 0.82, displayMode: 'friendly', filters: normalizeOverlayFilters() });

function normalizeOverlayPreferences(value) {
  return {
    // Older versions allowed unpinning; visibility is now a required invariant.
    alwaysOnTop: true,
    filters: normalizeOverlayFilters(value?.filters),
    displayMode: value?.displayMode === 'raw' ? 'raw' : 'friendly',
    opacity: typeof value?.opacity === 'number' && Number.isFinite(value.opacity)
      && value.opacity >= 0.45 && value.opacity <= 1 ? value.opacity : DEFAULT_OVERLAY_PREFERENCES.opacity
  };
}

function createEventOverlayWindowOptions(preloadPath, options) {
  const baseOptions = createBrowserWindowOptions(preloadPath, options);
  return {
    ...baseOptions,
    webPreferences: { ...baseOptions.webPreferences, additionalArguments: ['--astradock-overlay'] },
    width: 520,
    height: 420,
    minWidth: 360,
    minHeight: 220,
    title: 'AstraDock Event Overlay',
    alwaysOnTop: true,
    opacity: options.opacity,
    resizable: true,
    minimizable: false,
    frame: true,
    skipTaskbar: true
  };
}

function pinEventOverlay(window, platform = process.platform) {
  if (window.isDestroyed()) return;
  if (platform === 'win32' || platform === 'darwin') {
    window.setAlwaysOnTop(true, 'screen-saver');
  } else {
    window.setAlwaysOnTop(true);
  }
}

function installEventOverlayVisibility(window, platform = process.platform) {
  pinEventOverlay(window, platform);
  const keepAboveGame = () => {
    // Never show a deliberately hidden window or take keyboard focus from the game.
    if (window.isDestroyed() || !window.isVisible()) return;
    pinEventOverlay(window, platform);
    window.moveTop();
  };
  for (const event of ['show', 'focus', 'blur', 'restore']) window.on(event, keepAboveGame);
}

function showEventOverlay(window, platform = process.platform) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  pinEventOverlay(window, platform);
  window.showInactive();
  window.moveTop();
}

module.exports = {
  DEFAULT_OVERLAY_PREFERENCES,
  createEventOverlayWindowOptions,
  installEventOverlayVisibility,
  normalizeOverlayPreferences,
  showEventOverlay
};
