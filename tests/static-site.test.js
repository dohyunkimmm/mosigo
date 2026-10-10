const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const HTML_FILES = ['index.html', 'new_event.html', 'new_game.html', 'ops.html', 'ops-preview.html'];
const CSS_FILES = ['index.css', 'new_montage.css', 'new_roles.css', 'v14-ops.css', 'ops-preview.css', 'ux-enhancements.css', 'runtime/account-ui.css'];
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
const JS_FILES = ['core/map-experience.js', 'index-core.js', 'new_ext-pages.js', 'index-post.js', 'booking-state.js', 'v14-ops.js', 'ops-preview.js', 'ux-enhancements.js', ...RUNTIME_JS];
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

  const mapIndex = srcs.indexOf('core/map-experience.js');
  const coreIndex = srcs.indexOf('index-core.js');
  const extIndex = srcs.indexOf('new_ext-pages.js');
  const postIndex = srcs.indexOf('index-post.js');
  assert.ok(mapIndex >= 0 && coreIndex > mapIndex);
  assert.ok(extIndex > coreIndex);
  assert.ok(postIndex > extIndex);
  assert.ok(Buffer.byteLength(html) < 200_000);
});

test('stable browser entry delegates to a single role-based runtime bootstrap', () => {
  const entry = readSrc('index-post.js');
  const boot = readSrc('runtime/boot.js');
  const post = readSrc('runtime/post-ui.js');
  const map = readSrc('core/map-experience.js');
  const core = readSrc('index-core.js');
  const bookingState = readSrc('booking-state.js');

  assert.match(entry, /runtime\/boot\.js/);
  assert.match(boot, /post-ui\.js/);
  assert.match(post, /script\.src=['"]\/runtime\/hospital-search\.js['"]/, 'post UI loads current runtime');






  assert.match(bookingState, /MosigoBookingState/);
  assert.doesNotMatch(boot, /head\.appendChild=function/);
  assert.match(boot, /runtimeBase/);
  assert.match(map, /function initMaps\(/);
  assert.doesNotMatch(core, /function initMaps\(/);
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
  assert.match(durable, /v11\.src=['"]\/runtime\/booking-handoff\.js['"]/);
  assert.match(durable, /v12\.src=['"]\/runtime\/booking-sharing\.js['"]/);
  assert.match(durable, /v13\.src=['"]\/runtime\/account-ownership\.js['"]/);
  assert.match(handoff, /#mosigo-recovery=/);
  assert.match(sharing, /#mosigo-share=/);
  assert.match(sharing, /setOwnerAccessProvider/);
  assert.match(sharingUi, /공유 링크 폐기/);
  assert.match(account, /credentials:'same-origin'/);
  assert.match(account, /claim-booking/);
  assert.doesNotMatch(account, /localStorage/);
  assert.doesNotMatch(account, /sessionStorage/);
  assert.match(accountUi, /계정 로그인 · 예약 이어보기/);
  assert.match(accountUi, /href:'\/runtime\/account-ui\.css'/);
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

test('typography QA keeps large headings, readable operations text, and a shared font', () => {
  const appCss = readSrc('index.css');
  const opsCss = readSrc('v14-ops.css');
  const opsHtml = readSrc('ops.html');
  assert.match(appCss, /--g500:\s*#[0-9a-f]{6}/i);
  assert.match(appCss, /--g700:\s*#[0-9a-f]{6}/i);
  const largeHeadingRule = appCss.match(/#phone\.mosigo-large-text \.app-bar-title,[\s\S]*?font-size:18px !important;[^}]*\}/)?.[0];
  assert.ok(largeHeadingRule, 'Small headings must be enlarged');
  for (const selector of ['bk-title', 'hl-title', 'hd-nm', 'mgr-hero-nm', 'dr-head-t']) {
    assert.ok(!largeHeadingRule.includes('.' + selector), selector + ' must keep its original larger font size');
  }
  assert.doesNotMatch(appCss, /#phone\.mosigo-large-text \.hl-row \.v\s*,/);
  assert.match(appCss, /#phone\.mosigo-large-text \.ob-btn\s*\{\s*font-size:17px/);
  assert.match(appCss, /\.pr-proof span, \.pr-note \{ font-size:12px;/);
  const sizes = [...opsCss.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 0 && sizes.every((size) => size >= 12), 'Operations text must not fall below 12px');
  assert.match(opsCss, /\.ops-button\.primary\{background:var\(--ops-accent-dark\);color:#fff/);
  assert.match(opsCss, /--ops-faint:#637069;/);
  assert.match(opsCss, /--ops-font:'Pretendard Variable'/);
  assert.match(opsHtml, /pretendardvariable-dynamic-subset\.min\.css/);
});


test('final typography QA guards 320px operations, contrast and text resizing', () => {
  const appCss = readSrc('index.css');
  const rolesCss = readSrc('new_roles.css');
  const opsCss = readSrc('v14-ops.css');

  // A fixed 340px minimum used to overflow the 320px Operations viewport.
  const narrowRule = opsCss.match(/@media\s*\(max-width:360px\)\s*\{[\s\S]*?\.ops-field input\s*\{[^}]*\}[^}]*\}/)?.[0];
  assert.ok(narrowRule, 'Operations should provide a 320px login override');
  assert.match(narrowRule, /\.ops-auth-gate\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(narrowRule, /\.ops-field input\s*\{[^}]*min-width:0/);

  // Normal-sized supporting text should meet WCAG AA contrast (4.5:1).
  const lightness = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((pair) => parseInt(pair, 16) / 255);
    const linear = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const mutedHex = opsCss.match(/--ops-muted:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(mutedHex, 'Operations should define a muted text color');
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  for (const background of ['#f5f7f8', '#ffffff']) {
    assert.ok(contrast(lightness(mutedHex.slice(1)), lightness(background.slice(1))) >= 4.5,
      'Operations supporting text should have AA contrast against ' + background);
  }

  // Large-text mode must not leave key 10-11.5px content at caption size.
  for (const selector of ['#s-onboard .perm-row .ds', '#s-onboard .ob-info li',
    '#s-mgr .mgr-stat3 span', '#s-report .ai-chip',
    '#s-report span[style*="font-size:10px"]',
    '#s-report span[style*="font-size:11px"]',
    '#s-settings .v13-account-desc']) {
    assert.ok(appCss.includes('#phone.mosigo-large-text ' + selector),
      'Missing large-text override for ' + selector);
  }
  assert.match(appCss, /#phone\.mosigo-large-text #s-settings \.v13-account-desc\s*\{\s*font-size:14px !important/);
  assert.match(appCss, /#phone\.mosigo-large-text #s-home \.cat-grid\s*\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);

  // Text-only resizing must be able to wrap labels and report actions.
  assert.match(rolesCss, /#phone \.cat \.cl\s*\{[^}]*overflow-wrap:anywhere/);
  assert.match(rolesCss, /#phone \.dr-call\s*\{[^}]*white-space:normal;[^}]*overflow-wrap:anywhere/);
});

test('P0/P1/P2 journeys explicitly disclose simulations and keep account data isolated', () => {
  const home = readSrc('index.html');
  const ops = readSrc('ops.html');
  const preview = readSrc('ops-preview.html');
  const previewJs = readSrc('ops-preview.js');
  const uxJs = readSrc('ux-enhancements.js');
  const css = readSrc('ux-enhancements.css');
  assert.match(ops, /href="\/ops-preview\.html"/);
  assert.match(preview, /읽기 전용/);
  assert.match(preview, /실제 계정과 연결되지 않습니다/);
  assert.doesNotMatch(previewJs, /fetch\(|localStorage|sessionStorage|document\.cookie|\/api\//);
  assert.match(previewJs, /data-sample-filter/);
  assert.match(home, /mosigo-home-task/);
  assert.match(home, /mosigo-compare-trigger/);
  assert.match(home, /mosigo-report-orientation/);
  assert.match(uxJs, /window\.openMgrCompare=openMgrCompare/);
  assert.match(uxJs, /window\.showPrototypeNotice=showPrototypeNotice/);
  assert.match(uxJs, /실제 처리나 알림 발송은 수행되지 않습니다/);
  assert.match(css, /mosigo-compare-dialog/);
  assert.match(readSrc('runtime/post-ui.js'), /\.mp-menu-i\[onclick\]/);
});
