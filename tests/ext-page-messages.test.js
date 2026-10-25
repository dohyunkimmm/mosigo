const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function createPageHarness() {
  const frames = [];
  const makeElement = (tag) => {
    const classes = new Set();
    const listeners = new Map();
    const el = {
      classList: {
        add: (...values) => values.forEach((value) => classes.add(value)),
        remove: (...values) => values.forEach((value) => classes.delete(value)),
        contains: (value) => classes.has(value)
      },
      appendChild() {},
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type, callback) => {
        if (listeners.get(type) === callback) listeners.delete(type);
      },
      contentWindow: tag === 'iframe' ? {} : undefined,
      set src(value) {
        this.loadedUrl = value;
        listeners.get('load')?.();
      }
    };
    if (tag === 'iframe') frames.push(el);
    return el;
  };
  const screens = makeElement('div');
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    createElement: makeElement,
    getElementById: (id) => id === 'screens' ? screens : null,
    addEventListener() {}
  };
  const listeners = new Map();
  const window = {
    location: { protocol: 'https:', origin: 'https://mosigo.example' },
    addEventListener: (type, callback) => listeners.set(type, callback)
  };
  const source = fs.readFileSync(path.join(ROOT, 'src/new_ext-pages.js'), 'utf8');
  vm.runInNewContext(source, { window, document, setTimeout() {} }, { filename: 'new_ext-pages.js' });
  window.openExtPage('event');
  assert.equal(window.isExtPageOpen(), true);
  assert.equal(frames.length, 2);
  return { frames, window, onMessage: listeners.get('message') };
}

test('extension navigation rejects messages from a foreign window or origin', () => {
  const { frames, window, onMessage } = createPageHarness();
  const close = { source: 'ext-page', action: 'close' };
  const activeFrameWindow = frames[1].contentWindow;

  onMessage({ data: close, source: {}, origin: window.location.origin });
  assert.equal(window.isExtPageOpen(), true);

  onMessage({ data: close, source: activeFrameWindow, origin: 'https://attacker.example' });
  assert.equal(window.isExtPageOpen(), true);

  onMessage({ data: close, source: activeFrameWindow, origin: window.location.origin });
  assert.equal(window.isExtPageOpen(), false);
});

test('child extension pages target the parent origin for messages', () => {
  for (const page of ['new_event.html', 'new_game.html']) {
    const source = fs.readFileSync(path.join(ROOT, 'src', page), 'utf8');
    assert.match(source, /const targetOrigin = window\.location\.protocol === 'file:' \? '\*' : window\.location\.origin/);
    assert.match(source, /window\.parent\.postMessage\([^;]+, targetOrigin\)/);
  }
});
