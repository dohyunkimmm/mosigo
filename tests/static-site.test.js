const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const HTML_FILES = ['index.html', 'new_event.html', 'new_game.html', 'ops.html'];
const CSS_FILES = ['index.css', 'new_montage.css', 'new_roles.css', 'v14-ops.css', 'runtime/account-ui.css'];
const RUNTIME_JS = [
  'runtime/boot.js',
  'runtime/post-ui.js',
  'runtime/hospital-search.js',
  'runtime/booking-runtime.js',
  'runtime/booking-sync.js',
  'runtime/booking-recovery.js',
  'runtime/booking-trace.js',
  'runtime/booking-coordination.js',
  'runtime/booking-durable.js',
  'runtime/booking-handoff.js',
  'runtime/booking-handoff-ui.js',
  'runtime/booking-sharing.js',
  'runtime/booking-sharing-ui.js',
  'runtime/account-ownership.js',
  'runtime/account-ui.js'
];
const JS_FILES = ['index-core.js', 'new_ext-pages.js', 'index-post.js', 'booking-state.js', 'v14-ops.js', ...RUNTIME_JS];
const REMOVED_VERSIONED_ROOT_FILES = [
  'v4-functional.js', 'v4-booking.js', 'v6-booking.js', 'v7-booking.js', 'v8-booking.js',
  'v9-booking.js', 'v10-booking.js', 'v11-booking.js', 'v11-ui.js', 'v12-sharing.js',
  'v12-ui.js', 'v13-account.js', 'v13-ui.js', 'v13-ui.css'
];

function readSrc(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

function maskHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
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
    !value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:') ||
    value.startsWith('javascript:') || value.startsWith('mailto:') || value.startsWith('tel:') ||
    value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes('${') ||
    value.includes('{{') || value.includes('<%')
  );
}

function cleanRef(ref) {
  const withoutQuery = String(ref).split('#')[0].split('?')[0].trim();
  try { return decodeURIComponent(withoutQuery); } catch { return withoutQuery; }
}

function resolveLocalRef(ownerFile, ref) {
  const clean = cleanRef(ref);
  if (!clean || clean === '/' || clean.startsWith('/api/')) return null;
  if (clean.startsWith('/')) return path.join(SRC, clean.slice(1));
  return path.resolve(path.dirname(path.join(SRC, ownerFile)), clean);
}

function assertInsideSrc(resolved, ownerFile, ref) {
  const relative = path.relative(SRC, resolved);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${ownerFile}: local reference escapes src/: ${ref}`);
}

test('current application entrypoints, runtime modules, and config exist', () => {
  for (const file of [
    ...HTML_FILES, ...CSS_FILES, ...JS_FILES,
    'api/hospitals.js', 'api/bookings.js', 'api/booking-shares.js', 'api/account.js',
    'data/hospitals.js', 'lib/hospital-query.js', 'lib/booking-service.js', 'lib/booking-store.js',
    'package.json', 'vercel.json'
  ]) {
    assert.ok(fs.existsSync(path.join(SRC, file)), `Missing required file: src/${file}`);
  }
});

test('obsolete version-numbered runtime files are removed from src root', () => {
  for (const file of REMOVED_VERSIONED_ROOT_FILES) {
    assert.equal(fs.existsSync(path.join(SRC, file)), false, `Legacy root runtime should be removed: src/${file}`);
  }
});

test('main page keeps CSS and classic JavaScript externalized in execution order', () => {
  const html = readSrc('index.html');
  const scripts = collectTagBlocks('script', html);
  const classicInline = scripts.filter(isClassicInlineScript);
  const srcs = scripts.map((script) => getAttr(script.attrs, 'src')).filter(Boolean);

  assert.match(html, /^\s*<!DOCTYPE html>/i);
  assert.match(html, /<html\b[^>]*\blang=["']ko["']/i);
  assert.match(html, /<meta\b[^>]*name=["']viewport["'][^>]*>/i);
  assert.equal((html.match(/<!--/g) || []).length, (html.match(/-->/g) || []).length);
  assert.equal(collectTagBlocks('style', html).length, 0);
  assert.equal(classicInline.length, 0);
  assert.ok(html.includes('href="index.css"'));

  const coreIndex = srcs.indexOf('index-core.js');
  const extIndex = srcs.indexOf('new_ext-pages.js');
  const postIndex = srcs.indexOf('index-post.js');
  assert.ok(coreIndex >= 0);
  assert.ok(extIndex > coreIndex);
  assert.ok(postIndex > extIndex);
  assert.ok(Buffer.byteLength(html) < 200_000);
});

test('stable browser entry delegates to a single role-based runtime bootstrap', () => {
  const entry = readSrc('index-post.js');
  const boot = readSrc('runtime/boot.js');
  const post = readSrc('runtime/post-ui.js');
  const bookingState = readSrc('booking-state.js');

  assert.match(entry, /runtime\/boot\.js/);
  assert.match(boot, /post-ui\.js/);
  assert.match(post, /script\.src=['"]v4-functional\.js['"]/, 'preserved post UI should still request the historical extension name');
  assert.match(boot, /'v4-functional\.js':'hospital-search\.js'/);
  assert.match(boot, /'v10-booking\.js':'booking-durable\.js'/);
  assert.match(boot, /'v13-account\.js':'account-ownership\.js'/);
  assert.match(boot, /'v13-ui\.css':'account-ui\.css'/);
  assert.doesNotMatch(boot, /'booking-state\.js':/, 'shared booking-state should keep its stable root path for browser and Node consumers');
  assert.match(boot, /rewriteRuntimeAsset/);
  assert.match(bookingState, /MosigoBookingState/);
});

test('current runtime keeps booking, handoff, sharing, and account contracts intact', () => {
  const functional = readSrc('runtime/hospital-search.js');
  const booking = readSrc('runtime/booking-runtime.js');
  const sync = readSrc('runtime/booking-sync.js');
  const recovery = readSrc('runtime/booking-recovery.js');
  const trace = readSrc('runtime/booking-trace.js');
  const coordination = readSrc('runtime/booking-coordination.js');
  const durable = readSrc('runtime/booking-durable.js');
  const handoff = readSrc('runtime/booking-handoff.js');
  const sharing = readSrc('runtime/booking-sharing.js');
  const sharingUi = readSrc('runtime/booking-sharing-ui.js');
  const account = readSrc('runtime/account-ownership.js');
  const accountUi = readSrc('runtime/account-ui.js');
  const accountCss = readSrc('runtime/account-ui.css');

  assert.match(functional, /v4SearchHospitals/);
  assert.match(booking, /MosigoV4BookingRuntime/);
  assert.match(sync, /X-Mosigo-Share-Token/);
  assert.match(recovery, /equal-revision-divergence/);
  assert.match(trace, /MosigoV8BookingTrace/);
  assert.match(coordination, /MosigoV9BookingCoordination/);
  assert.match(durable, /MosigoV10BookingDurability/);
  assert.match(durable, /v11\.src=['"]v11-booking\.js['"]/);
  assert.match(durable, /v12\.src=['"]v12-sharing\.js['"]/);
  assert.match(durable, /v13\.src=['"]v13-account\.js['"]/);
  assert.match(handoff, /#mosigo-recovery=/);
  assert.match(sharing, /#mosigo-share=/);
  assert.match(sharing, /setOwnerAccessProvider/);
  assert.match(sharingUi, /공유 링크 폐기/);
  assert.match(account, /credentials:'same-origin'/);
  assert.match(account, /claim-booking/);
  assert.doesNotMatch(account, /localStorage/);
  assert.doesNotMatch(account, /sessionStorage/);
  assert.match(accountUi, /계정 로그인 · 예약 이어보기/);
  assert.match(accountUi, /href:'v13-ui\.css'/);
  assert.match(accountCss, /:focus-visible/);
  assert.match(accountCss, /prefers-reduced-motion/);
});

test('Vercel keeps old versioned public asset URLs compatible while source uses current paths', () => {
  const config = JSON.parse(readSrc('vercel.json'));
  const rewrites = new Map((config.rewrites || []).map(({ source, destination }) => [source, destination]));
  assert.equal(rewrites.get('/v4-functional.js'), '/runtime/hospital-search.js');
  assert.equal(rewrites.get('/v10-booking.js'), '/runtime/booking-durable.js');
  assert.equal(rewrites.get('/v11-ui.js'), '/runtime/booking-handoff-ui.js');
  assert.equal(rewrites.get('/v12-sharing.js'), '/runtime/booking-sharing.js');
  assert.equal(rewrites.get('/v13-account.js'), '/runtime/account-ownership.js');
  assert.equal(rewrites.get('/v13-ui.css'), '/runtime/account-ui.css');
  assert.equal(rewrites.has('/booking-state.js'), false, 'shared booking-state should be served directly from its stable root path');
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

test('current external JavaScript files are syntax-valid', () => {
  const failures = [];
  for (const file of JS_FILES) {
    try { new Function(readSrc(file)); }
    catch (error) { failures.push(`${file}: ${error.message}`); }
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
      try { new Function(code); }
      catch (error) { failures.push(`${file}: ${error.message}`); }
    }
  }
  assert.deepEqual(failures, [], `Inline JavaScript syntax errors:\n${failures.join('\n')}`);
});
