const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  createEventOverlayWindowOptions,
  installEventOverlayVisibility,
  normalizeOverlayPreferences,
  showEventOverlay
} = require('../src/eventOverlayWindow');

class OverlayWindow extends EventEmitter {
  visible = false;
  destroyed = false;
  minimized = false;
  topmost = false;
  raised = 0;
  focused = 0;
  level = null;
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return this.minimized; }
  setAlwaysOnTop(value, level) { this.topmost = value; this.level = level; }
  moveTop() { this.raised += 1; }
  focus() { this.focused += 1; }
  showInactive() { this.visible = true; this.emit('show'); }
  restore() { this.minimized = false; this.visible = true; this.emit('restore'); }
  hide() { this.visible = false; this.emit('hide'); }
}

test('overlay options preserve isolation and disable accidental minimization', () => {
  const options = createEventOverlayWindowOptions('/tmp/preload.js', { isPackaged: true, opacity: 0.7 });
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.minimizable, false);
  assert.equal(options.show, false);
  assert.equal(options.opacity, 0.7);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
});

test('legacy unpinned preference migrates to pinned without losing valid opacity', () => {
  assert.deepEqual(normalizeOverlayPreferences({ alwaysOnTop: false, opacity: 0.6 }), { alwaysOnTop: true, opacity: 0.6, displayMode: 'friendly', filters: { categories: [], actions: [], itemTypes: [] } });
  for (const value of [null, {}, { opacity: NaN }, { opacity: Infinity }, { opacity: 0.44 }, { opacity: 1.01 }]) {
    assert.deepEqual(normalizeOverlayPreferences(value), { alwaysOnTop: true, opacity: 0.82, displayMode: 'friendly', filters: { categories: [], actions: [], itemTypes: [] } });
  }
});

test('show and reopen pin above the game without acquiring keyboard focus', () => {
  const window = new OverlayWindow();
  installEventOverlayVisibility(window, 'win32');
  showEventOverlay(window, 'win32');
  assert.equal(window.visible, true);
  assert.equal(window.topmost, true);
  assert.equal(window.level, 'screen-saver');
  assert.equal(window.focused, 0);
  window.hide();
  showEventOverlay(window, 'win32');
  assert.equal(window.visible, true);
  assert.equal(window.focused, 0);
});

test('focus changes preserve visibility and restore topmost state without a focus loop', () => {
  const window = new OverlayWindow();
  installEventOverlayVisibility(window, 'win32');
  showEventOverlay(window, 'win32');
  for (const event of ['focus', 'blur', 'restore']) {
    window.topmost = false;
    const previousRaises = window.raised;
    window.emit(event);
    assert.equal(window.visible, true);
    assert.equal(window.topmost, true);
    assert.ok(window.raised > previousRaises);
    assert.equal(window.focused, 0);
  }
});

test('explicit close remains hidden through later blur/focus/restore notifications', () => {
  const window = new OverlayWindow();
  installEventOverlayVisibility(window, 'win32');
  showEventOverlay(window, 'win32');
  window.hide();
  const previousRaises = window.raised;
  for (const event of ['blur', 'focus', 'restore']) window.emit(event);
  assert.equal(window.visible, false);
  assert.equal(window.raised, previousRaises);
});

test('reopening a minimized overlay restores it; destroyed windows are left alone', () => {
  const window = new OverlayWindow();
  installEventOverlayVisibility(window, 'win32');
  window.minimized = true;
  showEventOverlay(window, 'win32');
  assert.equal(window.minimized, false);
  assert.equal(window.visible, true);
  window.destroyed = true;
  const previousRaises = window.raised;
  window.emit('blur');
  showEventOverlay(window, 'win32');
  assert.equal(window.raised, previousRaises);
});

test('platform-specific topmost level is omitted on Linux', () => {
  const window = new OverlayWindow();
  installEventOverlayVisibility(window, 'linux');
  showEventOverlay(window, 'linux');
  assert.equal(window.topmost, true);
  assert.equal(window.level, undefined);
});
