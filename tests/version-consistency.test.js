const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('stable version stays synchronized across repository release surfaces', () => {
  const version = read('VERSION').trim();
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');
  const escaped = escapeRegExp(version);

  assert.match(version, /^\d+\.\d+\.\d+$/, 'VERSION must contain a semantic version');
  assert.equal(pkg.version, version, 'package.json version must match VERSION');
  assert.match(readme, new RegExp(`Current stable version:\\*\\* \\`v${escaped}\\``), 'README stable version must match VERSION');
  assert.match(changelog, new RegExp(`^## v${escaped}\\b`, 'm'), 'CHANGELOG must include the stable VERSION heading');
});
