const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('main demo exposes visible keyboard focus and reduced-motion fallbacks', () => {
  const css = read('src/new_roles.css');
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
});

test('external event pages are mounted lazily and remain labelled', () => {
  const source = read('src/new_ext-pages.js');
  assert.match(source, /f\.loading\s*=\s*['"]lazy['"]/);
  assert.match(source, /back\.title\s*=\s*title/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /function init\(\)\{\s*injectStyle\(\);\s*hookBanner\(\);\s*\}/);
  assert.doesNotMatch(source, /function init\(\)\{[^}]*\bmount\(\)/s);
});

test('prototype video footprint stays within the v5 demo budget', () => {
  const videos = walk(SRC).filter((file) => path.extname(file).toLowerCase() === '.mp4');
  assert.ok(videos.length > 0, 'Expected prototype video assets');

  const sizes = videos.map((file) => ({ file: path.relative(ROOT, file), bytes: fs.statSync(file).size }));
  const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
  const mib = 1024 * 1024;

  assert.ok(total <= 24 * mib, `Total MP4 footprint is ${(total / mib).toFixed(2)} MiB; budget is 24 MiB`);
  for (const item of sizes) {
    assert.ok(item.bytes <= 9 * mib, `${item.file} is ${(item.bytes / mib).toFixed(2)} MiB; per-video budget is 9 MiB`);
  }
});
