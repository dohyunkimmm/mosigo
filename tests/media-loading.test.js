const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const page = readFileSync(join(__dirname, '../src/new_game.html'), 'utf8');

test('game videos do not preload before the user starts the game', () => {
  for (const asset of ['game2.mp4', 'game3.mp4', 'game4.mp4']) {
    const escaped = asset.replace('.', '\\.');
    assert.match(page, new RegExp(`src="${escaped}"[^>]*preload="none"`));
  }
});

test('result animation plays only after its result panel opens', () => {
  assert.match(page, /class="g-result-art"[^>]*preload="none"[^>]*>/);
  const tag = page.match(/<video class="g-result-art"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(tag, /\bautoplay\b/);
  assert.match(page, /const p = art\.play\(\)/);
});
