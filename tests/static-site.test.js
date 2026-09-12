const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const HTML_FILES = ['index.html', 'new_event.html', 'new_game.html'];
const CSS_FILES = ['index.css', 'new_montage.css', 'new_roles.css'];
const JS_FILES = ['index-core.js', 'new_ext-pages.js', 'index-post.js', 'v4-functional.js'];

function readSrc(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function maskHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );
}

function collectTagBlocks(tagName, source) {
  const masked = maskHtmlComments(source);
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  const exactPattern = new RegExp(`^<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>$`, 'i');
  const blocks = [];
  let match;

  while ((match = pattern.exec(masked)) !== null) {
    const full = source.slice(match.index, match.index + match[0].length);
    const exact = full.match(exactPattern);
    assert.ok(exact, `Could not parse ${tagName} block at index ${match.index}`);
    blocks.push({ attrs: exact[1], body: exact[2] });
  }

  return blocks;
}

function getAttr(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || null;
}

function isClassicInlineScript(block) {
  if (getAttr(block.attrs, 'src')) return false;
  const type = getAttr(block.attrs, 'type');
  return !type || type === 'text/javascript' || type === 'application/javascript';
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
    ...JS_FILES,
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

test('main page keeps CSS and classic JavaScript externalized in execution order', () => {
  const html = readSrc('index.html');
  const scripts = collectTagBlocks('script', html);
  const classicInline = scripts.filter(isClassicInlineScript);
  const srcs = scripts.map((script) => getAttr(script.attrs, 'src')).filter(Boolean);

  assert.equal((html.match(/<!--/g) || []).length, (html.match(/-->/g) || []).length, 'HTML comments should stay balanced');
  assert.equal(collectTagBlocks('style', html).length, 0, 'index.html should not contain actual inline style blocks');
  assert.equal(classicInline.length, 0, 'index.html should not contain classic inline JavaScript');
  assert.ok(html.includes('href="index.css"'), 'index.html should load index.css');

  const coreIndex = srcs.indexOf('index-core.js');
  const extIndex = srcs.indexOf('new_ext-pages.js');
  const postIndex = srcs.indexOf('index-post.js');
  assert.ok(coreIndex >= 0, 'index-core.js should be loaded');
  assert.ok(extIndex > coreIndex, 'new_ext-pages.js should load after index-core.js');
  assert.ok(postIndex > extIndex, 'index-post.js should load after new_ext-pages.js');
  assert.ok(Buffer.byteLength(html) < 200_000, 'index.html should remain below the v3 structural size guard');
});

test('v4 functional layer is loaded by the post-runtime extension point', () => {
  const post = readSrc('index-post.js');
  assert.match(post, /script\.src=['"]v4-functional\.js['"]/, 'index-post.js should load v4-functional.js');
  assert.match(readSrc('v4-functional.js'), /v4SearchHospitals/, 'v4 functional search layer should expose its search implementation');
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

test('externalized classic JavaScript files are syntax-valid', () => {
  const failures = [];
  for (const file of JS_FILES) {
    try {
      new Function(readSrc(file));
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], `External JavaScript syntax errors:\n${failures.join('\n')}`);
});

test('remaining classic inline JavaScript blocks are syntax-valid', () => {
  const failures = [];

  for (const file of HTML_FILES) {
    const html = readSrc(file);
    for (const block of collectTagBlocks('script', html).filter(isClassicInlineScript)) {
      const code = block.body.trim();
      if (!code) continue;
      try {
        new Function(code);
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
      }
    }
  }

  assert.deepEqual(failures, [], `Inline JavaScript syntax errors:\n${failures.join('\n')}`);
});
