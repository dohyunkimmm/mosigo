const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

test('production discovery files are present and point to the canonical demo URL', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /Sitemap: https:\/\/mosigo-nine\.vercel\.app\/sitemap\.xml/);

  assert.match(sitemap, /<urlset\b/);
  assert.match(sitemap, /<loc>https:\/\/mosigo-nine\.vercel\.app\/<\/loc>/);
});

test('Vercel config applies low-risk production security headers', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.framework, null);
  assert.ok(Array.isArray(config.headers));

  const globalRule = config.headers.find((entry) => entry.source === '/(.*)');
  assert.ok(globalRule, 'Expected a global response-header rule');

  const headers = Object.fromEntries(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['permissions-policy'], /geolocation=\(self\)/);
});

test('Vercel Git deployment policy spends builds on verified main only', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(config.git?.deploymentEnabled, {
    '**': false,
    main: true
  });
});

test('health endpoint is part of the deployed application surface', () => {
  assert.ok(fs.existsSync(path.join(SRC, 'api', 'health.js')));
});

test('Production Smoke never writes real booking, account, or share records', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/production-smoke.yml'), 'utf8');
  const smoke = fs.readFileSync(path.join(ROOT, 'scripts/production-smoke.js'), 'utf8');

  assert.match(workflow, /SMOKE_READ_ONLY: 'true'/);
  assert.doesNotMatch(workflow, /read_only=false|steps\.deployment\.outputs\.read_only/);
  assert.match(workflow, /expected_commit=\$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.doesNotMatch(smoke, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(smoke, /accountEmail|sampleBooking|requestJson/);
  assert.match(smoke, /Read-only smoke: verified production API capabilities and assets without creating test records/);
  assert.match(smoke, /for \(const asset of \[/);
  assert.match(smoke, /requiresDurableStorage\(RELEASE_VERSION\)/);
});

test('CSP is report-only, scoped to audited third-party origins, and cannot silently become blocking', () => {
  const config = JSON.parse(read('vercel.json'));
  const globalRule = config.headers.find(entry => entry.source === '/(.*)');
  const headers = Object.fromEntries(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  const csp = headers['content-security-policy-report-only'];
  assert.equal(typeof csp, 'string');
  assert.equal(headers['content-security-policy'], undefined, 'Enforcement requires a separate compatibility review');
  assert.match(csp, /(?:^|; )default-src 'self'(?:;|$)/);
  assert.match(csp, /(?:^|; )object-src 'none'(?:;|$)/);
  assert.match(csp, /(?:^|; )frame-ancestors 'self'(?:;|$)/);
  assert.match(csp, /(?:^|; )form-action 'self'(?:;|$)/);
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/unpkg\.com/);
  assert.match(csp, /style-src [^;]*https:\/\/cdn-uicons\.flaticon\.com/);
  assert.match(csp, /img-src [^;]*https:\/\/\*\.basemaps\.cartocdn\.com/);
  assert.doesNotMatch(csp, /(?:^|\s)\*(?:\s|;|$)|default-src https:/);
  assert.doesNotMatch(csp, /report-uri|report-to/, 'No unreviewed collection endpoint or sensitive report uploads');
});
