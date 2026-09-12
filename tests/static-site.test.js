const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const HTML_FILES = ['index.html', 'new_event.html', 'new_game.html'];
const CSS_FILES = ['new_montage.css', 'new_roles.css'];

function readSrc(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function isExternalOrDynamic(ref) {
  const value = String(ref || '').trim();
  return (
    !value ||
    value.startsWith('#') ||
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('javascript:') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.includes('${') ||
    value.includes('{{') ||
    value.includes('<%')
  );
}

function cleanRef(ref) {
  const withoutQuery = String(ref).split('#')[0].split('?')[0].trim();
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function resolveLocalRef(ownerFile, ref) {
  const clean = cleanRef(ref);
  if (!clean || clean === '/') return null;
  if (clean.startsWith('/api/')) return null;
  if (clean.startsWith('/')) return path.join(SRC, clean.slice(1));
  return path.resolve(path.dirname(path.join(SRC, ownerFile)), clean);
}

function assertInsideSrc(resolved, ownerFile, ref) {
  const relative = path.relative(SRC, resolved);
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${ownerFile}: local reference escapes src/: ${ref}`
  );
}

test('required application entrypoints, modules, and config exist', () => {
  for (const file of [
    ...HTML_FILES,
    ...CSS_FILES,
    'api/hospitals.js',
    'data/hospitals.js',
    'lib/hospital-query.js',
    'vercel.json'
  ]) {
    assert.ok(fs.existsSync(path.join(SRC, file)), `Missing required file: src/${file}`);
  }
});

test('main page has essential mobile, SEO, and language metadata', () => {
  const html = readSrc('index.html');
  assert.match(html, /^\s*<!DOCTYPE html>/i, 'index.html should declare HTML5 doctype');
  assert.match(html, /<html\b[^>]*\blang=["']ko["']/i, 'index.html should declare lang="ko"');
  assert.match(html, /<meta\b[^>]*charset=["']?utf-8["']?/i, 'index.html should declare UTF-8');
  assert.match(html, /<meta\b[^>]*name=["']viewport["'][^>]*>/i, 'index.html should include viewport metadata');
  assert.match(html, /<title>[^<]+<\/title>/i, 'index.html should include a non-empty title');
  assert.match(html, /<meta\b[^>]*name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i, 'index.html should include a non-empty description');
});

test('local HTML asset and page references resolve to existing files', () => {
  const missing = [];
  const attrPattern = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;

  for (const file of HTML_FILES) {
    const html = readSrc(file);
    let match;
    while ((match = attrPattern.exec(html)) !== null) {
      const ref = match[1];
      if (isExternalOrDynamic(ref)) continue;
      const resolved = resolveLocalRef(file, ref);
      if (!resolved) continue;
      assertInsideSrc(resolved, file, ref);
      if (!fs.existsSync(resolved)) missing.push(`${file} -> ${ref}`);
    }
  }

  assert.deepEqual(missing, [], `Missing local HTML references:\n${missing.join('\n')}`);
});

test('local CSS url() references resolve to existing files', () => {
  const missing = [];
  const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  for (const file of CSS_FILES) {
    const css = readSrc(file);
    let match;
    while ((match = urlPattern.exec(css)) !== null) {
      const ref = match[1].trim();
      if (isExternalOrDynamic(ref)) continue;
      const resolved = resolveLocalRef(file, ref);
      if (!resolved) continue;
      assertInsideSrc(resolved, file, ref);
      if (!fs.existsSync(resolved)) missing.push(`${file} -> ${ref}`);
    }
  }

  assert.deepEqual(missing, [], `Missing local CSS references:\n${missing.join('\n')}`);
});

test('classic inline JavaScript blocks are syntax-valid', () => {
  const failures = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const file of HTML_FILES) {
    const html = readSrc(file);
    let match;
    while ((match = scriptPattern.exec(html)) !== null) {
      const attrs = match[1];
      const code = match[2].trim();
      if (!code || /\bsrc\s*=/i.test(attrs)) continue;

      const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : '';
      if (type && type !== 'text/javascript' && type !== 'application/javascript') continue;

      try {
        // Syntax validation only. The browser code is not executed.
        new Function(code);
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
      }
    }
  }

  assert.deepEqual(failures, [], `Inline JavaScript syntax errors:\n${failures.join('\n')}`);
});
