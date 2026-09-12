const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX = path.join(SRC, 'index.html');
const CSS = path.join(SRC, 'index.css');
const CORE_JS = path.join(SRC, 'index-core.js');
const POST_JS = path.join(SRC, 'index-post.js');

const STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function getAttr(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || null;
}

function isClassicInlineScript(attrs) {
  if (getAttr(attrs, 'src')) return false;
  const type = getAttr(attrs, 'type');
  return !type || type === 'text/javascript' || type === 'application/javascript';
}

function collect(pattern, html) {
  pattern.lastIndex = 0;
  return [...html.matchAll(pattern)];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const original = fs.readFileSync(INDEX, 'utf8');
const styleMatches = collect(STYLE_RE, original);
const allScriptMatches = collect(SCRIPT_RE, original);
const inlineScripts = allScriptMatches.filter((match) => isClassicInlineScript(match[1]));

const alreadySplit =
  styleMatches.length === 0 &&
  inlineScripts.length === 0 &&
  original.includes('href="index.css"') &&
  original.includes('src="index-core.js"') &&
  original.includes('src="index-post.js"');

if (alreadySplit) {
  for (const file of [CSS, CORE_JS, POST_JS]) {
    assert(fs.existsSync(file), `Expected generated asset is missing: ${path.relative(ROOT, file)}`);
  }
  console.log('src/index.html is already split; no changes required.');
  process.exit(0);
}

assert(styleMatches.length === 7, `Expected 7 inline style blocks, found ${styleMatches.length}`);
assert(inlineScripts.length === 2, `Expected 2 classic inline script blocks, found ${inlineScripts.length}`);

for (const match of styleMatches) {
  const id = getAttr(match[1], 'id');
  if (!id) continue;
  const occurrences = original.split(id).length - 1;
  assert(occurrences === 1, `Style id ${id} is referenced outside its style block; aborting split.`);
}

for (const match of inlineScripts) {
  assert(!/\bdocument\.currentScript\b/.test(match[2]), 'document.currentScript detected in inline JavaScript; aborting split.');
}

const firstInlineEnd = inlineScripts[0].index + inlineScripts[0][0].length;
const secondInlineStart = inlineScripts[1].index;
const betweenScripts = original.slice(firstInlineEnd, secondInlineStart);
assert(
  /<script\b[^>]*\bsrc=["']new_ext-pages\.js["'][^>]*><\/script>/i.test(betweenScripts),
  'Expected new_ext-pages.js between the two inline script blocks.'
);

const css = styleMatches
  .map((match, index) => {
    const attrs = match[1].trim();
    const label = attrs ? ` /* original style block ${index + 1}: ${attrs} */` : ` /* original style block ${index + 1} */`;
    return `${label}\n${match[2].trim()}\n`;
  })
  .join('\n');

const coreJs = `${inlineScripts[0][2].trim()}\n`;
const postJs = `${inlineScripts[1][2].trim()}\n`;

let styleIndex = 0;
let transformed = original.replace(STYLE_RE, () => {
  styleIndex += 1;
  return styleIndex === 1 ? '<link rel="stylesheet" href="index.css">' : '';
});

let inlineIndex = 0;
transformed = transformed.replace(SCRIPT_RE, (full, attrs) => {
  if (!isClassicInlineScript(attrs)) return full;
  inlineIndex += 1;
  assert(inlineIndex <= 2, `Unexpected extra inline script at replacement index ${inlineIndex}`);
  return inlineIndex === 1
    ? '<script src="index-core.js"></script>'
    : '<script src="index-post.js"></script>';
});

assert(collect(STYLE_RE, transformed).length === 0, 'Inline style blocks remain after transformation.');
assert(
  collect(SCRIPT_RE, transformed).filter((match) => isClassicInlineScript(match[1])).length === 0,
  'Classic inline script blocks remain after transformation.'
);
assert(transformed.includes('href="index.css"'), 'index.css reference missing after transformation.');
assert(transformed.includes('src="index-core.js"'), 'index-core.js reference missing after transformation.');
assert(transformed.includes('src="index-post.js"'), 'index-post.js reference missing after transformation.');

fs.writeFileSync(CSS, css, 'utf8');
fs.writeFileSync(CORE_JS, coreJs, 'utf8');
fs.writeFileSync(POST_JS, postJs, 'utf8');
fs.writeFileSync(INDEX, transformed, 'utf8');

console.log(JSON.stringify({
  before: {
    indexBytes: Buffer.byteLength(original),
    inlineStyleBlocks: styleMatches.length,
    inlineStyleBytes: styleMatches.reduce((sum, match) => sum + Buffer.byteLength(match[0]), 0),
    inlineScriptBlocks: inlineScripts.length,
    inlineScriptBytes: inlineScripts.reduce((sum, match) => sum + Buffer.byteLength(match[0]), 0)
  },
  after: {
    indexBytes: Buffer.byteLength(transformed),
    cssBytes: Buffer.byteLength(css),
    coreJsBytes: Buffer.byteLength(coreJs),
    postJsBytes: Buffer.byteLength(postJs)
  }
}, null, 2));
