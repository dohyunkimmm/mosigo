const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('stable version stays synchronized across repository release surfaces', () => {
  const version = read('VERSION').trim();
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');

  assert.match(version, /^\d+\.\d+\.\d+$/, 'VERSION must contain a semantic version');
  assert.equal(pkg.version, version, 'package.json version must match VERSION');
  assert.ok(
    readme.includes(`**Current stable version:** \`v${version}\``),
    'README stable version must match VERSION'
  );
  assert.ok(
    changelog.includes(`## v${version} —`) || changelog.includes(`## v${version}\n`),
    'CHANGELOG must include the stable VERSION heading'
  );
});
