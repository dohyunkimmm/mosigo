'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.isFile() && entry.name.endsWith('.md') ? [path.relative(root, file)] : [];
  });
}

const documents = [
  'README.md',
  'CHANGELOG.md',
  '.github/pull_request_template.md',
  ...markdownFiles(path.join(root, 'docs'))
];

test('repository-local Markdown links point to existing files or directories', () => {
  const broken = [];
  for (const relative of documents) {
    const markdown = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const match of markdown.matchAll(/!?\[[^\]\r\n]*\]\((<[^>]+>|[^)\r\n]+)\)/g)) {
      let href = match[1].trim();
      if (href.startsWith('<')) href = href.slice(1, href.indexOf('>'));
      else href = href.replace(/\s+(?:"[^"]*"|'[^']*')\s*$/, '').trim();
      if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) continue;
      href = href.split(/[?#]/)[0];
      if (!href) continue;

      let decoded;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        broken.push(`${relative}: invalid URI ${href}`);
        continue;
      }

      const resolved = decoded.startsWith('/')
        ? path.resolve(root, '.' + decoded)
        : path.resolve(root, path.dirname(relative), decoded);
      if (
        (resolved !== root && !resolved.startsWith(root + path.sep)) ||
        !fs.existsSync(resolved)
      ) broken.push(`${relative}: ${href}`);
    }
  }
  assert.deepEqual(broken, [], broken.join('\n'));
});
