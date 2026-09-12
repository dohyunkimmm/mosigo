const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const INDEX = path.join(SRC, 'index.html');
const CSS = path.join(SRC, 'index.css');
const CORE_JS = path.join(SRC, 'index-core.js');
const POST_JS = path.join(SRC, 'index-post.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function maskHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, (comment) =>
    comment.replace(/[^\n]/g, ' ')
  );
}

function getAttr(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] || null;
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
    assert(exact, `Could not parse ${tagName} block at index ${match.index}`);
    blocks.push({
      index: match.index,
      length: match[0].length,
      full,
      attrs: exact[1],
      body: exact[2]
    });
  }

  return blocks;
}

function isClassicInlineScript(block) {
  if (getAttr(block.attrs, 'src')) return false;
  const type = getAttr(block.attrs, 'type');
  return !type || type === 'text/javascript' || type === 'application/javascript';
}

function replaceBlocks(source, blocks, replacements) {
  assert(blocks.length === replacements.length, 'Replacement count does not match block count.');
  let output = source;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    output = output.slice(0, block.index) + replacements[i] + output.slice(block.index + block.length);
  }
  return output;
}

function count(source, token) {
  return source.split(token).length - 1;
}

const original = fs.readFileSync(INDEX, 'utf8');
const styleBlocks = collectTagBlocks('style', original);
const scriptBlocks = collectTagBlocks('script', original);
const inlineScripts = scriptBlocks.filter(isClassicInlineScript);

const alreadySplit =
  styleBlocks.length === 0 &&
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

assert(count(original, '<!--') === count(original, '-->'), 'HTML comments are unbalanced before transformation.');
assert(styleBlocks.length === 7, `Expected 7 actual inline style blocks, found ${styleBlocks.length}`);
assert(inlineScripts.length === 2, `Expected 2 classic inline script blocks, found ${inlineScripts.length}`);

for (const block of styleBlocks) {
  const id = getAttr(block.attrs, 'id');
  if (!id) continue;
  assert(count(original, id) === 1, `Style id ${id} is referenced outside its style block; aborting split.`);
}

for (const block of inlineScripts) {
  assert(!/\bdocument\.currentScript\b/.test(block.body), 'document.currentScript detected in inline JavaScript; aborting split.');
}

const firstInlineEnd = inlineScripts[0].index + inlineScripts[0].length;
const secondInlineStart = inlineScripts[1].index;
const betweenScripts = original.slice(firstInlineEnd, secondInlineStart);
assert(
  /<script\b[^>]*\bsrc=["']new_ext-pages\.js["'][^>]*><\/script>/i.test(maskHtmlComments(betweenScripts)),
  'Expected new_ext-pages.js between the two inline script blocks.'
);

const css = styleBlocks
  .map((block, index) => {
    const attrs = block.attrs.trim();
    const label = attrs
      ? `/* original style block ${index + 1}: ${attrs} */`
      : `/* original style block ${index + 1} */`;
    return `${label}\n${block.body.trim()}\n`;
  })
  .join('\n');
const coreJs = `${inlineScripts[0].body.trim()}\n`;
const postJs = `${inlineScripts[1].body.trim()}\n`;

let transformed = replaceBlocks(
  original,
  styleBlocks,
  styleBlocks.map((_, index) => index === 0 ? '<link rel="stylesheet" href="index.css">' : '')
);

const transformedScripts = collectTagBlocks('script', transformed);
const transformedInlineScripts = transformedScripts.filter(isClassicInlineScript);
assert(transformedInlineScripts.length === 2, `Expected 2 inline scripts after style extraction, found ${transformedInlineScripts.length}`);
transformed = replaceBlocks(
  transformed,
  transformedInlineScripts,
  ['<script src="index-core.js"></script>', '<script src="index-post.js"></script>']
);

assert(count(transformed, '<!--') === count(transformed, '-->'), 'HTML comments became unbalanced after transformation.');
assert(collectTagBlocks('style', transformed).length === 0, 'Actual inline style blocks remain after transformation.');
assert(
  collectTagBlocks('script', transformed).filter(isClassicInlineScript).length === 0,
  'Classic inline script blocks remain after transformation.'
);
assert(transformed.includes('href="index.css"'), 'index.css reference missing after transformation.');
assert(transformed.includes('src="index-core.js"'), 'index-core.js reference missing after transformation.');
assert(transformed.includes('src="index-post.js"'), 'index-post.js reference missing after transformation.');

const corePos = transformed.indexOf('src="index-core.js"');
const extPos = transformed.indexOf('src="new_ext-pages.js"');
const postPos = transformed.indexOf('src="index-post.js"');
assert(corePos >= 0 && extPos > corePos && postPos > extPos, 'Script execution order changed during transformation.');
assert(/<head>[\s\S]*<\/head>\s*<body>/i.test(maskHtmlComments(transformed)), 'Head/body structure is invalid after transformation.');

fs.writeFileSync(CSS, css, 'utf8');
fs.writeFileSync(CORE_JS, coreJs, 'utf8');
fs.writeFileSync(POST_JS, postJs, 'utf8');
fs.writeFileSync(INDEX, transformed, 'utf8');

console.log(JSON.stringify({
  before: {
    indexBytes: Buffer.byteLength(original),
    actualInlineStyleBlocks: styleBlocks.length,
    inlineStyleBytes: styleBlocks.reduce((sum, block) => sum + Buffer.byteLength(block.full), 0),
    inlineScriptBlocks: inlineScripts.length,
    inlineScriptBytes: inlineScripts.reduce((sum, block) => sum + Buffer.byteLength(block.full), 0),
    htmlComments: count(original, '<!--')
  },
  after: {
    indexBytes: Buffer.byteLength(transformed),
    cssBytes: Buffer.byteLength(css),
    coreJsBytes: Buffer.byteLength(coreJs),
    postJsBytes: Buffer.byteLength(postJs),
    htmlComments: count(transformed, '<!--')
  }
}, null, 2));
