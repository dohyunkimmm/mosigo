const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const auditFile = path.join(root, 'scripts/source-audit.js');
function runAudit(script = auditFile) {
  return spawnSync(process.execPath, [script], { cwd: path.dirname(script), encoding: 'utf8' });
}

test('source audit passes the current source and emits JSON', () => {
  const result = runAudit();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.styleBlocks, 0);
  assert.equal(report.inlineScriptBlocks, 0);
  assert.ok(report.externalScripts.some((s) => s.src === 'core/map-experience.js'));
});

test('source audit fails when inline style is introduced', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mosigo-source-audit-'));
  try {
    fs.mkdirSync(path.join(fixture, 'scripts'));
    fs.mkdirSync(path.join(fixture, 'src', 'core'), { recursive: true });
    fs.copyFileSync(auditFile, path.join(fixture, 'scripts', 'source-audit.js'));
    const sources = ['index.html', 'index.css', 'index-core.js', 'index-post.js',
      'new_ext-pages.js', 'ux-enhancements.js', 'core/map-experience.js'];
    for (const source of sources) {
      fs.copyFileSync(path.join(root, 'src', source), path.join(fixture, 'src', source));
    }
    fs.appendFileSync(path.join(fixture, 'src', 'index.html'), '\n<style>body { opacity: 1 }</style>\n');
    const result = runAudit(path.join(fixture, 'scripts', 'source-audit.js'));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /inline <style> blocks are forbidden/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
